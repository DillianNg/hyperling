'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { LOCALES, type Locale } from '@/config/app.config';
import { setUserLocale } from '@/lib/i18n/locale';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { deleteEnrollment, listEnrollments } from '@/lib/data/enrollments';

const localeSchema = z.enum(LOCALES);

/**
 * Interface language. Stored twice on purpose: a cookie so the choice applies
 * to the very next render, and on the profile so it follows the learner to
 * another device.
 */
export async function changeLocale(formData: FormData): Promise<void> {
  const parsed = localeSchema.safeParse(formData.get('locale'));
  if (!parsed.success) return;

  await setUserLocale(parsed.data as Locale);

  const user = await getCurrentUser();
  if (user) {
    const supabase = await createClient();
    await supabase.from('profiles').update({ ui_locale: parsed.data }).eq('id', user.id);
  }

  revalidatePath('/', 'layout');
}

const appearanceSchema = z.object({
  fontScale: z.number().min(0.8).max(1.6),
});

export async function updateAppearance(input: unknown): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const parsed = appearanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ font_scale: parsed.data.fontScale })
    .eq('id', user.id);

  if (error) return { ok: false };

  revalidatePath('/', 'layout');
  return { ok: true };
}

const resetSchema = z.object({
  enrollmentId: z.string().uuid(),
});

/**
 * Discards the learner's study plan and all progress on it, keeping the account.
 *
 * The enrollment id is checked against the caller's own enrollments before the
 * delete rather than trusted from the client. RLS would refuse someone else's id
 * anyway, but a silent no-op reported as success is its own kind of bug — this
 * way a wrong id is a wrong id.
 */
export async function resetProgress(input: unknown): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const owned = await listEnrollments();
  if (!owned.some((enrollment) => enrollment.id === parsed.data.enrollmentId)) {
    return { ok: false };
  }

  const result = await deleteEnrollment(parsed.data.enrollmentId);
  if (!result.ok) return { ok: false };

  revalidatePath('/', 'layout');
  return { ok: true };
}
