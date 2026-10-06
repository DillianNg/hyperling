import { MAX_REVIEWS_PER_SESSION, type SessionStage } from '@/config/app.config';

/**
 * What today's session contains, decided before anything is rendered.
 *
 * The learner never chooses what to study: they open the app and the list is
 * ready. This function makes that list, and it is pure so the rules are testable
 * without a database.
 */

export interface SessionItemRef {
  itemId: string;
  stableKey: string;
  orderIndex: number;
}

export interface BuildSessionInput {
  /** Cards whose due time has passed, soonest first. */
  dueCards: readonly SessionItemRef[];
  /** Items never studied, in teaching order. */
  unseenItems: readonly SessionItemRef[];
  /** How many new items today's plan calls for. */
  plannedNew: number;
  /** New items already finished today, so a resumed session does not repeat them. */
  completedNewToday: number;
  /** Which stages the learner has switched on. */
  stageFlags: Record<SessionStage, boolean>;
  /** Cap on the review queue, so a long absence does not produce an unusable backlog. */
  maxReviews?: number;
  /**
   * How many cards are due in total, when `dueCards` is only the first page of
   * them. The caller fetches at most `maxReviews` rows — a learner back from a
   * long absence can have thousands due — so the backlog has to be counted in
   * the database rather than inferred from the array's length.
   *
   * Defaults to `dueCards.length`, which is correct whenever the caller did
   * pass every due card.
   */
  totalDueCards?: number;
}

export interface SessionPlan {
  /** Due cards to review, in order. */
  review: SessionItemRef[];
  /** New items to learn today. */
  learn: SessionItemRef[];
  /** Items to re-test at the end of the session: exactly what was learned today. */
  consolidate: SessionItemRef[];
  /** Due cards left over after the cap. Shown so the backlog is never hidden. */
  deferredReviews: number;
  /** Total steps, used for the progress bar. */
  totalSteps: number;
  isEmpty: boolean;
}

export function buildSession(input: BuildSessionInput): SessionPlan {
  const {
    dueCards,
    unseenItems,
    plannedNew,
    completedNewToday,
    stageFlags,
    maxReviews = MAX_REVIEWS_PER_SESSION,
    totalDueCards = dueCards.length,
  } = input;

  const cap = Math.max(maxReviews, 0);
  const review = stageFlags.review ? dueCards.slice(0, cap) : [];
  // Never report fewer due cards than were actually handed over.
  const totalDue = Math.max(totalDueCards, dueCards.length);
  const deferredReviews = stageFlags.review ? Math.max(totalDue - review.length, 0) : 0;

  // A resumed session continues where it stopped rather than starting over.
  const remainingNew = Math.max(plannedNew - completedNewToday, 0);
  const learn = stageFlags.learn ? unseenItems.slice(0, remainingNew) : [];

  // Consolidation re-tests exactly what was just learned — not a random sample,
  // because its job is to catch what is about to slip away overnight.
  const consolidate = stageFlags.consolidate ? [...learn] : [];

  return {
    review,
    learn,
    consolidate,
    deferredReviews,
    totalSteps: review.length + learn.length + consolidate.length,
    isEmpty: review.length === 0 && learn.length === 0,
  };
}

/** Where the learner is in the session, used for the progress indicator. */
export interface SessionProgress {
  stage: SessionStage;
  /** 1-based position within the current stage. */
  indexInStage: number;
  stageTotal: number;
  /** 1-based position across the whole session. */
  overallIndex: number;
  overallTotal: number;
  percent: number;
}

export function sessionProgress(plan: SessionPlan, completedSteps: number): SessionProgress {
  const total = Math.max(plan.totalSteps, 1);
  const done = Math.min(Math.max(completedSteps, 0), plan.totalSteps);

  const stages: Array<{ stage: SessionStage; size: number }> = [
    { stage: 'review', size: plan.review.length },
    { stage: 'learn', size: plan.learn.length },
    { stage: 'consolidate', size: plan.consolidate.length },
  ];

  let offset = 0;
  for (const { stage, size } of stages) {
    if (size === 0) continue;
    if (done < offset + size) {
      return {
        stage,
        indexInStage: done - offset + 1,
        stageTotal: size,
        overallIndex: done + 1,
        overallTotal: plan.totalSteps,
        percent: Math.round((done / total) * 100),
      };
    }
    offset += size;
  }

  // Past the end: the session is finished.
  const last = stages.findLast((s) => s.size > 0);
  return {
    stage: last?.stage ?? 'learn',
    indexInStage: last?.size ?? 0,
    stageTotal: last?.size ?? 0,
    overallIndex: plan.totalSteps,
    overallTotal: plan.totalSteps,
    percent: 100,
  };
}
