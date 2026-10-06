import 'server-only';
import { rows } from './rows';
import { fetchAllRows } from './paginate';
import { createClient } from '@/lib/supabase/server';
import { parseCalendarDate, type CalendarDate } from '@/core/planner/calendar';
import type { DayActivity } from '@/core/stats/streak';

/**
 * Dashboard statistics. Each query is scoped to one enrollment, because a
 * learner running two courses has two independent sets of numbers.
 */

export interface EnrollmentStats {
  activity: DayActivity[];
  learnedByLevel: Record<string, number>;
  /** Items reviewed at least three times and currently in the review state. */
  masteredCount: number;
  /** Share of graded answers that were correct, across the enrollment. */
  accuracy: number | null;
  totalReviews: number;
  /** Total study time recorded by finished sessions. */
  totalMinutes: number;
}

export async function getEnrollmentStats(args: {
  enrollmentId: string;
  courseId: string;
}): Promise<EnrollmentStats> {
  const supabase = await createClient();
  const { enrollmentId, courseId } = args;

  const [plans, cards, logs, sessions] = await Promise.all([
    supabase
      .from('daily_plans')
      .select('plan_date, completed_new, completed_reviews')
      .eq('enrollment_id', enrollmentId)
      .order('plan_date'),
    // Both of these outgrow the server's 1000-row response cap with ordinary
    // use — one card per studied sentence, and several log rows per card — and
    // a clipped read here would quietly understate every figure on the
    // dashboard rather than fail.
    fetchAllRows<{ item_id: string; reps: number; state: number }>((from, to) =>
      supabase
        .from('card_states')
        .select('item_id, reps, state')
        .eq('enrollment_id', enrollmentId)
        .range(from, to),
    ),
    fetchAllRows<{ is_correct: boolean | null }>((from, to) =>
      supabase.from('review_logs').select('is_correct').eq('enrollment_id', enrollmentId).range(from, to),
    ),
    // One row per study day, so this stays far below the cap.
    supabase.from('study_sessions').select('duration_ms').eq('enrollment_id', enrollmentId),
  ]);

  const activity = rows<{
    plan_date: string;
    completed_new: number;
    completed_reviews: number;
  }>(plans.data).flatMap((row) => {
    const date = parseCalendarDate(row.plan_date);
    return date
      ? [{ date, newItems: row.completed_new, reviews: row.completed_reviews }]
      : [];
  });

  // "Mastered" means the card has survived several successful reviews and is in
  // the review state, i.e. it has graduated out of learning and not lapsed back.
  const masteredCount = cards.filter((row) => row.state === 2 && row.reps >= 3).length;

  const learnedByLevel = await countLearnedByLevel(
    courseId,
    cards.filter((row) => row.reps > 0).map((row) => row.item_id),
  );

  const graded = logs.filter((row) => row.is_correct !== null);
  const accuracy =
    graded.length > 0 ? graded.filter((row) => row.is_correct === true).length / graded.length : null;

  const totalMs = rows<{ duration_ms: number | null }>(sessions.data).reduce(
    (sum, row) => sum + (row.duration_ms ?? 0),
    0,
  );

  return {
    activity,
    learnedByLevel,
    masteredCount,
    accuracy,
    totalReviews: logs.length,
    totalMinutes: Math.round(totalMs / 60_000),
  };
}

async function countLearnedByLevel(
  courseId: string,
  itemIds: readonly string[],
): Promise<Record<string, number>> {
  if (itemIds.length === 0) return {};

  const supabase = await createClient();
  const counts: Record<string, number> = {};

  // Chunked: a long `in` list can exceed the URL length PostgREST accepts.
  const CHUNK = 200;
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const { data } = await supabase
      .from('items')
      .select('level_code')
      .eq('course_id', courseId)
      .in('id', itemIds.slice(i, i + CHUNK));

    for (const row of rows<{ level_code: string }>(data)) {
      counts[row.level_code] = (counts[row.level_code] ?? 0) + 1;
    }
  }

  return counts;
}

export interface LearnedWord {
  itemId: string;
  stableKey: string;
  level: string;
  topic: string;
  text: string;
  meaning: string;
  transliteration: string | null;
  glossary: Array<{ term: string; meaning: string; gender: string | null }>;
  reps: number;
  lapses: number;
  isHard: boolean;
  due: CalendarDate | null;
}

export interface LearnedWordsPage {
  words: LearnedWord[];
  total: number;
}

/**
 * Sentences the learner has studied, for the word list page. Filtering happens
 * in the database where possible; search runs over the fetched page because the
 * text lives inside a JSONB column.
 */
export async function listLearnedItems(args: {
  enrollmentId: string;
  userId: string;
  search?: string;
  level?: string;
  onlyHard?: boolean;
  limit?: number;
  offset?: number;
}): Promise<LearnedWordsPage> {
  const supabase = await createClient();
  const { enrollmentId, userId, search, level, onlyHard } = args;
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;

  // The word list is the whole studied history, which passes the server's
  // 1000-row cap on a finished course — and a clipped page would silently drop
  // the sentences a learner is most likely to be looking for.
  const cards = await fetchAllRows<{ item_id: string; reps: number; lapses: number; due: string }>(
    (from, to) =>
      supabase
        .from('card_states')
        .select('item_id, reps, lapses, due')
        .eq('enrollment_id', enrollmentId)
        .gt('reps', 0)
        .order('due')
        .range(from, to),
  );
  if (cards.length === 0) return { words: [], total: 0 };

  const flags = await fetchAllRows<{ item_id: string; is_hard: boolean }>((from, to) =>
    supabase.from('item_flags').select('item_id, is_hard').eq('user_id', userId).range(from, to),
  );

  const hardIds = new Set(flags.filter((row) => row.is_hard).map((row) => row.item_id));

  const candidateIds = cards
    .filter((card) => !onlyHard || hardIds.has(card.item_id))
    .map((card) => card.item_id);

  if (candidateIds.length === 0) return { words: [], total: 0 };

  const items = await fetchItems(candidateIds, level);
  const byId = new Map(items.map((item) => [item.id, item]));

  const needle = search?.trim().toLowerCase();
  const matched = cards
    .filter((card) => byId.has(card.item_id))
    .filter((card) => {
      if (!needle) return true;
      const item = byId.get(card.item_id)!;
      const haystack = [
        item.fields.text ?? '',
        item.fields.meaning ?? '',
        item.topic,
        ...item.glossary.map((g) => `${g.term} ${g.meaning}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });

  const words: LearnedWord[] = matched.slice(offset, offset + limit).map((card) => {
    const item = byId.get(card.item_id)!;
    return {
      itemId: item.id,
      stableKey: item.stableKey,
      level: item.levelCode,
      topic: item.topic,
      text: item.fields.text ?? '',
      meaning: item.fields.meaning ?? '',
      transliteration: item.fields.transliteration ?? null,
      glossary: item.glossary.map((g) => ({
        term: g.term,
        meaning: g.meaning,
        gender: g.fields.gender ?? null,
      })),
      reps: card.reps,
      lapses: card.lapses,
      isHard: hardIds.has(card.item_id),
      due: parseCalendarDate(card.due.slice(0, 10)),
    };
  });

  return { words, total: matched.length };
}

interface FetchedItem {
  id: string;
  stableKey: string;
  levelCode: string;
  topic: string;
  fields: Record<string, string>;
  glossary: Array<{ term: string; meaning: string; fields: Record<string, string> }>;
}

async function fetchItems(itemIds: readonly string[], level?: string): Promise<FetchedItem[]> {
  const supabase = await createClient();
  const out: FetchedItem[] = [];
  const CHUNK = 200;

  for (let i = 0; i < itemIds.length; i += CHUNK) {
    let query = supabase
      .from('items')
      .select(
        'id, stable_key, level_code, topic, fields, item_glossary(ord, glossary_terms(term, meaning, fields))',
      )
      .in('id', itemIds.slice(i, i + CHUNK));

    if (level) query = query.eq('level_code', level);

    const { data } = await query;

    for (const row of rows<{
      id: string;
      stable_key: string;
      level_code: string;
      topic: string;
      fields: Record<string, string>;
      item_glossary?: Array<{
        ord: number;
        glossary_terms: { term: string; meaning: string; fields: Record<string, string> } | null;
      }>;
    }>(data)) {
      out.push({
        id: row.id,
        stableKey: row.stable_key,
        levelCode: row.level_code,
        topic: row.topic,
        fields: row.fields,
        glossary: (row.item_glossary ?? [])
          .slice()
          .sort((a, b) => a.ord - b.ord)
          .flatMap((link) =>
            link.glossary_terms
              ? [
                  {
                    term: link.glossary_terms.term,
                    meaning: link.glossary_terms.meaning,
                    fields: link.glossary_terms.fields ?? {},
                  },
                ]
              : [],
          ),
      });
    }
  }

  return out;
}

/** Levels that actually appear in the learner's studied items, for the filter. */
export async function getStudiedLevels(enrollmentId: string, courseId: string): Promise<string[]> {
  const supabase = await createClient();
  const cards = await fetchAllRows<{ item_id: string }>((from, to) =>
    supabase
      .from('card_states')
      .select('item_id')
      .eq('enrollment_id', enrollmentId)
      .gt('reps', 0)
      .range(from, to),
  );

  const ids = cards.map((row) => row.item_id);
  if (ids.length === 0) return [];

  const counts = await countLearnedByLevel(courseId, ids);
  return Object.keys(counts).sort();
}
