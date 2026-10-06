import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TriangleAlert } from 'lucide-react';
import { SignInForm } from './sign-in-form';
import { getCurrentUser } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signIn');
  return { title: t('title') };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ 'tiep-tuc'?: string; loi?: string }>;
}) {
  const t = await getTranslations('auth.signIn');
  const tAuth = await getTranslations('auth');
  const tApp = await getTranslations('app');
  const configured = isSupabaseConfigured();

  if (configured) {
    const user = await getCurrentUser();
    if (user) redirect('/bang-dieu-khien');
  }

  const params = await searchParams;
  const next = params['tiep-tuc'];

  // A failed sign-in link lands back here; say what went wrong rather than
  // showing an empty form the learner has already filled in once.
  const linkErrorKeys = ['thieu-ma', 'het-han', 'khac-trinh-duyet'] as const;
  const linkError = linkErrorKeys.find((key) => key === params.loi);

  return (
    <main className="container-page flex min-h-dvh flex-col justify-center py-16">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="-mx-2 inline-flex min-h-11 items-center px-2 font-display text-lg font-semibold tracking-tight"
        >
          {tApp('name')}
        </Link>

        <h1 className="mt-10 text-3xl font-semibold">{t('title')}</h1>
        <p className="mt-3 text-fg-muted">{t('subtitle')}</p>

        {linkError ? (
          <div
            role="alert"
            className="mt-8 flex items-start gap-2.5 rounded-card border border-danger/40 bg-danger-subtle p-4 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <p>{tAuth(`linkErrors.${linkError}`)}</p>
          </div>
        ) : null}

        {!configured ? (
          <div
            role="status"
            className="mt-8 flex items-start gap-2.5 rounded-card border border-warning/40 bg-warning-subtle p-4 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="font-medium">{t('notConfiguredTitle')}</p>
              <p className="mt-1 text-fg-muted">{t('notConfiguredBody')}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-8">
          <SignInForm next={next} disabled={!configured} />
        </div>
      </div>
    </main>
  );
}
