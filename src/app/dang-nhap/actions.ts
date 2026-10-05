'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl, isSupabaseConfigured } from '@/lib/env';

/**
 * Magic-link sign-in. Supabase creates the user on first link, and the
 * on_auth_user_created trigger creates the matching profile row, so there is no
 * separate registration step.
 */

const emailSchema = z.string().trim().toLowerCase().email();

export type SignInState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; code: 'invalidEmail' | 'rateLimit' | 'generic' | 'notConfigured' };

export async function sendMagicLink(_previous: SignInState, formData: FormData): Promise<SignInState> {
  if (!isSupabaseConfigured()) {
    return { status: 'error', code: 'notConfigured' };
  }

  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) {
    return { status: 'error', code: 'invalidEmail' };
  }
  const email = parsed.data;

  // `tiep-tuc` carries the page the visitor was trying to reach. Only same-site
  // paths are accepted, so the link cannot be turned into an open redirect.
  const rawNext = formData.get('tiep-tuc');
  const next = typeof rawNext === 'string' && /^\/[^/\\]/.test(rawNext) ? rawNext : '/bang-dieu-khien';

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback?tiep-tuc=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    const isRateLimit = error.status === 429 || /rate limit/i.test(error.message);
    return { status: 'error', code: isRateLimit ? 'rateLimit' : 'generic' };
  }

  return { status: 'sent', email };
}
