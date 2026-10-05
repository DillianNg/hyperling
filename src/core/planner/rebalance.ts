import { MAX_NEW_PER_DAY, MIN_NEW_PER_DAY } from '@/config/app.config';
import { addDays, compareDates, type CalendarDate, type IsoWeekday } from './calendar';
import { countStudyDays, effectiveCeiling, formatVi, nthStudyDay } from './plan';

/**
 * What to do when the learner falls behind.
 *
 * The planner proposes, it never decides. Silently raising someone's daily dose
 * because they missed a week is how a plan stops being theirs — so this returns
 * three options with their concrete consequences and lets the learner choose.
 */

export interface RebalanceInput {
  totalItems: number;
  /** Items actually finished so far. */
  completedItems: number;
  startDate: CalendarDate;
  targetDate: CalendarDate;
  /** The learner's today, in their own timezone. */
  today: CalendarDate;
  restWeekdays: readonly IsoWeekday[];
  newPerDay: number;
  bufferDays: number;
  maxNewPerDay?: number;
}

export type RebalanceStrategy = 'catch-up' | 'use-buffer' | 'move-target';

export interface RebalanceOption {
  strategy: RebalanceStrategy;
  available: boolean;
  /** Daily dose this option would require. */
  newPerDay: number;
  /** Target date this option would end on. */
  targetDate: CalendarDate;
  /** Buffer days this option consumes. */
  bufferUsed: number;
  /** Vietnamese, ready to show. */
  summary: string;
  /** Why it is unavailable, when it is. */
  unavailableReason?: string;
}

export interface RebalanceReport {
  /** Items that should have been done by today. */
  expectedByNow: number;
  /** Items behind. Zero or negative means on or ahead of schedule. */
  itemsBehind: number;
  /** Items behind expressed in days, the way the source spreadsheet reported it. */
  daysBehind: number;
  isBehind: boolean;
  remainingItems: number;
  remainingStudyDays: number;
  options: RebalanceOption[];
}

export function computeRebalance(input: RebalanceInput): RebalanceReport {
  const {
    totalItems,
    completedItems,
    startDate,
    targetDate,
    today,
    restWeekdays,
    newPerDay,
    bufferDays,
  } = input;

  const ceiling = effectiveCeiling(input.maxNewPerDay);
  const remainingItems = Math.max(totalItems - completedItems, 0);

  // Days elapsed is clamped at zero: a plan starting in the future is not behind.
  const elapsedStudyDays =
    compareDates(today, startDate) < 0 ? 0 : countStudyDays(startDate, today, restWeekdays);

  const expectedByNow = Math.min(elapsedStudyDays * newPerDay, totalItems);
  const itemsBehind = Math.max(expectedByNow - completedItems, 0);
  const daysBehind = newPerDay > 0 ? Math.ceil(itemsBehind / newPerDay) : 0;

  // Remaining days start tomorrow: today's session may still be ahead of the learner.
  const firstRemainingDay = addDays(today, 1);
  const remainingStudyDays =
    compareDates(firstRemainingDay, targetDate) > 0
      ? 0
      : countStudyDays(firstRemainingDay, targetDate, restWeekdays);

  return {
    expectedByNow,
    itemsBehind,
    daysBehind,
    isBehind: itemsBehind > 0,
    remainingItems,
    remainingStudyDays,
    options: [
      catchUpOption({ remainingItems, remainingStudyDays, targetDate, ceiling, newPerDay }),
      bufferOption({
        remainingItems,
        newPerDay,
        targetDate,
        bufferDays,
        daysBehind,
        restWeekdays,
      }),
      moveTargetOption({ remainingItems, newPerDay, targetDate, restWeekdays, firstRemainingDay }),
    ],
  };
}

/** Option 1: finish on time by raising the daily dose, if the ceiling allows. */
function catchUpOption(args: {
  remainingItems: number;
  remainingStudyDays: number;
  targetDate: CalendarDate;
  ceiling: number;
  newPerDay: number;
}): RebalanceOption {
  const { remainingItems, remainingStudyDays, targetDate, ceiling, newPerDay } = args;

  if (remainingStudyDays <= 0) {
    return {
      strategy: 'catch-up',
      available: false,
      newPerDay,
      targetDate,
      bufferUsed: 0,
      summary: 'Dồn nhẹ trong phạm vi trần',
      unavailableReason: 'Không còn ngày học nào trước ngày mục tiêu.',
    };
  }

  const required = Math.max(Math.ceil(remainingItems / remainingStudyDays), MIN_NEW_PER_DAY);
  const available = required <= ceiling;

  return {
    strategy: 'catch-up',
    available,
    newPerDay: Math.min(required, ceiling),
    targetDate,
    bufferUsed: 0,
    summary: available
      ? `Tăng từ ${newPerDay} lên ${required} mục/ngày, giữ nguyên ngày mục tiêu ${formatVi(targetDate)}.`
      : `Cần ${required} mục/ngày, vượt trần ${ceiling} mục/ngày.`,
    ...(available
      ? {}
      : {
          unavailableReason:
            `Trần ${MAX_NEW_PER_DAY} mục/ngày là giới hạn cứng — nhận thêm sẽ là một lời hứa ` +
            'khó giữ. Hãy chọn một trong hai phương án còn lại.',
        }),
  };
}

/** Option 2: keep the pace and spend buffer days, if enough remain. */
function bufferOption(args: {
  remainingItems: number;
  newPerDay: number;
  targetDate: CalendarDate;
  bufferDays: number;
  daysBehind: number;
  restWeekdays: readonly IsoWeekday[];
}): RebalanceOption {
  const { remainingItems, newPerDay, targetDate, bufferDays, daysBehind, restWeekdays } = args;
  const available = daysBehind > 0 && daysBehind <= bufferDays && remainingItems > 0;
  const newTarget = nthStudyDay(addDays(targetDate, 1), daysBehind, restWeekdays) ?? targetDate;

  return {
    strategy: 'use-buffer',
    available,
    newPerDay,
    targetDate: available ? newTarget : targetDate,
    bufferUsed: available ? daysBehind : 0,
    summary: available
      ? `Giữ ${newPerDay} mục/ngày, dùng ${daysBehind}/${bufferDays} ngày đệm. ` +
        `Ngày hoàn thành: ${formatVi(newTarget)}, còn lại ${bufferDays - daysBehind} ngày đệm.`
      : `Giữ ${newPerDay} mục/ngày và dùng ngày đệm.`,
    ...(available
      ? {}
      : {
          unavailableReason:
            daysBehind > bufferDays
              ? `Bạn đang trễ ${daysBehind} ngày, nhiều hơn ${bufferDays} ngày đệm còn lại.`
              : 'Bạn chưa trễ ngày nào nên chưa cần dùng đệm.',
        }),
  };
}

/** Option 3: keep the pace and move the goal. Always possible. */
function moveTargetOption(args: {
  remainingItems: number;
  newPerDay: number;
  targetDate: CalendarDate;
  restWeekdays: readonly IsoWeekday[];
  firstRemainingDay: CalendarDate;
}): RebalanceOption {
  const { remainingItems, newPerDay, targetDate, restWeekdays, firstRemainingDay } = args;

  const daysNeeded = Math.max(Math.ceil(remainingItems / Math.max(newPerDay, 1)), 1);
  const newTarget = nthStudyDay(firstRemainingDay, daysNeeded, restWeekdays) ?? targetDate;

  return {
    strategy: 'move-target',
    available: true,
    newPerDay,
    targetDate: newTarget,
    bufferUsed: 0,
    summary:
      compareDates(newTarget, targetDate) > 0
        ? `Giữ ${newPerDay} mục/ngày, dời mục tiêu từ ${formatVi(targetDate)} sang ${formatVi(newTarget)}.`
        : `Giữ ${newPerDay} mục/ngày — bạn vẫn kịp ngày ${formatVi(targetDate)}.`,
  };
}

/**
 * "At your current pace you will reach the goal on X." Based on what the learner
 * has actually been doing, not on what the plan asked for.
 */
export function forecastAtCurrentPace(args: {
  totalItems: number;
  completedItems: number;
  startDate: CalendarDate;
  today: CalendarDate;
  restWeekdays: readonly IsoWeekday[];
}): { actualPerDay: number; forecastDate: CalendarDate | null } {
  const { totalItems, completedItems, startDate, today, restWeekdays } = args;

  const elapsed = compareDates(today, startDate) < 0 ? 0 : countStudyDays(startDate, today, restWeekdays);
  if (elapsed <= 0 || completedItems <= 0) {
    return { actualPerDay: 0, forecastDate: null };
  }

  const actualPerDay = completedItems / elapsed;
  const remaining = Math.max(totalItems - completedItems, 0);
  if (remaining === 0) return { actualPerDay, forecastDate: today };

  const daysNeeded = Math.ceil(remaining / actualPerDay);
  return { actualPerDay, forecastDate: nthStudyDay(addDays(today, 1), daysNeeded, restWeekdays) };
}
