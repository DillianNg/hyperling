'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { LOCALES, type Locale } from '@/config/app.config';
import { setUserLocale } from '@/lib/i18n/locale';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

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
