-- =============================================================================
-- 0001_content_schema.sql
-- Course content: shared, read-only for signed-in users, written only by the
-- import script running with the service role.
-- =============================================================================

-- gen_random_uuid() is built into Postgres 13+, so no extension is needed.

-- --- reference data ----------------------------------------------------------

create table public.languages (
  code          text primary key,
  name_native   text not null,
  name_vi       text not null,
  name_en       text,
  -- BCP-47 tag handed to the speech engine, e.g. 'de-DE'. Null = no TTS yet.
  tts_lang      text,
  created_at    timestamptz not null default now()
);

comment on table public.languages is 'Languages the system can teach or explain in. Adding one is a data change, not a code change.';

create table public.levels (
  framework     text not null default 'CEFR',
  code          text not null,
  ord           smallint not null,
  primary key (framework, code),
  constraint levels_ord_positive check (ord >= 0)
);

comment on column public.levels.ord is 'Ascending teaching order. Comparisons use this, never string ordering.';

-- --- courses -----------------------------------------------------------------

create table public.courses (
  -- Slug equal to the content folder name, e.g. 'de-a1-b2'. Stable forever:
  -- enrollments reference it, so renaming would orphan learner progress.
  id                text primary key,
  version           text not null,
  schema_version    smallint not null default 1,
  title             jsonb not null,
  description       jsonb,
  target_language   text not null references public.languages (code),
  source_language   text not null references public.languages (code),
  level_framework   text not null default 'CEFR',
  level_from        text not null,
  level_to          text not null,
  -- Levels the course intends to cover. Content may legitimately lag behind;
  -- onboarding only offers levels that actually have items.
  levels            text[] not null,
  primary_item_kind text not null,
  -- Field plugin declarations. The engine reads these instead of hardcoding
  -- per-language behaviour such as noun gender or transliteration.
  field_schema      jsonb not null,
  tts               jsonb,
  source            jsonb,
  published_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint courses_primary_item_kind_check check (primary_item_kind in ('sentence', 'word', 'phrase')),
  constraint courses_levels_not_empty check (cardinality(levels) > 0),
  foreign key (level_framework, level_from) references public.levels (framework, code),
  foreign key (level_framework, level_to) references public.levels (framework, code)
);

create table public.items (
  id            uuid primary key default gen_random_uuid(),
  course_id     text not null references public.courses (id) on delete cascade,
  -- Carried over from the source spreadsheet ('S0001'). Import upserts on this,
  -- so re-importing updated content never breaks existing card_states.
  stable_key    text not null,
  kind          text not null,
  level_code    text not null,
  topic         text not null,
  -- Teaching order within the course, 1-based. The planner maps it to dates;
  -- the content itself carries no dates, so two learners can run different plans.
  order_index   integer not null,
  fields        jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint items_kind_check check (kind in ('sentence', 'word', 'phrase')),
  constraint items_order_index_positive check (order_index > 0),
  constraint items_stable_key_unique unique (course_id, stable_key),
  constraint items_order_index_unique unique (course_id, order_index)
);

create index items_course_order_idx on public.items (course_id, order_index);
create index items_course_level_idx on public.items (course_id, level_code, order_index);

-- --- glossary ----------------------------------------------------------------

create table public.glossary_terms (
  id              uuid primary key default gen_random_uuid(),
  course_id       text not null references public.courses (id) on delete cascade,
  term            text not null,
  meaning         text not null,
  part_of_speech  text not null default 'other',
  -- Per-language extras declared by course.glossaryFields, e.g. {"gender":"der"}.
  fields          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  -- The same word can carry different meanings in different contexts, so the
  -- identity of a term is the (term, meaning) pair, not the word alone.
  constraint glossary_terms_unique unique (course_id, term, meaning)
);

create index glossary_terms_course_term_idx on public.glossary_terms (course_id, term);

create table public.item_glossary (
  item_id   uuid not null references public.items (id) on delete cascade,
  term_id   uuid not null references public.glossary_terms (id) on delete cascade,
  ord       smallint not null default 0,
  primary key (item_id, term_id)
);

create index item_glossary_term_idx on public.item_glossary (term_id);

-- --- updated_at ---------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger courses_touch_updated_at before update on public.courses
  for each row execute function public.touch_updated_at();

create trigger items_touch_updated_at before update on public.items
  for each row execute function public.touch_updated_at();

-- --- seed reference rows -----------------------------------------------------

insert into public.levels (framework, code, ord) values
  ('CEFR', 'A0', 0),
  ('CEFR', 'A1', 1),
  ('CEFR', 'A2', 2),
  ('CEFR', 'B1', 3),
  ('CEFR', 'B2', 4),
  ('CEFR', 'C1', 5),
  ('CEFR', 'C2', 6)
on conflict (framework, code) do nothing;

insert into public.languages (code, name_native, name_vi, name_en, tts_lang) values
  ('de', 'Deutsch',     'Tiếng Đức',   'German',     'de-DE'),
  ('vi', 'Tiếng Việt',  'Tiếng Việt',  'Vietnamese', 'vi-VN'),
  ('en', 'English',     'Tiếng Anh',   'English',    'en-US')
on conflict (code) do nothing;
