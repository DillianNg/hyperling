import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isSupabaseConfigured } from '@/lib/env';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Without Supabase configured the app still renders the landing page, so a
  // fresh clone is explorable before any credentials exist.
  if (!isSupabaseConfigured()) return NextResponse.next({ request });
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
