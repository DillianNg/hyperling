'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { MAX_NEW_PER_DAY, SESSION_STAGES } from '@/config/app.config';
import { parseCalendarDate } from '@/core/planner/calendar';
import { getEnrollment, updateEnrollment } from '@/lib/data/enrollments';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * Plan adjustments. Each one is an explicit choice the learner made; nothing
 * here runs on its own.
 */

const rebalanceSchema = z.object({
  enrollmentId: z.string().uuid(),
  strategy: z.enum(['catch-up', 'use-buffer', 'move-target']),
  newPerDay: z.number().int().min(1).max(MAX_NEW_PER_DAY),
  targetDate: z.string(),
});

export async function applyRebalance(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Phiên đăng nhập đã hết hạn.' };

  const parsed = rebalanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Lựa chọn không hợp lệ.' };

  const targetDate = parseCalendarDate(parsed.data.targetDate);
  if (!targetDate) return { ok: false, error: 'Ngày mục tiêu không hợp lệ.' };

  // RLS already scopes this, but reading first turns a silent no-op into a message.
  const enrollment = await getEnrollment(parsed.data.enrollmentId);
  if (!enrollment) return { ok: false, error: 'Không tìm thấy khóa học.' };

  const ok = await updateEnrollment(enrollment.id, {
    newPerDay: parsed.data.newPerDay,
    targetDate,
  });

  if (!ok) return { ok: false, error: 'Không lưu được thay đổi.' };

  revalidatePath(`/ke-hoach/${enrollment.id}`);
  revalidatePath('/bang-dieu-khien');
  return { ok: true };
}

const stageSchema = z.object({
  enrollmentId: z.string().uuid(),
  stageFlags: z.object({
    review: z.boolean(),
    learn: z.boolean(),
    consolidate: z.boolean(),
  }),
});

export async function updateStageFlags(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Phiên đăng nhập đã hết hạn.' };

  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Cài đặt không hợp lệ.' };

  // Turning every stage off would leave an empty session every day.
  const anyOn = SESSION_STAGES.some((stage) => parsed.data.stageFlags[stage]);
  if (!anyOn) return { ok: false, error: 'Phải bật ít nhất một giai đoạn.' };

  const ok = await updateEnrollment(parsed.data.enrollmentId, {
    stageFlags: parsed.data.stageFlags,
  });

  if (!ok) return { ok: false, error: 'Không lưu được cài đặt.' };

  revalidatePath(`/ke-hoach/${parsed.data.enrollmentId}`);
  return { ok: true };
}
