import 'server-only';
import { row, rows } from './rows';
import { createClient } from '@/lib/supabase/server';
import type { FieldSpec } from '@/core/content/schema';

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

/** Item counts grouped by level for one course. */
export async function getItemCountByLevel(courseId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('items').select('level_code').eq('course_id', courseId);

  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const item of rows<{ level_code: string }>(data)) {
    counts[item.level_code] = (counts[item.level_code] ?? 0) + 1;
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
  const counts = await Promise.all(courseRows.map((course) => getItemCountByLevel(course.id)));
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
  return course ? toSummary(course, await getItemCountByLevel(courseId)) : null;
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
  const { data: seen } = await supabase.from('card_states').select('item_id').eq('user_id', userId);
  const seenIds = new Set((seen ?? []).map((row: { item_id: string }) => row.item_id));

  // Over-fetch so the already-seen ones can be filtered out without a second trip.
  const { data, error } = await supabase
    .from('items')
    .select(ITEM_SELECT)
    .eq('course_id', courseId)
    .in('level_code', levels)
    .order('order_index')
    .limit(limit + seenIds.size);

  if (error || !data) return [];

  return rows<ItemRow>(data)
    .filter((item) => !seenIds.has(item.id))
    .slice(0, limit)
    .map(toStudyItem);
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
