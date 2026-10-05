'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

/**
 * Reads the access token out of the URL fragment and stores the session.
 *
 * The fragment is stripped from the address bar immediately afterwards, so the
 * tokens do not sit in history or get copied along with the link.
 */
export function HashSessionHandoff() {
  const t = useTranslations('auth.verifying');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const rawNext = searchParams.get('tiep-tuc');
      const next = rawNext && /^\/[^/\\]/.test(rawNext) ? rawNext : '/bang-dieu-khien';

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');

      if (!accessToken || !refreshToken) {
        if (!cancelled) setFailed(true);
        return;
      }

      const { error } = await createClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (cancelled) return;
      if (error) {
        setFailed(true);
        return;
      }

      // Drop the tokens from the address bar so they are not left in history.
      window.history.replaceState(null, '', window.location.pathname);
      router.replace(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  if (failed) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">{t('failedTitle')}</h1>
        <p className="mt-3 text-fg-muted">{t('failedBody')}</p>
        <a href="/dang-nhap" className="mt-6 inline-block underline underline-offset-4">
          {t('backToSignIn')}
        </a>
      </div>
    );
  }

  return <p className="text-fg-muted">{t('title')}</p>;
}
