import { z } from 'zod';

/**
 * Environment validation. Fails loudly at first use rather than producing
 * confusing runtime errors deep inside the Supabase client.
 *
 * Only NEXT_PUBLIC_* values may be read in the browser. DATABASE_URL and the
 * service-role key are server-only and never referenced from client components.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL phải là một URL hợp lệ.'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY trông quá ngắn.'),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

const MISSING_ENV_HELP = `
Chưa cấu hình Supabase.

Tạo file .env.local ở gốc dự án (xem .env.example) với:

  NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>

Lấy hai giá trị này ở Supabase Dashboard > Project Settings > API.
Hướng dẫn đầy đủ: README.md, mục "Cấu hình Supabase".
`.trim();

let cached: PublicEnv | null = null;

export function getPublicEnv(): PublicEnv {
  if (cached) return cached;

  const parsed = publicEnvSchema.safeParse({
    // Next.js inlines these at build time only when referenced statically.
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`${MISSING_ENV_HELP}\n\nChi tiết:\n${details}`);
  }

  cached = parsed.data;
  return cached;
}

/** True when Supabase is configured. Lets pages degrade gracefully instead of crashing. */
export function isSupabaseConfigured(): boolean {
  return (
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'string' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
    typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'string' &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0
  );
}

/** Absolute origin used for auth redirects. Vercel provides VERCEL_URL automatically. */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}
