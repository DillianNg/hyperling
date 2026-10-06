import 'server-only';
import { row, rows } from './rows';
import { fetchAllRows } from './paginate';
import { createClient } from '@/lib/supabase/server';
import type { FieldSpec } from '@/core/content/schema';

/** How many items to scan per request when looking for the next unseen ones. */
const UNSEEN_PAGE = 500;

/**
 * Course content queries. Everything here runs under RLS with the anon key, so
 * a signed-in learner reads course content and nothing else.
 */

export interface CourseSummary {
  id: string;
  title: Record<string, string>;
  description: Record<string, string> | null;
  targetLanguage: string;
  sourceLanguage: string;
  levelFrom: string;
  levelTo: string;
  levels: string[];
  tts: { lang: string; rate?: number } | null;
  fields: FieldSpec[];
  glossaryFields: FieldSpec[];
  /** How many items exist per level, so onboarding only offers real goals. */
  itemCountByLevel: Record<string, number>;
}

interface CourseRow {
  id: string;
  title: Record<string, string>;
  description: Record<string, string> | null;
  target_language: string;
  source_language: string;
  level_from: string;
  level_to: string;
  levels: string[];
  tts: { lang: string; rate?: number } | null;
  field_schema: { fields?: FieldSpec[]; glossaryFields?: FieldSpec[] } | null;
}

function toSummary(row: CourseRow, itemCountByLevel: Record<string, number>): CourseSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    targetLanguage: row.target_language,
    sourceLanguage: row.source_language,
    levelFrom: row.level_from,
    levelTo: row.level_to,
    levels: row.levels,
    tts: row.tts,
    fields: row.field_schema?.fields ?? [],
    glossaryFields: row.field_schema?.glossaryFields ?? [],
    itemCountByLevel,
  };
}

/**
 * Item counts grouped by level for one course.
 *
 * Counted by Postgres, one `count` per declared level, rather than by fetching
 * the rows and counting them here. Fetching silently stopped at PostgREST's
 * 1000-row cap: with 1800 German sentences it saw A1 300, A2 300, B1 400 and no
 * B2 at all, so onboarding reported B2 as having no content yet.
 *
 * These counts gate which goals a learner may choose, so being short is not a
 * cosmetic error — it hides levels that are fully written.
 */
export async function getItemCountByLevel(
  courseId: string,
  levels: readonly string[],
): Promise<Record<string, number>> {
  const supabase = await createClient();

  const counted = await Promise.all(
    levels.map(async (level) => {
      const { count, error } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', courseId)
        .eq('level_code', level);

      return [level, error ? 0 : (count ?? 0)] as const;
    }),
  );

  const counts: Record<string, number> = {};
  for (const [level, n] of counted) {
    if (n > 0) counts[level] = n;
  }
  return counts;
}

export async function listCourses(): Promise<CourseSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('courses')
    .select(
      'id, title, description, target_language, source_language, level_from, level_to, levels, tts, field_schema',
    )
    .order('id');

  if (error || !data) return [];

  const courseRows = rows<CourseRow>(data);
  const counts = await Promise.all(
    courseRows.map((course) => getItemCountByLevel(course.id, course.levels ?? [])),
  );
  return courseRows.map((course, index) => toSummary(course, counts[index] ?? {}));
}

export async function getCourse(courseId: string): Promise<CourseSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('courses')
    .select(
      'id, title, description, target_language, source_language, level_from, level_to, levels, tts, field_schema',
    )
    .eq('id', courseId)
    .maybeSingle();

  if (error || !data) return null;
  const course = row<CourseRow>(data);
  return course ? toSummary(course, await getItemCountByLevel(courseId, course.levels ?? [])) : null;
}

export interface StudyItem {
  id: string;
  stableKey: string;
  orderIndex: number;
  levelCode: string;
  topic: string;
  fields: Record<string, string>;
  glossary: Array<{
    term: string;
    meaning: string;
    partOfSpeech: string;
    fields: Record<string, string>;
  }>;
}

interface ItemRow {
  id: string;
  stable_key: string;
  order_index: number;
  level_code: string;
  topic: string;
  fields: Record<string, string>;
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

function toStudyItem(row: ItemRow): StudyItem {
  const glossary = (row.item_glossary ?? [])
    .slice()
    .sort((a, b) => a.ord - b.ord)
    .flatMap((link) =>
      link.glossary_terms
        ? [
            {
              term: link.glossary_terms.term,
              meaning: link.glossary_terms.meaning,
              partOfSpeech: link.glossary_terms.part_of_speech,
              fields: link.glossary_terms.fields ?? {},
            },
          ]
        : [],
    );

  return {
    id: row.id,
    stableKey: row.stable_key,
    orderIndex: row.order_index,
    levelCode: row.level_code,
    topic: row.topic,
    fields: row.fields,
    glossary,
  };
}

const ITEM_SELECT =
  'id, stable_key, order_index, level_code, topic, fields, ' +
  'item_glossary(ord, glossary_terms(term, meaning, part_of_speech, fields))';

export async function getItemsByIds(itemIds: readonly string[]): Promise<StudyItem[]> {
  if (itemIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from('items').select(ITEM_SELECT).in('id', itemIds);

  if (error || !data) return [];
  return rows<ItemRow>(data).map(toStudyItem);
}

/**
 * Items in the given levels that the learner has never been given a card for,
 * in teaching order. This is the source of "new items" for a session.
 */
export async function getUnseenItems(args: {
  courseId: string;
  levels: readonly string[];
  userId: string;
  limit: number;
}): Promise<StudyItem[]> {
  const { courseId, levels, userId, limit } = args;
  if (levels.length === 0 || limit <= 0) return [];

  const supabase = await createClient();

  // Which items the learner already has a card for. RLS scopes this to them.
  //
  // Paged: a learner past 1000 studied sentences would otherwise get a clipped
  // set here, and every sentence missing from it would be taught again as new.
  const seen = await fetchAllRows<{ item_id: string }>((from, to) =>
    supabase.from('card_states').select('item_id').eq('user_id', userId).range(from, to),
  );
  const seenIds = new Set(seen.map((card) => card.item_id));

  // Walk the course in teaching order, skipping what the learner has seen, and
  // stop as soon as enough new items are in hand. Asking for `limit + seen` in
  // one request stops working once that total passes the server's row cap.
  const picked: ItemRow[] = [];
  for (let offset = 0; picked.length < limit; offset += UNSEEN_PAGE) {
    const { data, error } = await supabase
      .from('items')
      .select(ITEM_SELECT)
      .eq('course_id', courseId)
      .in('level_code', levels)
      .order('order_index')
      .range(offset, offset + UNSEEN_PAGE - 1);

    if (error || !data) break;

    const batch = rows<ItemRow>(data);
    for (const item of batch) {
      if (!seenIds.has(item.id)) picked.push(item);
      if (picked.length >= limit) break;
    }
    if (batch.length < UNSEEN_PAGE) break;
  }

  return picked.map(toStudyItem);
}

/** A pool of meanings from the same course, used as multiple-choice distractors. */
export async function getDistractorPool(args: {
  courseId: string;
  levels: readonly string[];
  limit?: number;
}): Promise<Array<{ itemId: string; stableKey: string; prompt: string; answer: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('items')
    .select('id, stable_key, fields')
    .eq('course_id', args.courseId)
    .in('level_code', args.levels)
    .limit(args.limit ?? 300);

  if (error || !data) return [];

  return rows<{ id: string; stable_key: string; fields: Record<string, string> }>(data).map((item) => ({
    itemId: item.id,
    stableKey: item.stable_key,
    prompt: item.fields.text ?? '',
    answer: item.fields.meaning ?? '',
  }));
}
