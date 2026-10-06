import {
  addDays,
  compareDates,
  diffDays,
  eachDay,
  isoWeekday,
  type CalendarDate,
  type IsoWeekday,
} from '@/core/planner/calendar';

/**
 * Streaks and the activity heatmap.
 *
 * Pure functions over a list of active days, so the rules are testable and the
 * dashboard never has to reason about dates itself.
 *
 * One rule shapes the streak: a day the learner deliberately marked as a rest
 * day does not break it. Punishing someone for a rest day they planned would
 * make the rest-day feature useless.
 */

export interface DayActivity {
  date: CalendarDate;
  newItems: number;
  reviews: number;
}

export interface StreakSummary {
  /** Consecutive active days ending today (or yesterday, if today is still open). */
  current: number;
  longest: number;
  /** Days with any activity at all. */
  totalActiveDays: number;
  /** True when today already has activity. */
  studiedToday: boolean;
}

function isActive(activity: DayActivity): boolean {
  return activity.newItems > 0 || activity.reviews > 0;
}

export function computeStreak(args: {
  activity: readonly DayActivity[];
  today: CalendarDate;
  restWeekdays: readonly IsoWeekday[];
}): StreakSummary {
  const { activity, today, restWeekdays } = args;
  const rest = new Set(restWeekdays);

  const activeDays = new Set(activity.filter(isActive).map((a) => a.date));
  const studiedToday = activeDays.has(today);

  if (activeDays.size === 0) {
    return { current: 0, longest: 0, totalActiveDays: 0, studiedToday: false };
  }

  // Current streak walks backwards from today. An untouched *today* does not
  // break it — the day is not over yet.
  let current = 0;
  let cursor = studiedToday ? today : addDays(today, -1);

  while (true) {
    if (activeDays.has(cursor)) {
      current += 1;
    } else if (!rest.has(isoWeekday(cursor))) {
      break;
    }
    // A rest day with no activity is skipped rather than counted or breaking the run.
    cursor = addDays(cursor, -1);
    // Nothing older than the first active day can extend the streak.
    const earliest = [...activeDays].sort()[0]!;
    if (compareDates(cursor, earliest) < 0) break;
  }

  const longest = computeLongestStreak(activeDays, rest);

  return { current, longest, totalActiveDays: activeDays.size, studiedToday };
}

function computeLongestStreak(activeDays: ReadonlySet<string>, rest: ReadonlySet<IsoWeekday>): number {
  const sorted = [...activeDays].sort() as CalendarDate[];
  if (sorted.length === 0) return 0;

  let longest = 1;
  let run = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]!;
    const currentDay = sorted[i]!;
    const gap = diffDays(previous, currentDay);

    if (gap === 1) {
      run += 1;
    } else {
      // The run survives a gap made entirely of rest days.
      const between = eachDay(addDays(previous, 1), addDays(currentDay, -1));
      run = between.length > 0 && between.every((day) => rest.has(isoWeekday(day))) ? run + 1 : 1;
    }
    longest = Math.max(longest, run);
  }

  return longest;
}

export interface HeatmapCell {
  date: CalendarDate;
  newItems: number;
  reviews: number;
  total: number;
  /** 0 = nothing, 1-4 = increasing intensity. */
  level: 0 | 1 | 2 | 3 | 4;
  isRestDay: boolean;
  isFuture: boolean;
}

/**
 * Activity grid for the last `days` days, ending today.
 *
 * Intensity is relative to the learner's own busiest day rather than to a fixed
 * scale: someone doing 7 items a day should see a full-looking grid too.
 */
export function buildHeatmap(args: {
  activity: readonly DayActivity[];
  today: CalendarDate;
  days: number;
  restWeekdays: readonly IsoWeekday[];
}): HeatmapCell[] {
  const { activity, today, days, restWeekdays } = args;
  const rest = new Set(restWeekdays);
  const byDate = new Map(activity.map((a) => [a.date, a]));

  const start = addDays(today, -(Math.max(days, 1) - 1));
  const cells = eachDay(start, today);

  const busiest = Math.max(...activity.map((a) => a.newItems + a.reviews), 1);

  return cells.map((date) => {
    const found = byDate.get(date);
    const newItems = found?.newItems ?? 0;
    const reviews = found?.reviews ?? 0;
    const total = newItems + reviews;

    return {
      date,
      newItems,
      reviews,
      total,
      level: intensityLevel(total, busiest),
      isRestDay: rest.has(isoWeekday(date)),
      isFuture: compareDates(date, today) > 0,
    };
  });
}

function intensityLevel(total: number, busiest: number): 0 | 1 | 2 | 3 | 4 {
  if (total === 0) return 0;
  const ratio = total / busiest;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export interface LevelProgress {
  level: string;
  total: number;
  learned: number;
  percent: number;
}

/** Progress per CEFR level, for the A0 → B2 ring on the dashboard. */
export function computeLevelProgress(args: {
  itemCountByLevel: Readonly<Record<string, number>>;
  learnedByLevel: Readonly<Record<string, number>>;
  levels: readonly string[];
}): LevelProgress[] {
  return args.levels.map((level) => {
    const total = args.itemCountByLevel[level] ?? 0;
    const learned = Math.min(args.learnedByLevel[level] ?? 0, total);
    return {
      level,
      total,
      learned,
      percent: total > 0 ? Math.round((learned / total) * 100) : 0,
    };
  });
}
