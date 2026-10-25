import 'server-only';
import { row, rows } from './rows';
import { createClient } from '@/lib/supabase/server';
import type { SessionStage } from '@/config/app.config';
import { parseCalendarDate, toCalendarDate, type CalendarDate, type IsoWeekday } from '@/core/planner/calendar';

/**
 * Enrollment queries. A learner may run several courses at once, so almost
 * everything here is scoped by enrollment rather than by user.
 */

export interface Enrollment {
  id: string;
  courseId: string;
  levelFrom: string;
  levelTo: string;
  startDate: CalendarDate;
  targetDate: CalendarDate;
  newPerDay: number;
  restWeekdays: IsoWeekday[];
  bufferDays: number;
  timezone: string;
  stageFlags: Record<SessionStage, boolean>;
  status: 'active' | 'paused' | 'done' | 'abandoned';
  /**
   * Whether this enrollment runs a curriculum or the learner's own notebook.
   *
   * Read from the course rather than stored here, so the two can never disagree.
   * A notebook enrollment carries no plan: its date and `newPerDay` columns
   * exist only to satisfy the table's constraints and are never fed to the
   * planner — sentences arrive whenever the learner meets them, so there is no
   * total to divide by and no target date to miss.
   */
  kind: 'curriculum' | 'notebook';
}

interface EnrollmentRow {
  id: string;
  course_id: string;
  level_from: string;
  level_to: string;
  start_date: string;
  target_date: string;
  new_per_day: number;
  rest_weekdays: number[] | null;
  buffer_days: number;
  timezone: string;
  stage_flags: Partial<Record<SessionStage, boolean>> | null;
  status: string;
  // Embedded from courses. PostgREST returns an object for this many-to-one
  // relationship, but an array shape is tolerated so a change there degrades
  // to 'curriculum' instead of throwing.
  courses: { kind?: string } | Array<{ kind?: string }> | null;
}

const ENROLLMENT_SELECT =
  'id, course_id, level_from, level_to, start_date, target_date, new_per_day, ' +
  'rest_weekdays, buffer_days, timezone, stage_flags, status, courses!inner(kind)';

function toEnrollment(row: EnrollmentRow): Enrollment | null {
  const startDate = parseCalendarDate(row.start_date);
  const targetDate = parseCalendarDate(row.target_date);
  // A row with unreadable dates is unusable; skip it rather than crash the page.
  if (!startDate || !targetDate) return null;

  return {
    id: row.id,
    courseId: row.course_id,
    levelFrom: row.level_from,
    levelTo: row.level_to,
    startDate,
    targetDate,
    newPerDay: row.new_per_day,
    restWeekdays: (row.rest_weekdays ?? []).filter((d): d is IsoWeekday => d >= 1 && d <= 7),
    bufferDays: row.buffer_days,
    timezone: row.timezone,
    stageFlags: {
      review: row.stage_flags?.review ?? true,
      learn: row.stage_flags?.learn ?? true,
      consolidate: row.stage_flags?.consolidate ?? true,
    },
    status: (row.status as Enrollment['status']) ?? 'active',
    kind: courseKind(row.courses),
  };
}

function courseKind(embedded: EnrollmentRow['courses']): Enrollment['kind'] {
  const course = Array.isArray(embedded) ? embedded[0] : embedded;
  return course?.kind === 'notebook' ? 'notebook' : 'curriculum';
}

export async function listEnrollments(status?: Enrollment['status']): Promise<Enrollment[]> {
  const supabase = await createClient();
  let query = supabase.from('enrollments').select(ENROLLMENT_SELECT).order('created_at');
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error || !data) return [];
  return rows<EnrollmentRow>(data).flatMap((item) => toEnrollment(item) ?? []);
}

export async function getEnrollment(enrollmentId: string): Promise<Enrollment | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('enrollments')
    .select(ENROLLMENT_SELECT)
    .eq('id', enrollmentId)
    .maybeSingle();

  if (error || !data) return null;
  const found = row<EnrollmentRow>(data);
  return found ? toEnrollment(found) : null;
}

export interface CreateEnrollmentInput {
  userId: string;
  courseId: string;
  levelFrom: string;
  levelTo: string;
  startDate: CalendarDate;
  targetDate: CalendarDate;
  newPerDay: number;
  restWeekdays: readonly IsoWeekday[];
  bufferDays: number;
  timezone: string;
}

export async function createEnrollment(
  input: CreateEnrollmentInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('enrollments')
    .insert({
      user_id: input.userId,
      course_id: input.courseId,
      level_from: input.levelFrom,
      level_to: input.levelTo,
      start_date: input.startDate,
      target_date: input.targetDate,
      new_per_day: input.newPerDay,
      rest_weekdays: [...input.restWeekdays],
      buffer_days: input.bufferDays,
      timezone: input.timezone,
    })
    .select('id')
    .single();

  if (error) {
    // The partial unique index guarantees one active enrollment per course.
    if (error.code === '23505') {
      return { ok: false, error: 'Bạn đã ghi danh khóa này rồi. Hãy mở khóa đang học thay vì tạo mới.' };
    }
    return { ok: false, error: `Không tạo được khóa học: ${error.message}` };
  }

  const created = row<{ id: string }>(data);
  return created ? { ok: true, id: created.id } : { ok: false, error: 'Không đọc được khóa vừa tạo.' };
}

export async function updateEnrollment(
  enrollmentId: string,
  patch: Partial<{
    targetDate: CalendarDate;
    newPerDay: number;
    restWeekdays: readonly IsoWeekday[];
    stageFlags: Record<SessionStage, boolean>;
    status: Enrollment['status'];
  }>,
): Promise<boolean> {
  const supabase = await createClient();
  const update: Record<string, unknown> = {};
  if (patch.targetDate) update.target_date = patch.targetDate;
  if (patch.newPerDay !== undefined) update.new_per_day = patch.newPerDay;
  if (patch.restWeekdays) update.rest_weekdays = [...patch.restWeekdays];
  if (patch.stageFlags) update.stage_flags = patch.stageFlags;
  if (patch.status) update.status = patch.status;
  if (Object.keys(update).length === 0) return true;

  const { error } = await supabase.from('enrollments').update(update).eq('id', enrollmentId);
  return !error;
}

interface DailyPlanDbRow {
  plan_date: string;
  day_index: number;
  planned_new: number;
  completed_new: number;
  completed_reviews: number;
}

export interface DailyPlanRow {
  planDate: CalendarDate;
  dayIndex: number;
  plannedNew: number;
  completedNew: number;
  completedReviews: number;
}

/**
 * Today's activity row. Created on first study of the day rather than up front:
 * the schedule itself is computed by the planner, so storing ninety empty rows
 * per enrollment would only create something to keep in sync.
 */
export async function getDailyPlan(
  enrollmentId: string,
  date: CalendarDate,
): Promise<DailyPlanRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_plans')
    .select('plan_date, day_index, planned_new, completed_new, completed_reviews')
    .eq('enrollment_id', enrollmentId)
    .eq('plan_date', date)
    .maybeSingle();

  if (error || !data) return null;
  const found = row<DailyPlanDbRow>(data);
  const planDate = found ? parseCalendarDate(found.plan_date) : null;
  if (!found || !planDate) return null;

  return {
    planDate,
    dayIndex: found.day_index,
    plannedNew: found.planned_new,
    completedNew: found.completed_new,
    completedReviews: found.completed_reviews,
  };
}

/** Every day with recorded activity, for the heatmap and the progress chart. */
export async function listDailyPlans(enrollmentId: string): Promise<DailyPlanRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_plans')
    .select('plan_date, day_index, planned_new, completed_new, completed_reviews')
    .eq('enrollment_id', enrollmentId)
    .order('plan_date');

  if (error || !data) return [];

  return rows<DailyPlanDbRow>(data).flatMap((item) => {
    const planDate = parseCalendarDate(item.plan_date);
    return planDate
      ? [
          {
            planDate,
            dayIndex: item.day_index,
            plannedNew: item.planned_new,
            completedNew: item.completed_new,
            completedReviews: item.completed_reviews,
          },
        ]
      : [];
  });
}

/** Items the learner has finished at least one review of, across the enrollment. */
export async function countCompletedItems(enrollmentId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('card_states')
    .select('item_id', { count: 'exact', head: true })
    .eq('enrollment_id', enrollmentId)
    .gt('reps', 0);

  return error ? 0 : (count ?? 0);
}

/** What a reset would destroy — and keep — so the confirmation can name real numbers. */
export interface EnrollmentFootprint {
  reviewedCards: number;
  reviewLogs: number;
  /** Survives a reset: see deleteEnrollment. Shown so that is not a surprise. */
  flaggedItems: number;
}

export async function getEnrollmentFootprint(enrollmentId: string): Promise<EnrollmentFootprint> {
  const supabase = await createClient();

  const [cards, logs, flags] = await Promise.all([
    supabase
      .from('card_states')
      .select('item_id', { count: 'exact', head: true })
      .eq('enrollment_id', enrollmentId)
      .gt('reps', 0),
    supabase
      .from('review_logs')
      .select('id', { count: 'exact', head: true })
      .eq('enrollment_id', enrollmentId),
    supabase.from('item_flags').select('item_id', { count: 'exact', head: true }),
  ]);

  return {
    reviewedCards: cards.error ? 0 : (cards.count ?? 0),
    reviewLogs: logs.error ? 0 : (logs.count ?? 0),
    flaggedItems: flags.error ? 0 : (flags.count ?? 0),
  };
}

/**
 * Removes an enrollment and, by foreign-key cascade, the plan state hanging off
 * it: daily_plans, card_states, review_logs and study_sessions.
 *
 * RLS restricts the delete to the caller's own rows, and the cascade is what
 * reaches the children — review_logs deliberately has no delete policy of its
 * own, because a learner may discard a whole course but may never rewrite the
 * history of one they are still taking.
 *
 * Two things deliberately survive:
 *
 *   item_flags  keyed (user_id, item_id) rather than by enrollment, because a
 *               flag is an annotation on a sentence and `note` holds text the
 *               learner wrote themselves. Deleting authored text under a button
 *               labelled "delete study plan" would be the wrong default, so the
 *               confirmation says they are kept instead.
 *   profiles    the account stays signed in; this resets the plan, not the user.
 *
 * Content tables are untouched throughout: this resets the learner, not the course.
 */
export async function deleteEnrollment(enrollmentId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from('enrollments').delete().eq('id', enrollmentId);
  return { ok: !error };
}

export { toCalendarDate };
