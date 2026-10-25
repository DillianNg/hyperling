-- 0006 — a learner's own sentences, alongside the imported curriculum.
--
-- The learner studies sentences they met outside the app. Rather than build a
-- second content store with its own scheduler, session builder and statistics,
-- their sentences become ordinary rows in `items`, marked by `owner_id`. The
-- whole engine — FSRS, buildSession, the word list, the dashboard — then works
-- on them without knowing they were not imported.
--
-- Three things that makes necessary, and this migration does all three:
--   1. ownership on the content tables, so the rows can be told apart;
--   2. uniqueness per owner, because course-wide numbering collides once two
--      learners both number their first sentence 1;
--   3. RLS that keeps one learner's sentences out of every other learner's
--      reach — today's policy is `using (true)`, which would publish them.

-- --- 1. ownership -----------------------------------------------------------

-- Null means content imported from content/<lang>/<course>/; non-null means a
-- row this learner wrote. Deleting the account takes their sentences with it.
alter table public.items
  add column owner_id uuid references auth.users (id) on delete cascade;

alter table public.glossary_terms
  add column owner_id uuid references auth.users (id) on delete cascade;

create index items_owner_idx
  on public.items (owner_id, course_id, order_index)
  where owner_id is not null;

create index glossary_terms_owner_idx
  on public.glossary_terms (owner_id, course_id)
  where owner_id is not null;

-- Courses split into the curriculum a learner can enrol in and the private
-- container that holds their own sentences. Onboarding offers only the former,
-- so the notebook never appears as something to "start learning".
alter table public.courses
  add column kind text not null default 'curriculum';

alter table public.courses
  add constraint courses_kind_check check (kind in ('curriculum', 'notebook'));

-- --- 2. uniqueness per owner ------------------------------------------------

-- The old constraints are course-wide. They are exactly right for imported
-- content, where `order_index` is the teaching order of the one true sequence,
-- and exactly wrong for notebooks, where every learner starts again at 1.
--
-- Splitting them into partial indexes keeps the imported guarantee bit for bit
-- (same columns, same scope, just restricted to owner_id is null) and gives
-- each learner an independent numbering. A plain `unique (course_id, owner_id,
-- order_index)` would NOT do: Postgres treats nulls as distinct, so it would
-- silently permit two imported items to share an order_index.
alter table public.items drop constraint items_stable_key_unique;
alter table public.items drop constraint items_order_index_unique;
alter table public.glossary_terms drop constraint glossary_terms_unique;

create unique index items_stable_key_curriculum_unique
  on public.items (course_id, stable_key) where owner_id is null;
create unique index items_order_index_curriculum_unique
  on public.items (course_id, order_index) where owner_id is null;
create unique index glossary_terms_curriculum_unique
  on public.glossary_terms (course_id, term, meaning) where owner_id is null;

create unique index items_stable_key_owner_unique
  on public.items (course_id, owner_id, stable_key) where owner_id is not null;
create unique index items_order_index_owner_unique
  on public.items (course_id, owner_id, order_index) where owner_id is not null;
create unique index glossary_terms_owner_unique
  on public.glossary_terms (course_id, owner_id, term, meaning) where owner_id is not null;

-- --- 3. the notebook course -------------------------------------------------

-- The notebook has no CEFR level: the learner is not asked to grade a sentence
-- they picked up in the wild, and guessing one for them would be inventing
-- data. It gets its own framework so no CEFR ordering is implied.
insert into public.levels (framework, code, ord) values ('PERSONAL', 'PERSONAL', 0)
on conflict (framework, code) do nothing;

-- field_schema and tts are copied from the German course rather than written
-- out again here, so the notebook renders a sentence exactly as the curriculum
-- does — same IPA hint, same noun-gender badge — and cannot drift from it.
insert into public.courses (
  id, version, kind, title, description,
  target_language, source_language,
  level_framework, level_from, level_to, levels,
  primary_item_kind, field_schema, tts
)
select
  'de-personal',
  '1.0.0',
  'notebook',
  '{"vi": "Sổ tay của tôi — tiếng Đức", "en": "My notebook — German"}'::jsonb,
  '{"vi": "Những câu tiếng Đức bạn tự thêm vào, học và ôn cùng một engine với khóa chính.", "en": "German sentences you added yourself, studied and reviewed by the same engine as the main course."}'::jsonb,
  c.target_language,
  c.source_language,
  'PERSONAL', 'PERSONAL', 'PERSONAL', array['PERSONAL'],
  c.primary_item_kind,
  c.field_schema,
  c.tts
from public.courses c
where c.id = 'de-a1-b2'
on conflict (id) do nothing;

-- --- 4. RLS -----------------------------------------------------------------

-- Replaces `using (true)`. Imported content stays readable by everyone signed
-- in; a learner's own rows are readable only by them.
drop policy "items are readable when signed in" on public.items;
create policy "items are readable when imported or owned"
  on public.items for select to authenticated
  using (owner_id is null or owner_id = auth.uid());

drop policy "glossary terms are readable when signed in" on public.glossary_terms;
create policy "glossary terms are readable when imported or owned"
  on public.glossary_terms for select to authenticated
  using (owner_id is null or owner_id = auth.uid());

-- Writes are new: until now no authenticated role could write content at all.
-- Each policy pins owner_id to auth.uid() on the row itself, so a client cannot
-- claim another learner's ownership and cannot hand a row away by updating it.
create policy "learners insert their own items"
  on public.items for insert to authenticated
  with check (owner_id = auth.uid());
create policy "learners update their own items"
  on public.items for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "learners delete their own items"
  on public.items for delete to authenticated
  using (owner_id = auth.uid());

create policy "learners insert their own glossary terms"
  on public.glossary_terms for insert to authenticated
  with check (owner_id = auth.uid());
create policy "learners update their own glossary terms"
  on public.glossary_terms for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "learners delete their own glossary terms"
  on public.glossary_terms for delete to authenticated
  using (owner_id = auth.uid());

-- The link table carries no owner of its own: a link is the learner's exactly
-- when both ends are. Reading stays open because both ends are already
-- filtered by the policies above, so a link to someone else's item resolves to
-- nothing anyway.
create policy "learners link their own items and terms"
  on public.item_glossary for insert to authenticated
  with check (
    exists (select 1 from public.items i where i.id = item_id and i.owner_id = auth.uid())
    and exists (select 1 from public.glossary_terms g where g.id = term_id and g.owner_id = auth.uid())
  );
create policy "learners unlink their own items"
  on public.item_glossary for delete to authenticated
  using (exists (select 1 from public.items i where i.id = item_id and i.owner_id = auth.uid()));

-- --- 5. grants --------------------------------------------------------------

-- Migration 0003 deliberately gave the content tables SELECT only, so that a
-- write was refused by privilege as well as by policy. That posture changes
-- here, for these three tables only: a learner now has a legitimate reason to
-- write content, and the policies above are what bound it to their own rows.
--
-- Without these grants the policies alone are not enough: Postgres refuses the
-- statement with "permission denied for table items" before any policy is
-- consulted, so the notebook would fail outright rather than leak anything.
grant insert, update, delete on public.items, public.glossary_terms to authenticated;
grant insert, delete on public.item_glossary to authenticated;

-- `courses`, `languages` and `levels` stay read-only: the notebook course is
-- provisioned by the import script under the service role, never by a client.
