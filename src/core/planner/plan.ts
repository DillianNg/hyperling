import {
  BUFFER_DAYS_DIVISOR,
  BUFFER_DAYS_RANGE,
  MAX_NEW_PER_DAY,
  MIN_NEW_PER_DAY,
} from '@/config/app.config';
import {
  addDays,
  compareDates,
  diffDays,
  eachDay,
  isoWeekday,
  type CalendarDate,
  type IsoWeekday,
} from './calendar';

/**
 * The planner. A pure function: no clock, no database, no randomness. "Today" is
 * always passed in, so every behaviour here is reproducible in a test.
 *
 * The one rule that shapes everything: the daily ceiling is hard. A timeframe
 * shorter than what the ceiling allows is refused with the earliest feasible
 * date, rather than accepted and quietly failed halfway through.
 *
 * Specification and the reasoning behind each rule: docs/PLANNER_SPEC.md
 */

export interface PlanInput {
  /** Items in the range [current level -> goal]. */
  totalItems: number;
  startDate: CalendarDate;
  targetDate: CalendarDate;
  /** ISO weekdays the learner does not study. Empty means every day. */
  restWeekdays: readonly IsoWeekday[];
  /** The learner may lower the ceiling, never raise it above MAX_NEW_PER_DAY. */
  maxNewPerDay?: number;
}

export interface DailyPlan {
  date: CalendarDate;
  /** 1-based index over study days. Rest days carry the previous index. */
  dayIndex: number;
  plannedNew: number;
  isRestDay: boolean;
  /** Items planned from the start through this day inclusive. */
  cumulative: number;
}

export interface Plan {
  newPerDay: number;
  /** Days in the range that are not rest days. */
  studyDays: number;
  /** Fewest study days this many items can possibly take. */
  minDays: number;
  bufferDays: number;
  /** Day the last item is scheduled, at the planned pace. */
  forecastDate: CalendarDate;
  /** targetDate plus the buffer: the real last-chance date. */
  hardDeadline: CalendarDate;
  days: DailyPlan[];
}

export type BlockedReason = 'no-items' | 'no-study-days' | 'invalid-range' | 'timeframe-too-short';

export interface PlanBlocked {
  reason: BlockedReason;
  studyDays: number;
  minDays: number;
  /** Soonest target date that works at the ceiling. Null when no date could. */
  earliestFeasibleTarget: CalendarDate | null;
  /** Vietnamese, ready to show. */
  message: string;
}

export type PlanOutcome = { ok: true; plan: Plan } | { ok: false; blocked: PlanBlocked };

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** The ceiling actually in force: the learner's own limit, never above the global one. */
export function effectiveCeiling(maxNewPerDay?: number): number {
  if (maxNewPerDay === undefined) return MAX_NEW_PER_DAY;
  if (!Number.isFinite(maxNewPerDay)) return MAX_NEW_PER_DAY;
  return clamp(Math.floor(maxNewPerDay), MIN_NEW_PER_DAY, MAX_NEW_PER_DAY);
}

function normalizeRestWeekdays(restWeekdays: readonly IsoWeekday[]): Set<IsoWeekday> {
  return new Set(restWeekdays.filter((d) => d >= 1 && d <= 7));
}

export function countStudyDays(
  startDate: CalendarDate,
  targetDate: CalendarDate,
  restWeekdays: readonly IsoWeekday[],
): number {
  if (compareDates(startDate, targetDate) > 0) return 0;
  const rest = normalizeRestWeekdays(restWeekdays);
  if (rest.size >= 7) return 0;

  // Whole weeks contribute a fixed number of study days; only the remainder
  // needs iterating, so a ten-year range costs the same as a ten-day one.
  const totalDays = diffDays(startDate, targetDate) + 1;
  const studyPerWeek = 7 - rest.size;
  const wholeWeeks = Math.floor(totalDays / 7);
  let count = wholeWeeks * studyPerWeek;

  for (let i = wholeWeeks * 7; i < totalDays; i += 1) {
    if (!rest.has(isoWeekday(addDays(startDate, i)))) count += 1;
  }
  return count;
}

/** Date of the n-th study day counting from `startDate` (1-based). */
export function nthStudyDay(
  startDate: CalendarDate,
  n: number,
  restWeekdays: readonly IsoWeekday[],
): CalendarDate | null {
  if (n < 1) return null;
  const rest = normalizeRestWeekdays(restWeekdays);
  if (rest.size >= 7) return null;

  let seen = 0;
  // Bounded: with at most 6 rest days a week, 7n days always suffice.
  for (let offset = 0; offset <= n * 7 + 7; offset += 1) {
    const date = addDays(startDate, offset);
    if (rest.has(isoWeekday(date))) continue;
    seen += 1;
    if (seen === n) return date;
  }
  return null;
}

/**
 * Buffer days absorbed into the plan, scaled with its length and clamped to the
 * configured range. The 90-day benchmark lands on 15, matching the source plan.
 */
export function computeBufferDays(startDate: CalendarDate, targetDate: CalendarDate): number {
  const totalPlanDays = Math.max(diffDays(startDate, targetDate) + 1, 0);
  const [low, high] = BUFFER_DAYS_RANGE;
  return clamp(Math.ceil(totalPlanDays / BUFFER_DAYS_DIVISOR), low, high);
}

export function computePlan(input: PlanInput): PlanOutcome {
  const { totalItems, startDate, targetDate, restWeekdays } = input;
  const ceiling = effectiveCeiling(input.maxNewPerDay);

  if (!Number.isFinite(totalItems) || totalItems <= 0) {
    return blocked('no-items', 0, 0, null, 'Khoảng trình độ bạn chọn chưa có mục nào để học.');
  }

  const minDays = Math.ceil(totalItems / ceiling);

  if (compareDates(startDate, targetDate) > 0) {
    return blocked(
      'invalid-range',
      0,
      minDays,
      nthStudyDay(startDate, minDays, restWeekdays),
      'Ngày mục tiêu đang sớm hơn ngày bắt đầu.',
    );
  }

  const rest = normalizeRestWeekdays(restWeekdays);
  if (rest.size >= 7) {
    return blocked(
      'no-study-days',
      0,
      minDays,
      null,
      'Bạn đã chọn nghỉ cả 7 ngày trong tuần, nên không còn ngày nào để học. Hãy bỏ bớt ít nhất một ngày nghỉ.',
    );
  }

  const studyDays = countStudyDays(startDate, targetDate, restWeekdays);

  if (studyDays < minDays) {
    const earliest = nthStudyDay(startDate, minDays, restWeekdays);
    return blocked(
      'timeframe-too-short',
      studyDays,
      minDays,
      earliest,
      buildTooShortMessage({ totalItems, studyDays, minDays, ceiling, earliest }),
    );
  }

  const newPerDay = clamp(Math.ceil(totalItems / studyDays), MIN_NEW_PER_DAY, ceiling);
  const days = buildSchedule({ totalItems, startDate, targetDate, restWeekdays, newPerDay });

  const lastScheduled = days.findLast((d) => d.plannedNew > 0);
  const bufferDays = computeBufferDays(startDate, targetDate);

  return {
    ok: true,
    plan: {
      newPerDay,
      studyDays,
      minDays,
      bufferDays,
      forecastDate: lastScheduled?.date ?? targetDate,
      hardDeadline: addDays(targetDate, bufferDays),
      days,
    },
  };
}

function buildSchedule(args: {
  totalItems: number;
  startDate: CalendarDate;
  targetDate: CalendarDate;
  restWeekdays: readonly IsoWeekday[];
  newPerDay: number;
}): DailyPlan[] {
  const { totalItems, startDate, targetDate, restWeekdays, newPerDay } = args;
  const rest = normalizeRestWeekdays(restWeekdays);

  let remaining = totalItems;
  let cumulative = 0;
  let dayIndex = 0;

  return eachDay(startDate, targetDate).map((date) => {
    const isRestDay = rest.has(isoWeekday(date));
    if (isRestDay) {
      return { date, dayIndex, plannedNew: 0, isRestDay: true, cumulative };
    }

    dayIndex += 1;
    // The last working day takes whatever is left, so the final day is lighter
    // than the rest rather than overshooting the total.
    const plannedNew = Math.min(newPerDay, remaining);
    remaining -= plannedNew;
    cumulative += plannedNew;

    return { date, dayIndex, plannedNew, isRestDay: false, cumulative };
  });
}

function buildTooShortMessage(args: {
  totalItems: number;
  studyDays: number;
  minDays: number;
  ceiling: number;
  earliest: CalendarDate | null;
}): string {
  const { totalItems, studyDays, minDays, ceiling, earliest } = args;
  const base =
    `Khung thời gian này quá ngắn. Bạn có ${totalItems} mục, mà tối đa ${ceiling} mục/ngày, ` +
    `nên cần ít nhất ${minDays} ngày học — khung bạn chọn chỉ có ${studyDays} ngày học.`;
  return earliest
    ? `${base} Ngày mục tiêu sớm nhất khả thi là ${formatVi(earliest)}.`
    : `${base} Hãy chọn ngày mục tiêu muộn hơn.`;
}

function blocked(
  reason: BlockedReason,
  studyDays: number,
  minDays: number,
  earliestFeasibleTarget: CalendarDate | null,
  message: string,
): PlanOutcome {
  return { ok: false, blocked: { reason, studyDays, minDays, earliestFeasibleTarget, message } };
}

/** `2027-01-02` -> `02/01/2027`. Presentation helper kept pure for message building. */
export function formatVi(date: CalendarDate): string {
  const [y, m, d] = date.split('-') as [string, string, string];
  return `${d}/${m}/${y}`;
}
