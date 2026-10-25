import 'server-only';
import { row } from './rows';
import { fetchAllRows } from './paginate';
import { createClient } from '@/lib/supabase/server';
import { createEnrollment, listEnrollments, type Enrollment } from './enrollments';
import { MAX_NEW_PER_DAY } from '@/config/app.config';
import {
  NOTEBOOK_COURSE_ID_BY_LANGUAGE,
  NOTEBOOK_DEFAULT_TOPIC,
  NOTEBOOK_LEVEL,
  notebookFields,
  notebookStableKey,
  type NotebookItemInput,
} from '@/core/content/notebook';

/**
 * The learner's own sentences: reading, writing and the enrollment that holds
 * their review schedule.
 *
 * Every write here goes through RLS with the learner's own session, and the
 * policies pin `owner_id` to `auth.uid()` on the row itself (migration 0006).
 * So `owner_id` is set on insert because the policy demands it, not as the
 * security boundary — a client that lied about it would simply be rejected.
 */

export type NotebookResult = { ok: true; id: string } | { ok: false; error: string };

/** How many attempts to claim the next order index before giving up. */
const ORDER_INDEX_ATTEMPTS = 5;

export function notebookCourseIdFor(targetLanguage: string): string | null {
  return NOTEBOOK_COURSE_ID_BY_LANGUAGE[targetLanguage] ?? null;
}

/**
 * The notebook enrollment for one course, created on first use.
 *
 * Its plan columns are placeholders: `start_date = target_date = today` and
 * `new_per_day = MAX_NEW_PER_DAY`. Nothing reads them, because
 * `getTodaySession` branches on `enrollment.kind` and never runs the planner on
 * a notebook — see the note on `Enrollment.kind`. They are written only because
 * the table's check constraints require values.
 */
export async function ensureNotebookEnrollment(args: {
  userId: string;
  notebookCourseId: string;
  timezone: string;
  today: Enrollment['startDate'];
}): Promise<{ ok: true; enrollment: Enrollment } | { ok: false; error: string }> {
  const existing = await getNotebookEnrollment(args.notebookCourseId);
  if (existing) return { ok: true, enrollment: existing };

  const created = await createEnrollment({
    userId: args.userId,
    courseId: args.notebookCourseId,
    levelFrom: NOTEBOOK_LEVEL,
    levelTo: NOTEBOOK_LEVEL,
    startDate: args.today,
    targetDate: args.today,
    newPerDay: MAX_NEW_PER_DAY,
    restWeekdays: [],
    bufferDays: 0,
    timezone: args.timezone,
  });

  if (!created.ok) return { ok: false, error: created.error };

  // Re-read rather than construct, so `kind` comes from the course row like
  // everywhere else and a mismatch surfaces here instead of in a session.
  const enrollment = await getNotebookEnrollment(args.notebookCourseId);
  return enrollment
    ? { ok: true, enrollment }
    : { ok: false, error: 'Đã tạo sổ tay nhưng không đọc lại được.' };
}

export async function getNotebookEnrollment(notebookCourseId: string): Promise<Enrollment | null> {
  const enrollments = await listEnrollments('active');
  return enrollments.find((item) => item.courseId === notebookCourseId) ?? null;
}

export interface NotebookItem {
  id: string;
  stableKey: string;
  orderIndex: number;
  topic: string;
  text: string;
  meaning: string;
  transliteration: string | null;
  grammarNote: string | null;
  glossary: Array<{ term: string; meaning: string; partOfSpeech: string; gender: string | null }>;
  /** Review progress, absent until the sentence has been studied once. */
  reps: number;
  lapses: number;
  createdAt: string;
}

interface NotebookItemRow {
  id: string;
  stable_key: string;
  order_index: number;
  topic: string;
  fields: Record<string, string>;
  created_at: string;
  item_glossary?: Array<{
    ord: number;
    glossary_terms: {
      term: string;
      meaning: string;
      part_of_speech: string;
      fields: Record<string, string>;
    } | null;
  }>;
}

const NOTEBOOK_SELECT =
  'id, stable_key, order_index, topic, fields, created_at, ' +
  'item_glossary(ord, glossary_terms(term, meaning, part_of_speech, fields))';

/**
 * Every sentence in the learner's notebook, newest first.
 *
 * Paged: a notebook grows without bound, and a clipped read would make
 * sentences disappear from the list while still appearing in sessions
 * (principle 9). RLS already restricts this to the learner's own rows; the
 * explicit `owner_id` filter keeps the query honest if a policy is ever
 * loosened.
 */
export async function listNotebookItems(args: {
  userId: string;
  notebookCourseId: string;
  enrollmentId: string | null;
}): Promise<NotebookItem[]> {
  const supabase = await createClient();

  const itemRows = await fetchAllRows<NotebookItemRow>((from, to) =>
    supabase
      .from('items')
      .select(NOTEBOOK_SELECT)
      .eq('course_id', args.notebookCourseId)
      .eq('owner_id', args.userId)
      .order('order_index', { ascending: false })
      .range(from, to),
  );

  if (itemRows.length === 0) return [];

  const progress = args.enrollmentId
    ? await fetchAllRows<{ item_id: string; reps: number; lapses: number }>((from, to) =>
        supabase
          .from('card_states')
          .select('item_id, reps, lapses')
          .eq('enrollment_id', args.enrollmentId)
          .range(from, to),
      )
    : [];

  const byItem = new Map(progress.map((card) => [card.item_id, card]));

  return itemRows.map((item) => {
    const card = byItem.get(item.id);
    return {
      id: item.id,
      stableKey: item.stable_key,
      orderIndex: item.order_index,
      topic: item.topic,
      text: item.fields.text ?? '',
      meaning: item.fields.meaning ?? '',
      transliteration: item.fields.transliteration ?? null,
      grammarNote: item.fields.grammarNote ?? null,
      glossary: (item.item_glossary ?? [])
        .slice()
        .sort((a, b) => a.ord - b.ord)
        .flatMap((link) =>
          link.glossary_terms
            ? [
                {
                  term: link.glossary_terms.term,
                  meaning: link.glossary_terms.meaning,
                  partOfSpeech: link.glossary_terms.part_of_speech,
                  gender: link.glossary_terms.fields?.gender ?? null,
                },
              ]
            : [],
        ),
      reps: card?.reps ?? 0,
      lapses: card?.lapses ?? 0,
      createdAt: item.created_at,
    };
  });
}

export async function countNotebookItems(args: {
  userId: string;
  notebookCourseId: string;
}): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', args.notebookCourseId)
    .eq('owner_id', args.userId);

  return error ? 0 : (count ?? 0);
}

/**
 * Adds one sentence.
 *
 * `order_index` is claimed by reading the learner's current maximum and adding
 * one. Two sentences added at the same moment would both claim it and the
 * partial unique index rejects the loser, so the claim is retried rather than
 * surfaced — the learner did nothing wrong.
 */
export async function createNotebookItem(args: {
  userId: string;
  notebookCourseId: string;
  input: NotebookItemInput;
}): Promise<NotebookResult> {
  const supabase = await createClient();
  const { userId, notebookCourseId, input } = args;

  for (let attempt = 0; attempt < ORDER_INDEX_ATTEMPTS; attempt += 1) {
    const orderIndex = (await maxOrderIndex(userId, notebookCourseId)) + 1;

    const { data, error } = await supabase
      .from('items')
      .insert({
        course_id: notebookCourseId,
        owner_id: userId,
        stable_key: notebookStableKey(orderIndex),
        kind: 'sentence',
        level_code: NOTEBOOK_LEVEL,
        topic: input.topic ?? NOTEBOOK_DEFAULT_TOPIC,
        order_index: orderIndex,
        fields: notebookFields(input),
      })
      .select('id')
      .single();

    if (error) {
      // 23505 = unique_violation: another insert took this index first.
      if (error.code === '23505') continue;
      return { ok: false, error: `Không thêm được câu: ${error.message}` };
    }

    const created = row<{ id: string }>(data);
    if (!created) return { ok: false, error: 'Đã thêm câu nhưng không đọc lại được.' };

    await replaceGlossary({ userId, notebookCourseId, itemId: created.id, input });
    return { ok: true, id: created.id };
  }

  return { ok: false, error: 'Có quá nhiều câu được thêm cùng lúc. Hãy thử lại.' };
}

/**
 * Edits one sentence in place.
 *
 * The item id never changes, so `card_states` and every review already logged
 * against this sentence survive the edit — the same guarantee re-importing
 * content gives (principle 5).
 */
export async function updateNotebookItem(args: {
  userId: string;
  notebookCourseId: string;
  itemId: string;
  input: NotebookItemInput;
}): Promise<NotebookResult> {
  const supabase = await createClient();
  const { userId, notebookCourseId, itemId, input } = args;

  const { error } = await supabase
    .from('items')
    .update({
      topic: input.topic ?? NOTEBOOK_DEFAULT_TOPIC,
      fields: notebookFields(input),
    })
    .eq('id', itemId)
    .eq('owner_id', userId);

  if (error) return { ok: false, error: `Không sửa được câu: ${error.message}` };

  await replaceGlossary({ userId, notebookCourseId, itemId, input });
  return { ok: true, id: itemId };
}

/**
 * Removes one sentence and everything recorded against it.
 *
 * Unlike resetting a plan, this is the learner deleting something they wrote,
 * so the review history of that one sentence goes with it — cascade from
 * `items` carries `card_states`, `review_logs`, `item_flags` and the glossary
 * links. Orphaned glossary terms are left behind: they are shared between
 * sentences, so deleting one sentence must not empty another's notes.
 */
export async function deleteNotebookItem(args: {
  userId: string;
  itemId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', args.itemId)
    .eq('owner_id', args.userId);

  return error ? { ok: false, error: `Không xoá được câu: ${error.message}` } : { ok: true };
}

async function maxOrderIndex(userId: string, notebookCourseId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('items')
    .select('order_index')
    .eq('course_id', notebookCourseId)
    .eq('owner_id', userId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  return row<{ order_index: number }>(data)?.order_index ?? 0;
}

/**
 * Rewrites one sentence's glossary links to exactly what was submitted.
 *
 * Terms are looked up before being inserted rather than upserted: the
 * uniqueness of a learner's term is a *partial* index, and Postgres cannot use
 * a partial index as an `on conflict` target at all.
 */
async function replaceGlossary(args: {
  userId: string;
  notebookCourseId: string;
  itemId: string;
  input: NotebookItemInput;
}): Promise<void> {
  const supabase = await createClient();
  const { userId, notebookCourseId, itemId, input } = args;

  await supabase.from('item_glossary').delete().eq('item_id', itemId);
  if (input.glossary.length === 0) return;

  let ord = 0;
  for (const entry of input.glossary) {
    const { data: found } = await supabase
      .from('glossary_terms')
      .select('id')
      .eq('course_id', notebookCourseId)
      .eq('owner_id', userId)
      .eq('term', entry.term)
      .eq('meaning', entry.meaning)
      .maybeSingle();

    let termId = row<{ id: string }>(found)?.id ?? null;

    if (!termId) {
      const { data: inserted } = await supabase
        .from('glossary_terms')
        .insert({
          course_id: notebookCourseId,
          owner_id: userId,
          term: entry.term,
          meaning: entry.meaning,
          part_of_speech: entry.partOfSpeech,
          fields: entry.fields,
        })
        .select('id')
        .single();

      termId = row<{ id: string }>(inserted)?.id ?? null;
    }

    // A term that could not be stored is skipped rather than failing the whole
    // sentence: the sentence itself is the thing the learner wanted saved.
    if (!termId) continue;

    await supabase.from('item_glossary').insert({ item_id: itemId, term_id: termId, ord });
    ord += 1;
  }
}

export interface StudyScope {
  /** Enrollments whose activity counts as one effort. */
  enrollmentIds: string[];
  /** Courses those enrollments draw items from. */
  courseIds: string[];
  /** The notebook paired with this course, if the learner has started one. */
  notebook: Enrollment | null;
}

/**
 * A curriculum enrollment together with the learner's notebook for the same
 * language, treated as one effort.
 *
 * This is what makes the dashboard's numbers add up the way the learner expects
 * them to: a sentence they wrote down themselves should extend the same streak
 * and count towards the same accuracy as one the course taught them. The two
 * enrollments stay separate everywhere it matters — separate queues, separate
 * schedules, and the course's 90-day plan untouched by anything the learner
 * adds — and are joined only for reporting.
 *
 * A notebook enrollment passed in here is its own scope: a notebook has no
 * notebook of its own.
 */
export async function studyScope(args: {
  enrollment: Enrollment;
  targetLanguage: string;
  /** Already-loaded active enrollments, to avoid re-querying per course. */
  enrollments?: readonly Enrollment[];
}): Promise<StudyScope> {
  const alone: StudyScope = {
    enrollmentIds: [args.enrollment.id],
    courseIds: [args.enrollment.courseId],
    notebook: null,
  };

  if (args.enrollment.kind === 'notebook') return alone;

  const notebookCourseId = notebookCourseIdFor(args.targetLanguage);
  if (!notebookCourseId) return alone;

  const notebook = args.enrollments
    ? (args.enrollments.find((item) => item.courseId === notebookCourseId) ?? null)
    : await getNotebookEnrollment(notebookCourseId);

  if (!notebook) return alone;

  return {
    enrollmentIds: [args.enrollment.id, notebook.id],
    courseIds: [args.enrollment.courseId, notebook.courseId],
    notebook,
  };
}
