import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRS,
  type Grade,
  type RecordLogItem,
} from 'ts-fsrs';
import { FSRS_RATINGS, type FsrsRatingName } from '@/config/app.config';
import {
  DB_TO_CARD_STATE,
  describeInterval,
  type RatingPreview,
  type Scheduler,
  type SchedulerCard,
  type SchedulerResult,
} from './types';

/**
 * The only file that knows ts-fsrs exists.
 *
 * FSRS replaces the fixed 1/3/7/16/35-day ladder of the source spreadsheet with
 * per-card, per-learner intervals: a sentence you know firmly stretches to
 * months, one you keep forgetting comes back tomorrow. Same idea, better timing.
 */

// `Grade` is Rating without `Manual`: the four buttons a learner can actually press.
const RATING_BY_NAME: Record<FsrsRatingName, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATE_BY_NAME = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
} as const;

/**
 * 0.9 means "aim to still recall 90% of cards when they come up". Lower values
 * mean fewer reviews but more forgetting; this is the ts-fsrs default and a
 * sensible starting point for a 90-day course.
 */
const TARGET_RETENTION = 0.9;

function toFsrsCard(card: SchedulerCard): Card {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_BY_NAME[card.state],
    ...(card.lastReview ? { last_review: card.lastReview } : {}),
  };
}

function fromFsrsCard(card: Card): SchedulerCard {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: DB_TO_CARD_STATE[card.state] ?? 'new',
    lastReview: card.last_review ?? null,
  };
}

export function createScheduler(overrides?: { requestRetention?: number }): Scheduler {
  const parameters = generatorParameters({
    request_retention: overrides?.requestRetention ?? TARGET_RETENTION,
    enable_fuzz: false, // deterministic, so tests and forecasts are reproducible
  });
  const engine: FSRS = fsrs(parameters);

  return {
    createCard(now: Date): SchedulerCard {
      return fromFsrsCard(createEmptyCard(now));
    },

    review(card: SchedulerCard, rating: FsrsRatingName, now: Date): SchedulerResult {
      const before = toFsrsCard(card);
      const result = engine.next(before, now, RATING_BY_NAME[rating]);

      return {
        card: fromFsrsCard(result.card),
        snapshotBefore: {
          state: card.state,
          stability: card.stability,
          difficulty: card.difficulty,
          elapsedDays: card.elapsedDays,
          scheduledDays: card.scheduledDays,
          due: card.due,
        },
      };
    },

    preview(card: SchedulerCard, now: Date): RatingPreview {
      const source = toFsrsCard(card);
      const scheduled = engine.repeat(source, now);

      const read = (rating: Grade) => {
        const next = scheduled[rating] as RecordLogItem | undefined;
        const due = next?.card.due ?? now;
        return { due, interval: describeInterval(now, due) };
      };

      return {
        again: read(Rating.Again),
        hard: read(Rating.Hard),
        good: read(Rating.Good),
        easy: read(Rating.Easy),
      };
    },
  };
}

/** Numeric rating stored in `review_logs.rating`. */
export function ratingToNumber(rating: FsrsRatingName): number {
  return FSRS_RATINGS[rating];
}

export function numberToRating(value: number): FsrsRatingName | null {
  const found = Object.entries(FSRS_RATINGS).find(([, n]) => n === value);
  return (found?.[0] as FsrsRatingName | undefined) ?? null;
}
