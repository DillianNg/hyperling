'use server';

import { z } from 'zod';
import { FSRS_RATINGS, EXERCISE_KINDS } from '@/config/app.config';
import { createScheduler } from '@/core/scheduler/fsrs';
import { describeInterval, type Interval } from '@/core/scheduler/types';
import type { FsrsRatingName } from '@/config/app.config';
import { getEnrollment } from '@/lib/data/enrollments';
import { finishStudySession, startStudySession, submitReview } from '@/lib/data/study';
import { getCurrentUser } from '@/lib/supabase/server';
import { calendarDateInTimezone } from '@/core/planner/calendar';

/**
 * Study-session mutations.
 *
 * Every one of these re-reads the enrollment server-side rather than trusting
 * ids from the form: RLS already stops cross-user access, and this stops a
 * learner from posting a review against an enrollment that is not theirs.
 */

const ratingSchema = z.enum(Object.keys(FSRS_RATINGS) as [FsrsRatingName, ...FsrsRatingName[]]);

const reviewSchema = z.object({
  enrollmentId: z.string().uuid(),
  itemId: z.string().uuid(),
  rating: ratingSchema,
  exerciseKind: z.enum(EXERCISE_KINDS),
  isCorrect: z.boolean().nullable(),
  durationMs: z.number().int().min(0).max(600_000).nullable(),
  isNewItem: z.boolean(),
  sessionId: z.string().uuid().nullable(),
});

export interface RecordReviewResult {
  ok: boolean;
  error?: string;
  /** When the card comes back, for the "next review in..." line. */
  nextInterval?: Interval;
}

export async function recordReview(input: unknown): Promise<RecordReviewResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Phiên đăng nhập đã hết hạn.' };

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dữ liệu không hợp lệ.' };

  const enrollment = await getEnrollment(parsed.data.enrollmentId);
  if (!enrollment) return { ok: false, error: 'Không tìm thấy khóa học.' };

  const now = new Date();
  const result = await submitReview({
    userId: user.id,
    enrollment,
    itemId: parsed.data.itemId,
    rating: parsed.data.rating,
    exerciseKind: parsed.data.exerciseKind,
    isCorrect: parsed.data.isCorrect,
    durationMs: parsed.data.durationMs,
    isNewItem: parsed.data.isNewItem,
    sessionId: parsed.data.sessionId,
    now,
  });

  if (!result.ok) return { ok: false, error: result.error ?? 'Không lưu được kết quả.' };

  return {
    ok: true,
    ...(result.nextDue ? { nextInterval: describeInterval(now, result.nextDue) } : {}),
  };
}

export async function beginSession(enrollmentId: string): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const enrollment = await getEnrollment(enrollmentId);
  if (!enrollment) return null;

  return startStudySession({
    userId: user.id,
    enrollmentId,
    date: calendarDateInTimezone(new Date(), enrollment.timezone),
  });
}

const finishSchema = z.object({
  sessionId: z.string().uuid(),
  reviewed: z.number().int().min(0),
  learned: z.number().int().min(0),
  correct: z.number().int().min(0),
  answered: z.number().int().min(0),
  durationMs: z.number().int().min(0).nullable(),
});

export async function endSession(input: unknown): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const parsed = finishSchema.safeParse(input);
  if (!parsed.success) return;

  const { sessionId, reviewed, learned, correct, answered, durationMs } = parsed.data;

  await finishStudySession({
    sessionId,
    counts: { reviewed, learned },
    // Only graded exercises count toward accuracy; a flip card has no verdict.
    accuracy: answered > 0 ? Number((correct / answered).toFixed(3)) : null,
    durationMs,
  });
}

/**
 * Interval preview for the rating buttons. Computed on the server so the card's
 * stored FSRS state never has to be shipped to the browser.
 */
export async function previewIntervals(args: {
  enrollmentId: string;
  itemId: string;
}): Promise<Record<FsrsRatingName, Interval> | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const enrollment = await getEnrollment(args.enrollmentId);
  if (!enrollment) return null;

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data } = await supabase
    .from('card_states')
    .select('due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review')
    .eq('user_id', user.id)
    .eq('item_id', args.itemId)
    .maybeSingle();

  const scheduler = createScheduler();
  const now = new Date();

  const card = data
    ? {
        due: new Date((data as { due: string }).due),
        stability: (data as { stability: number }).stability,
        difficulty: (data as { difficulty: number }).difficulty,
        elapsedDays: (data as { elapsed_days: number }).elapsed_days,
        scheduledDays: (data as { scheduled_days: number }).scheduled_days,
        learningSteps: (data as { learning_steps: number }).learning_steps,
        reps: (data as { reps: number }).reps,
        lapses: (data as { lapses: number }).lapses,
        state: (['new', 'learning', 'review', 'relearning'] as const)[
          (data as { state: number }).state
        ]!,
        lastReview: (data as { last_review: string | null }).last_review
          ? new Date((data as { last_review: string }).last_review)
          : null,
      }
    : scheduler.createCard(now);

  const preview = scheduler.preview(card, now);
  return {
    again: preview.again.interval,
    hard: preview.hard.interval,
    good: preview.good.interval,
    easy: preview.easy.interval,
  };
}
