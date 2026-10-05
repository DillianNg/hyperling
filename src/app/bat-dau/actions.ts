'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { CEFR_LEVELS, MAX_NEW_PER_DAY } from '@/config/app.config';
import { computeBufferDays, computePlan } from '@/core/planner/plan';
import { countItemsForGoal } from '@/core/planner/levels';
import { parseCalendarDate, type IsoWeekday } from '@/core/planner/calendar';
import { getCourse } from '@/lib/data/courses';
import { createEnrollment } from '@/lib/data/enrollments';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * Creating an enrollment.
 *
 * The onboarding UI previews the plan locally with the same pure planner, but
 * the server recomputes it from scratch: the client's numbers are a preview,
 * never the thing that gets stored.
 */

const schema = z.object({
  courseId: z.string().min(1),
  currentLevel: z.enum(CEFR_LEVELS),
  goalLevel: z.enum(CEFR_LEVELS),
  startDate: z.string(),
  targetDate: z.string(),
  restWeekdays: z.array(z.number().int().min(1).max(7)).max(6).default([]),
  timezone: z.string().min(1).default('Asia/Ho_Chi_Minh'),
});

export type CreatePlanState =
  | { status: 'idle' }
  | { status: 'error'; message: string };

export async function createPlan(
  _previous: CreatePlanState,
  formData: FormData,
): Promise<CreatePlanState> {
  const user = await getCurrentUser();
  if (!user) return { status: 'error', message: 'Bạn cần đăng nhập để tạo lộ trình.' };

  const parsed = schema.safeParse({
    courseId: formData.get('courseId'),
    currentLevel: formData.get('currentLevel'),
    goalLevel: formData.get('goalLevel'),
    startDate: formData.get('startDate'),
    targetDate: formData.get('targetDate'),
    restWeekdays: JSON.parse(String(formData.get('restWeekdays') ?? '[]')),
    timezone: formData.get('timezone'),
  });

  if (!parsed.success) {
    return { status: 'error', message: 'Thông tin lộ trình không hợp lệ. Hãy thử lại từ đầu.' };
  }

  const startDate = parseCalendarDate(parsed.data.startDate);
  const targetDate = parseCalendarDate(parsed.data.targetDate);
  if (!startDate || !targetDate) {
    return { status: 'error', message: 'Ngày không hợp lệ.' };
  }

  const course = await getCourse(parsed.data.courseId);
  if (!course) return { status: 'error', message: 'Không tìm thấy khóa học.' };

  const totalItems = countItemsForGoal({
    currentLevel: parsed.data.currentLevel,
    goalLevel: parsed.data.goalLevel,
    itemCountByLevel: course.itemCountByLevel,
  });

  const restWeekdays = parsed.data.restWeekdays as IsoWeekday[];

  // Recomputed server-side: the ceiling must hold even against a crafted request.
  const outcome = computePlan({
    totalItems,
    startDate,
    targetDate,
    restWeekdays,
    maxNewPerDay: MAX_NEW_PER_DAY,
  });

  if (!outcome.ok) {
    return { status: 'error', message: outcome.blocked.message };
  }

  const created = await createEnrollment({
    userId: user.id,
    courseId: course.id,
    levelFrom: parsed.data.currentLevel,
    levelTo: parsed.data.goalLevel,
    startDate,
    targetDate,
    newPerDay: outcome.plan.newPerDay,
    restWeekdays,
    bufferDays: computeBufferDays(startDate, targetDate),
    timezone: parsed.data.timezone,
  });

  if (!created.ok) return { status: 'error', message: created.error };

  redirect('/bang-dieu-khien');
}
