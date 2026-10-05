import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Magic-link landing point. Exchanges the one-time code for a session, then
 * sends the user where they were originally heading.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const rawNext = searchParams.get('tiep-tuc');

  // Only same-site paths are followed, so a crafted link cannot redirect
  // a signed-in user off to another host.
  const next = rawNext && /^\/[^/\\]/.test(rawNext) ? rawNext : '/bang-dieu-khien';

  if (!code) {
    return NextResponse.redirect(`${origin}/dang-nhap?loi=thieu-ma`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/dang-nhap?loi=het-han`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
