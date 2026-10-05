import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { HashSessionHandoff } from './hash-handoff';

/**
 * Fallback for the implicit flow, where Supabase puts the tokens in the URL
 * fragment. A fragment never reaches the server, so this page exists purely to
 * let the browser hand them over.
 */
export default async function VerifyPage() {
  const t = await getTranslations('auth.verifying');

  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center text-center">
      <Suspense fallback={<p className="text-fg-muted">{t('title')}</p>}>
        <HashSessionHandoff />
      </Suspense>
    </main>
  );
}
