/**
 * Single source of truth for every learning constant.
 * Nothing in the codebase may hardcode these numbers — import them from here.
 * See docs/PLANNER_SPEC.md for the reasoning behind each value.
 */

/** The reference dose the whole system is benchmarked against: 1800 items / 90 days. */
export const BENCHMARK_NEW_PER_DAY = 20;

/** Hard ceiling. The planner never schedules more than this, whatever the user asks for. */
export const MAX_NEW_PER_DAY = 20;

/** Floor, so a plan can never degrade into "1 item every few days". */
export const MIN_NEW_PER_DAY = 1;

/** Buffer days absorbed into every plan to cover missed days. */
export const BUFFER_DAYS_RANGE = [10, 15] as const;

/** Divisor used to scale buffer days with total plan length, then clamped to the range above. */
export const BUFFER_DAYS_DIVISOR = 6;

/** Review-queue cap per session, so a long absence does not produce an unusable backlog. */
export const MAX_REVIEWS_PER_SESSION = 120;

/** CEFR levels, in order. Adding C1/C2 content requires no code change beyond this list. */
export const CEFR_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Self-assessment buttons shown after each item, mapped to FSRS ratings. */
export const FSRS_RATINGS = { again: 1, hard: 2, good: 3, easy: 4 } as const;
export type FsrsRatingName = keyof typeof FSRS_RATINGS;

/** The three phases of a daily session. Each can be switched off in settings. */
export const SESSION_STAGES = ['review', 'learn', 'consolidate'] as const;
export type SessionStage = (typeof SESSION_STAGES)[number];

/** Exercise kinds used in the "check" step of learning a new item. */
export const EXERCISE_KINDS = ['flip', 'mcq', 'type', 'cloze'] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

/** Product identity, kept in one place so renaming the app touches one line. */
export const APP_NAME = 'HyperLing';

/** Locales shipped today. Vietnamese is the default. */
export const LOCALES = ['vi', 'en'] as const;
export const DEFAULT_LOCALE = 'vi';
export type Locale = (typeof LOCALES)[number];
