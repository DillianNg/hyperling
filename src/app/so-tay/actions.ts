'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/supabase/server';
import { getCourse } from '@/lib/data/courses';
import { listEnrollments, type Enrollment } from '@/lib/data/enrollments';
import {
  createNotebookItem,
  deleteNotebookItem,
  ensureNotebookEnrollment,
  notebookCourseIdFor,
  updateNotebookItem,
} from '@/lib/data/notebook';
import { notebookItemInputSchema } from '@/core/content/notebook';
import { calendarDateInTimezone } from '@/core/planner/calendar';

/**
 * Writing to the learner's notebook.
 *
 * Every action resolves the notebook from the learner's own active enrollment
 * rather than taking a course or notebook id from the client, so there is no id
 * for a caller to swap. The item id on edit and delete *is* client-supplied, and
 * both the query and the RLS policy pin it to `owner_id = auth.uid()`.
 */

export type NotebookActionResult = { ok: true } | { ok: false; error: string };

const NOT_SIGNED_IN = 'Bạn cần đăng nhập.';
const NO_COURSE = 'Bạn cần bắt đầu một khóa học trước khi thêm câu của riêng mình.';

interface NotebookTarget {
  userId: string;
  notebookCourseId: string;
  enrollment: Enrollment;
}

/**
 * The notebook the signed-in learner may write to, created on first use.
 *
 * A notebook belongs to a language the learner is already studying — it holds
 * German sentences because they are learning German, and it reuses that
 * course's field schema to render them. So a learner with no course has no
 * notebook yet, and is told that rather than handed an empty one.
 */
async function resolveTarget(): Promise<
  { ok: true; target: NotebookTarget } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: NOT_SIGNED_IN };

  const enrollments = await listEnrollments('active');
  const enrollment = enrollments.find((item) => item.kind === 'curriculum');
  if (!enrollment) return { ok: false, error: NO_COURSE };

  const course = await getCourse(enrollment.courseId);
  if (!course) return { ok: false, error: NO_COURSE };

  const notebookCourseId = notebookCourseIdFor(course.targetLanguage);
  if (!notebookCourseId) {
    return { ok: false, error: `Chưa hỗ trợ sổ tay cho ngôn ngữ "${course.targetLanguage}".` };
  }

  const notebook = await ensureNotebookEnrollment({
    userId: user.id,
    notebookCourseId,
    timezone: enrollment.timezone,
    today: calendarDateInTimezone(new Date(), enrollment.timezone),
  });

  if (!notebook.ok) return { ok: false, error: notebook.error };

  return { ok: true, target: { userId: user.id, notebookCourseId, enrollment } };
}

function refresh(): void {
  revalidatePath('/so-tay');
  revalidatePath('/bang-dieu-khien');
}

export async function addSentence(input: unknown): Promise<NotebookActionResult> {
  const parsed = notebookItemInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' };
  }

  const resolved = await resolveTarget();
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const created = await createNotebookItem({
    userId: resolved.target.userId,
    notebookCourseId: resolved.target.notebookCourseId,
    input: parsed.data,
  });

  if (!created.ok) return { ok: false, error: created.error };

  refresh();
  return { ok: true };
}

const editSchema = z.object({
  itemId: z.string().uuid(),
  input: notebookItemInputSchema,
});

export async function editSentence(input: unknown): Promise<NotebookActionResult> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' };
  }

  const resolved = await resolveTarget();
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const updated = await updateNotebookItem({
    userId: resolved.target.userId,
    notebookCourseId: resolved.target.notebookCourseId,
    itemId: parsed.data.itemId,
    input: parsed.data.input,
  });

  if (!updated.ok) return { ok: false, error: updated.error };

  refresh();
  return { ok: true };
}

const removeSchema = z.object({ itemId: z.string().uuid() });

/**
 * Deletes one sentence the learner wrote, along with its review history.
 *
 * Deliberately different from resetting a plan, which keeps the learner's notes:
 * here the sentence itself is being withdrawn, so the reviews recorded against
 * it have nothing left to describe.
 */
export async function removeSentence(input: unknown): Promise<NotebookActionResult> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dữ liệu không hợp lệ.' };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: NOT_SIGNED_IN };

  const removed = await deleteNotebookItem({ userId: user.id, itemId: parsed.data.itemId });
  if (!removed.ok) return { ok: false, error: removed.error ?? 'Không xoá được câu.' };

  refresh();
  return { ok: true };
}
