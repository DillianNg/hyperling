import 'server-only';
import { row, rows } from './rows';
import { createClient } from '@/lib/supabase/server';
import { createScheduler, ratingToNumber } from '@/core/scheduler/fsrs';
import { CARD_STATE_TO_DB, DB_TO_CARD_STATE, type SchedulerCard } from '@/core/scheduler/types';
import { buildSession, type SessionItemRef, type SessionPlan } from '@/core/session/build-session';
import { computePlan } from '@/core/planner/plan';
import { levelsToStudy } from '@/core/planner/levels';
import {
  calendarDateInTimezone,
  endOfDayInstant,
  type CalendarDate,
} from '@/core/planner/calendar';
import {
  MAX_NEW_PER_DAY,
  MAX_REVIEWS_PER_SESSION,
  type ExerciseKind,
  type FsrsRatingName,
} from '@/config/app.config';
import { NOTEBOOK_LEVEL } from '@/core/content/notebook';
import { getDistractorPool, getItemsByIds, getUnseenItems, type StudyItem } from './courses';
import { getDailyPlan, type Enrollment } from './enrollments';

/**
 * The study session: where the pure core meets the database.
 *
 * The decisions (what to study, how to reschedule) all live in src/core. This
 * file only fetches what those decisions need and writes down what they produced.
 */

const scheduler = createScheduler();

export interface TodaySession {
  today: CalendarDate;
  plannedNew: number;
  completedNewToday: number;
  completedReviewsToday: number;
  plan: SessionPlan;
  /** Items referenced by the plan, keyed by id. */
  itemsById: Record<string, StudyItem>;
  /** Meanings from the same course, for multiple-choice distractors. */
  distractors: Array<{ itemId: string; stableKey: string; prompt: string; answer: string }>;
  /** Review counts for each item, so the right exercise kind is chosen. */
  repsByItemId: Record<string, number>;
}

/** How many new items today's plan calls for, according to the planner. */
export function plannedNewForDate(enrollment: Enrollment, totalItems: number, date: CalendarDate): number {
  const outcome = computePlan({
    totalItems,
    startDate: enrollment.startDate,
    targetDate: enrollment.targetDate,
    restWeekdays: enrollment.restWeekdays,
    maxNewPerDay: enrollment.newPerDay,
  });
  if (!outcome.ok) return 0;
  return outcome.plan.days.find((day) => day.date === date)?.plannedNew ?? 0;
}

export async function getTodaySession(args: {
  enrollment: Enrollment;
  userId: string;
  totalItems: number;
  now: Date;
}): Promise<TodaySession> {
  const { enrollment, userId, totalItems, now } = args;
  const supabase = await createClient();

  const today = calendarDateInTimezone(now, enrollment.timezone);

  // A notebook has no plan to run. Its sentences arrive whenever the learner
  // meets one, so there is no total to divide by a daily rate and no target
  // date to fall behind — asking the planner would mean inventing both.
  //
  // What it does keep is the hard ceiling on new items per day (principle 7)
  // and the day's own progress, so a session resumed after a break continues
  // instead of starting over. Its level is its own, outside CEFR, so
  // levelsToStudy is not applicable either.
  const isNotebook = enrollment.kind === 'notebook';
  const plannedNew = isNotebook
    ? MAX_NEW_PER_DAY
    : plannedNewForDate(enrollment, totalItems, today);
  const levels = isNotebook
    ? [NOTEBOOK_LEVEL]
    : levelsToStudy(enrollment.levelFrom, enrollment.levelTo);

  const dayRow = await getDailyPlan(enrollment.id, today);
  const completedNewToday = dayRow?.completedNew ?? 0;
  const completedReviewsToday = dayRow?.completedReviews ?? 0;

  // Due cards: everything whose due time has passed by the end of the learner's
  // day, so a card due at 22:00 is offered during the evening session.
  const dueBefore = endOfDayInstant(today, enrollment.timezone).toISOString();

  // Only the cards this session can actually use are fetched — a learner back
  // from a long absence may have thousands due, and loading them all would both
  // pass the server's row cap and build an `in (...)` list too long to send.
  // The backlog figure comes from a count instead, so it stays honest.
  //
  // The two queries must keep the same three filters; they are written side by
  // side so a change to one that misses the other is visible here.
  const [{ data: dueRows }, { count: totalDue }] = await Promise.all([
    supabase
      .from('card_states')
      .select('item_id, due, reps')
      .eq('enrollment_id', enrollment.id)
      .neq('state', CARD_STATE_TO_DB.new)
      .lte('due', dueBefore)
      .order('due')
      .limit(MAX_REVIEWS_PER_SESSION),
    supabase
      .from('card_states')
      .select('item_id', { count: 'exact', head: true })
      .eq('enrollment_id', enrollment.id)
      .neq('state', CARD_STATE_TO_DB.new)
      .lte('due', dueBefore),
  ]);

  const dueCardRows = rows<{ item_id: string; due: string; reps: number }>(dueRows);
  const dueItems = await getItemsByIds(dueCardRows.map((r) => r.item_id));
  const dueItemById = new Map(dueItems.map((item) => [item.id, item]));

  const dueCards: SessionItemRef[] = dueCardRows.flatMap((cardRow) => {
    const item = dueItemById.get(cardRow.item_id);
    return item ? [{ itemId: item.id, stableKey: item.stableKey, orderIndex: item.orderIndex }] : [];
  });

  const remainingNew = Math.max(plannedNew - completedNewToday, 0);
  const unseen = await getUnseenItems({
    courseId: enrollment.courseId,
    levels,
    userId,
    limit: remainingNew,
  });

  const plan = buildSession({
    dueCards,
    totalDueCards: totalDue ?? dueCards.length,
    unseenItems: unseen.map((item) => ({
      itemId: item.id,
      stableKey: item.stableKey,
      orderIndex: item.orderIndex,
    })),
    plannedNew,
    completedNewToday,
    stageFlags: enrollment.stageFlags,
  });

  const itemsById: Record<string, StudyItem> = {};
  for (const item of [...dueItems, ...unseen]) itemsById[item.id] = item;

  const repsByItemId: Record<string, number> = {};
  for (const cardRow of dueCardRows) repsByItemId[cardRow.item_id] = cardRow.reps;

  const distractors = await getDistractorPool({ courseId: enrollment.courseId, levels });

  return {
    today,
    plannedNew,
    completedNewToday,
    completedReviewsToday,
    plan,
    itemsById,
    distractors,
    repsByItemId,
  };
}

export interface SubmitReviewInput {
  userId: string;
  enrollment: Enrollment;
  itemId: string;
  rating: FsrsRatingName;
  exerciseKind: ExerciseKind;
  isCorrect: boolean | null;
  durationMs: number | null;
  /** True when this is the learner's first-ever review of the item. */
  isNewItem: boolean;
  sessionId: string | null;
  now: Date;
}

export interface SubmitReviewResult {
  ok: boolean;
  /** When the card will come back. */
  nextDue: Date | null;
  error?: string;
}

/**
 * Record one review: reschedule the card, append to the immutable log, and move
 * the day's counters. Written as three statements rather than one transaction
 * because PostgREST has no transaction; the log is append-only and the counters
 * are advisory, so a partial failure degrades rather than corrupts.
 */
export async function submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult> {
  const { userId, enrollment, itemId, rating, now } = input;
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('card_states')
    .select('due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .maybeSingle();

  const existingCard = row<CardStateRow>(existing);
  const card: SchedulerCard = existingCard ? rowToCard(existingCard) : scheduler.createCard(now);

  const { card: next, snapshotBefore } = scheduler.review(card, rating, now);

  const { error: upsertError } = await supabase.from('card_states').upsert(
    {
      user_id: userId,
      item_id: itemId,
      enrollment_id: enrollment.id,
      due: next.due.toISOString(),
      stability: next.stability,
      difficulty: next.difficulty,
      elapsed_days: next.elapsedDays,
      scheduled_days: next.scheduledDays,
      learning_steps: next.learningSteps,
      reps: next.reps,
      lapses: next.lapses,
      state: CARD_STATE_TO_DB[next.state],
      last_review: now.toISOString(),
    },
    { onConflict: 'user_id,item_id' },
  );

  if (upsertError) {
    return { ok: false, nextDue: null, error: upsertError.message };
  }

  // Append-only: this row is evidence of what happened and is never updated.
  await supabase.from('review_logs').insert({
    user_id: userId,
    item_id: itemId,
    enrollment_id: enrollment.id,
    session_id: input.sessionId,
    rating: ratingToNumber(rating),
    exercise_kind: input.exerciseKind,
    is_correct: input.isCorrect,
    duration_ms: input.durationMs,
    reviewed_at: now.toISOString(),
    state_before: CARD_STATE_TO_DB[snapshotBefore.state],
    stability_before: snapshotBefore.stability,
    difficulty_before: snapshotBefore.difficulty,
    elapsed_days: snapshotBefore.elapsedDays,
    scheduled_days: snapshotBefore.scheduledDays,
    due_before: snapshotBefore.due.toISOString(),
  });

  await bumpDailyCounters({
    enrollmentId: enrollment.id,
    date: calendarDateInTimezone(now, enrollment.timezone),
    enrollment,
    isNewItem: input.isNewItem,
  });

  return { ok: true, nextDue: next.due };
}

interface CardStateRow {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

function rowToCard(row: CardStateRow): SchedulerCard {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsed_days,
    scheduledDays: row.scheduled_days,
    learningSteps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: DB_TO_CARD_STATE[row.state] ?? 'new',
    lastReview: row.last_review ? new Date(row.last_review) : null,
  };
}

async function bumpDailyCounters(args: {
  enrollmentId: string;
  date: CalendarDate;
  enrollment: Enrollment;
  isNewItem: boolean;
}): Promise<void> {
  const supabase = await createClient();
  const existing = await getDailyPlan(args.enrollmentId, args.date);

  if (existing) {
    await supabase
      .from('daily_plans')
      .update({
        completed_new: existing.completedNew + (args.isNewItem ? 1 : 0),
        completed_reviews: existing.completedReviews + (args.isNewItem ? 0 : 1),
      })
      .eq('enrollment_id', args.enrollmentId)
      .eq('plan_date', args.date);
    return;
  }

  // First activity of the day creates the row, snapshotting what was planned.
  const dayIndex = Math.max(
    daysBetweenDates(args.enrollment.startDate, args.date) + 1,
    1,
  );

  await supabase.from('daily_plans').insert({
    enrollment_id: args.enrollmentId,
    plan_date: args.date,
    day_index: dayIndex,
    planned_new: args.enrollment.newPerDay,
    completed_new: args.isNewItem ? 1 : 0,
    completed_reviews: args.isNewItem ? 0 : 1,
  });
}

function daysBetweenDates(from: CalendarDate, to: CalendarDate): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

export async function startStudySession(args: {
  userId: string;
  enrollmentId: string;
  date: CalendarDate;
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('study_sessions')
    .insert({ user_id: args.userId, enrollment_id: args.enrollmentId, session_date: args.date })
    .select('id')
    .single();

  return error ? null : (row<{ id: string }>(data)?.id ?? null);
}

export async function finishStudySession(args: {
  sessionId: string;
  counts: Record<string, number>;
  accuracy: number | null;
  durationMs: number | null;
}): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('study_sessions')
    .update({
      ended_at: new Date().toISOString(),
      counts: args.counts,
      accuracy: args.accuracy,
      duration_ms: args.durationMs,
    })
    .eq('id', args.sessionId);
}
