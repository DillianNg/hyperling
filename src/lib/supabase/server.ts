import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getPublicEnv, isSupabaseConfigured } from '@/lib/env';

/**
 * Supabase client for server components, route handlers and server actions.
 * Uses the anon key, so every query is still subject to RLS — the server is not
 * a privileged caller. Content imports use the service role via a script instead.
 */
export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies; middleware refreshes the session instead.
        }
      },
    },
  });
}

/**
 * The signed-in user, or null. Never throws, so layouts and private pages can
 * branch on it — including when the project has no Supabase configured at all,
 * where the right outcome is "nobody is signed in", not a 500.
 */
export async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
