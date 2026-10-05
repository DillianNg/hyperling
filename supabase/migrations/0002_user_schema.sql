-- =============================================================================
-- 0002_user_schema.sql
-- Per-learner data. Every table here is guarded by RLS in 0003.
-- =============================================================================

-- --- profiles ----------------------------------------------------------------

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text,
  display_name    text,
  ui_locale       text not null default 'vi',
  -- IANA zone, e.g. 'Asia/Ho_Chi_Minh'. Everything is stored UTC and rendered
  -- in this zone, so "today" means the learner's today, not the server's.
  timezone        text not null default 'Asia/Ho_Chi_Minh',
  theme           text not null default 'system',
  font_scale      numeric(3, 2) not null default 1.00,
  reduced_motion  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint profiles_theme_check check (theme in ('light', 'dark', 'system')),
  constraint profiles_font_scale_range check (font_scale between 0.80 and 1.60),
  constraint profiles_ui_locale_check check (ui_locale in ('vi', 'en'))
);

-- A profile must exist the moment a user signs in, with no app-side round trip.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- enrollments -------------------------------------------------------------

create table public.enrollments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  course_id         text not null references public.courses (id) on delete restrict,
  level_from        text not null,
  level_to          text not null,
  start_date        date not null,
  target_date       date not null,
  new_per_day       smallint not null,
  -- ISO weekdays the learner does not study: 1 = Monday ... 7 = Sunday.
  rest_weekdays     smallint[] not null default '{}',
  buffer_days       smallint not null,
  timezone          text not null default 'Asia/Ho_Chi_Minh',
  -- Which of the three session stages are switched on, e.g.
  -- {"review": true, "learn": true, "consolidate": true}.
  stage_flags       jsonb not null default '{"review": true, "learn": true, "consolidate": true}'::jsonb,
  status            text not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint enrollments_status_check check (status in ('active', 'paused', 'done', 'abandoned')),
  constraint enrollments_dates_ordered check (target_date >= start_date),
  constraint enrollments_new_per_day_range check (new_per_day between 1 and 20),
  constraint enrollments_buffer_days_range check (buffer_days between 0 and 60)
);

-- A learner may run several courses in parallel, but only one active enrollment
-- per course, so "today's plan" is never ambiguous.
create unique index enrollments_one_active_per_course
  on public.enrollments (user_id, course_id)
  where status = 'active';

create index enrollments_user_idx on public.enrollments (user_id, status);

-- --- daily plans -------------------------------------------------------------

create table public.daily_plans (
  enrollment_id       uuid not null references public.enrollments (id) on delete cascade,
  plan_date           date not null,
  day_index           integer not null,
  planned_new         smallint not null,
  completed_new       smallint not null default 0,
  completed_reviews   smallint not null default 0,
  is_rest_day         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (enrollment_id, plan_date),
  constraint daily_plans_day_index_positive check (day_index > 0),
  constraint daily_plans_planned_new_nonneg check (planned_new >= 0)
);

create index daily_plans_date_idx on public.daily_plans (enrollment_id, day_index);

-- --- FSRS card state ---------------------------------------------------------

create table public.card_states (
  user_id         uuid not null references auth.users (id) on delete cascade,
  item_id         uuid not null references public.items (id) on delete cascade,
  enrollment_id   uuid not null references public.enrollments (id) on delete cascade,
  -- FSRS card, mirroring the ts-fsrs Card shape one-to-one.
  due             timestamptz not null,
  stability       double precision not null default 0,
  difficulty      double precision not null default 0,
  elapsed_days    integer not null default 0,
  scheduled_days  integer not null default 0,
  learning_steps  smallint not null default 0,
  reps            integer not null default 0,
  lapses          integer not null default 0,
  -- 0 New, 1 Learning, 2 Review, 3 Relearning (ts-fsrs State).
  state           smallint not null default 0,
  last_review     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, item_id),
  constraint card_states_state_check check (state between 0 and 3)
);

-- The hot path: "which cards are due for me today?". Partial index skips New
-- cards, which are driven by the plan rather than by a due date.
create index card_states_due_idx
  on public.card_states (user_id, enrollment_id, due)
  where state <> 0;

create index card_states_enrollment_idx on public.card_states (enrollment_id, state);

-- --- review log (append-only) ------------------------------------------------

create table public.review_logs (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references auth.users (id) on delete cascade,
  item_id             uuid not null references public.items (id) on delete cascade,
  enrollment_id       uuid not null references public.enrollments (id) on delete cascade,
  session_id          uuid,
  -- 1 Again, 2 Hard, 3 Good, 4 Easy.
  rating              smallint not null,
  exercise_kind       text not null default 'flip',
  is_correct          boolean,
  duration_ms         integer,
  reviewed_at         timestamptz not null default now(),
  -- Card snapshot BEFORE this review, so the whole history can be replayed if
  -- the scheduler is ever retuned.
  state_before        smallint not null,
  stability_before    double precision,
  difficulty_before   double precision,
  elapsed_days        integer,
  scheduled_days      integer,
  due_before          timestamptz,
  constraint review_logs_rating_check check (rating between 1 and 4),
  constraint review_logs_exercise_kind_check check (exercise_kind in ('flip', 'mcq', 'type', 'cloze')),
  constraint review_logs_duration_sane check (duration_ms is null or duration_ms between 0 and 600000)
);

create index review_logs_user_time_idx on public.review_logs (user_id, reviewed_at desc);
create index review_logs_enrollment_time_idx on public.review_logs (enrollment_id, reviewed_at desc);
create index review_logs_item_idx on public.review_logs (user_id, item_id, reviewed_at desc);

-- --- study sessions ----------------------------------------------------------

create table public.study_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  enrollment_id   uuid not null references public.enrollments (id) on delete cascade,
  session_date    date not null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  -- {"review": {"done": 12}, "learn": {"done": 20}, "consolidate": {"done": 20}}
  counts          jsonb not null default '{}'::jsonb,
  accuracy        numeric(4, 3),
  duration_ms     integer,
  constraint study_sessions_accuracy_range check (accuracy is null or accuracy between 0 and 1)
);

create index study_sessions_user_date_idx on public.study_sessions (user_id, session_date desc);

-- --- learner flags on items --------------------------------------------------

create table public.item_flags (
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     uuid not null references public.items (id) on delete cascade,
  is_hard     boolean not null default false,
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, item_id),
  constraint item_flags_note_length check (note is null or length(note) <= 2000)
);

create index item_flags_hard_idx on public.item_flags (user_id) where is_hard;

-- --- updated_at triggers -----------------------------------------------------

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger enrollments_touch_updated_at before update on public.enrollments
  for each row execute function public.touch_updated_at();
create trigger daily_plans_touch_updated_at before update on public.daily_plans
  for each row execute function public.touch_updated_at();
create trigger card_states_touch_updated_at before update on public.card_states
  for each row execute function public.touch_updated_at();
create trigger item_flags_touch_updated_at before update on public.item_flags
  for each row execute function public.touch_updated_at();
