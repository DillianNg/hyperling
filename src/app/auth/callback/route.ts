import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * Magic-link landing point.
 *
 * Supabase can deliver the sign-in in three different shapes depending on how
 * the email template is written and which flow the project uses, so all three
 * are handled rather than assuming one:
 *
 *   ?token_hash=…&type=…  the template uses {{ .TokenHash }}. Verified here and
 *                         works across devices, because it needs no cookie from
 *                         the browser that made the request.
 *   ?code=…               PKCE. Needs the code_verifier cookie set when the link
 *                         was requested, so it only works in the same browser.
 *   #access_token=…       implicit flow. The fragment never reaches the server,
 *                         so the request is handed to a client page that can
 *                         read it.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;

  // Without credentials there is no session to establish; send the visitor to
  // sign-in, where that situation is explained, rather than raising a 500.
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/dang-nhap`);
  }

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const rawNext = searchParams.get('tiep-tuc');

  // Only same-site paths are followed, so a crafted link cannot redirect a
  // signed-in user off to another host.
  const next = rawNext && /^\/[^/\\]/.test(rawNext) ? rawNext : '/bang-dieu-khien';

  // Supabase reports its own failures on the redirect, e.g. an expired link.
  const providerError = searchParams.get('error_description') ?? searchParams.get('error');
  if (providerError) {
    return NextResponse.redirect(`${origin}/dang-nhap?loi=het-han`);
  }

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return NextResponse.redirect(`${origin}/dang-nhap?loi=het-han`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // The usual cause is opening the link in a different browser from the one
      // that asked for it, so the error page says exactly that.
      return NextResponse.redirect(`${origin}/dang-nhap?loi=khac-trinh-duyet`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Nothing in the query string: the token may be in the URL fragment, which
  // only the browser can see.
  const handoff = new URL('/auth/xac-thuc', origin);
  handoff.searchParams.set('tiep-tuc', next);
  return NextResponse.redirect(handoff);
}
