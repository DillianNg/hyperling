'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  const t = useTranslations('nav');
  const tApp = useTranslations('app');

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/85 backdrop-blur-sm">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="-mx-2 inline-flex min-h-11 items-center px-2 font-display text-lg font-semibold tracking-tight"
        >
          {tApp('name')}
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label={tApp('name')}>
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/#phuong-phap">{t('methods')}</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/#cach-hoat-dong">{t('howItWorks')}</Link>
          </Button>
          <ThemeToggle />
          <Button size="sm" asChild>
            <Link href={signedIn ? '/bang-dieu-khien' : '/dang-nhap'}>
              {signedIn ? t('dashboard') : t('signIn')}
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
