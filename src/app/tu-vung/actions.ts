'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

/** Toggle the "hard" mark a learner puts on a sentence. */
const schema = z.object({
  itemId: z.string().uuid(),
  isHard: z.boolean(),
  enrollmentId: z.string().uuid(),
});

export async function toggleHard(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Phiên đăng nhập đã hết hạn.' };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dữ liệu không hợp lệ.' };

  const supabase = await createClient();
  const { error } = await supabase.from('item_flags').upsert(
    { user_id: user.id, item_id: parsed.data.itemId, is_hard: parsed.data.isHard },
    { onConflict: 'user_id,item_id' },
  );

  if (error) return { ok: false, error: 'Không lưu được đánh dấu.' };

  revalidatePath(`/tu-vung/${parsed.data.enrollmentId}`);
  return { ok: true };
}
