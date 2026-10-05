import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export async function Hero() {
  const t = await getTranslations('landing.hero');

  return (
    <section className="pt-20 pb-section sm:pt-28" aria-labelledby="hero-heading">
      <div className="container-page">
        <p className="inline-flex items-center rounded-full border border-border bg-surface-raised px-3.5 py-1.5 text-sm text-fg-muted">
          {t('badge')}
        </p>

        <h1 id="hero-heading" className="mt-7 max-w-3xl text-4xl font-semibold sm:text-5xl lg:text-6xl">
          {t('title')}
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-fg-muted sm:text-xl">{t('subtitle')}</p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button size="lg" asChild>
            <Link href="/dang-nhap">
              {t('ctaPrimary')}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="#phuong-phap">{t('ctaSecondary')}</Link>
          </Button>
        </div>

        <p className="mt-5 text-sm text-fg-subtle">{t('note')}</p>
      </div>
    </section>
  );
}
