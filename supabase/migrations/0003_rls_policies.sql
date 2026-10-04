-- =============================================================================
-- 0003_rls_policies.sql
-- Row Level Security.
--
-- Two rules govern everything here:
--   1. Course content is readable by any signed-in user and writable by nobody
--      through the API. Imports run with the service role, which bypasses RLS.
--   2. Learner data is readable and writable only by its owner. There is no
--      policy that lets one user see another's rows, not even read-only.
--
-- Ownership is always derived from auth.uid() directly on the row, never from a
-- client-supplied value, so a forged user_id in a request cannot widen access.
-- =============================================================================

-- --- content: read-only for authenticated users ------------------------------

alter table public.languages      enable row level security;
alter table public.levels         enable row level security;
alter table public.courses        enable row level security;
alter table public.items          enable row level security;
alter table public.glossary_terms enable row level security;
alter table public.item_glossary  enable row level security;

create policy "languages are readable when signed in"
  on public.languages for select to authenticated using (true);

create policy "levels are readable when signed in"
  on public.levels for select to authenticated using (true);

create policy "courses are readable when signed in"
  on public.courses for select to authenticated using (true);

create policy "items are readable when signed in"
  on public.items for select to authenticated using (true);

create policy "glossary terms are readable when signed in"
  on public.glossary_terms for select to authenticated using (true);

create policy "item glossary links are readable when signed in"
  on public.item_glossary for select to authenticated using (true);

-- No insert/update/delete policies exist for the tables above. With RLS enabled
-- and no permissive policy, every write through anon/authenticated is denied.

-- --- profiles ----------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "own profile is readable"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "own profile is updatable"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Insert is normally done by the on_auth_user_created trigger; this covers the
-- case of a user created before the trigger existed.
create policy "own profile is insertable"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

-- --- enrollments -------------------------------------------------------------

alter table public.enrollments enable row level security;

create policy "own enrollments are readable"
  on public.enrollments for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own enrollments are insertable"
  on public.enrollments for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "own enrollments are updatable"
  on public.enrollments for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own enrollments are deletable"
  on public.enrollments for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- daily_plans -------------------------------------------------------------
-- daily_plans has no user_id of its own; ownership comes from its enrollment.

alter table public.daily_plans enable row level security;

create policy "own daily plans are readable"
  on public.daily_plans for select to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      where e.id = daily_plans.enrollment_id and e.user_id = (select auth.uid())
    )
  );

create policy "own daily plans are insertable"
  on public.daily_plans for insert to authenticated
  with check (
    exists (
      select 1 from public.enrollments e
      where e.id = daily_plans.enrollment_id and e.user_id = (select auth.uid())
    )
  );

create policy "own daily plans are updatable"
  on public.daily_plans for update to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      where e.id = daily_plans.enrollment_id and e.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.enrollments e
      where e.id = daily_plans.enrollment_id and e.user_id = (select auth.uid())
    )
  );

create policy "own daily plans are deletable"
  on public.daily_plans for delete to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      where e.id = daily_plans.enrollment_id and e.user_id = (select auth.uid())
    )
  );

-- --- card_states -------------------------------------------------------------

alter table public.card_states enable row level security;

create policy "own card states are readable"
  on public.card_states for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own card states are insertable"
  on public.card_states for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "own card states are updatable"
  on public.card_states for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own card states are deletable"
  on public.card_states for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- review_logs: append-only ------------------------------------------------
-- Deliberately no update or delete policy: the review history is evidence of
-- what happened and must stay immutable, even for its owner.

alter table public.review_logs enable row level security;

create policy "own review logs are readable"
  on public.review_logs for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own review logs are insertable"
  on public.review_logs for insert to authenticated
  with check (user_id = (select auth.uid()));

-- --- study_sessions ----------------------------------------------------------

alter table public.study_sessions enable row level security;

create policy "own study sessions are readable"
  on public.study_sessions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own study sessions are insertable"
  on public.study_sessions for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "own study sessions are updatable"
  on public.study_sessions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- --- item_flags --------------------------------------------------------------

alter table public.item_flags enable row level security;

create policy "own item flags are readable"
  on public.item_flags for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own item flags are insertable"
  on public.item_flags for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "own item flags are updatable"
  on public.item_flags for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own item flags are deletable"
  on public.item_flags for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- grants ------------------------------------------------------------------
-- RLS decides row visibility; grants decide which statements are reachable at
-- all. Content tables get SELECT only, so a write is refused by privilege as
-- well as by policy.

grant select on public.languages, public.levels, public.courses, public.items,
                 public.glossary_terms, public.item_glossary
  to authenticated;

grant select, insert, update, delete on
  public.profiles, public.enrollments, public.daily_plans,
  public.card_states, public.study_sessions, public.item_flags
  to authenticated;

grant select, insert on public.review_logs to authenticated;
grant usage, select on sequence public.review_logs_id_seq to authenticated;

-- The anonymous role reaches nothing: everything requires a signed-in user.
revoke all on all tables in schema public from anon;
