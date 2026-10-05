import type { FsrsRatingName } from '@/config/app.config';

/**
 * The scheduler contract, stated independently of ts-fsrs.
 *
 * Everything above this layer — the session engine, the UI, the database rows —
 * speaks only these types. If FSRS is ever retuned or replaced, the change stops
 * at src/core/scheduler/fsrs.ts.
 */

/** ts-fsrs State, named rather than numbered at this boundary. */
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export const CARD_STATE_TO_DB: Record<CardState, number> = {
  new: 0,
  learning: 1,
  review: 2,
  relearning: 3,
};

export const DB_TO_CARD_STATE: Record<number, CardState> = {
  0: 'new',
  1: 'learning',
  2: 'review',
  3: 'relearning',
};

/** A card's scheduling state. Mirrors the `card_states` row one-to-one. */
export interface SchedulerCard {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: Date | null;
}

/** What a review produced: the new card, plus the snapshot to log. */
export interface SchedulerResult {
  card: SchedulerCard;
  /** The card as it was *before* this review, for the append-only log. */
  snapshotBefore: {
    state: CardState;
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
    due: Date;
  };
}

/** How long until a card comes back, in the largest unit that reads naturally. */
export interface Interval {
  /** Whole minutes until the card is due. */
  minutes: number;
  /** Unit and amount to display, e.g. `{ unit: 'day', value: 2 }`. */
  unit: 'minute' | 'hour' | 'day' | 'month';
  value: number;
}

/** Interval preview shown on each rating button, so the learner sees the cost. */
export type RatingPreview = Record<FsrsRatingName, { due: Date; interval: Interval }>;

/** Pure: pick the unit a human would use for this gap. */
export function describeInterval(from: Date, to: Date): Interval {
  const minutes = Math.max(Math.round((to.getTime() - from.getTime()) / 60_000), 0);
  if (minutes < 60) return { minutes, unit: 'minute', value: Math.max(minutes, 1) };
  if (minutes < 60 * 24) return { minutes, unit: 'hour', value: Math.round(minutes / 60) };
  const days = Math.round(minutes / (60 * 24));
  if (days < 60) return { minutes, unit: 'day', value: days };
  return { minutes, unit: 'month', value: Math.round(days / 30) };
}

export interface Scheduler {
  /** A card never studied before. */
  createCard(now: Date): SchedulerCard;
  /** Apply a rating and return the rescheduled card. */
  review(card: SchedulerCard, rating: FsrsRatingName, now: Date): SchedulerResult;
  /** What each rating would do, without applying any of them. */
  preview(card: SchedulerCard, now: Date): RatingPreview;
}
