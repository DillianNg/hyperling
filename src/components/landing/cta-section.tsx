import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export async function CtaSection() {
  const t = await getTranslations('landing.cta');

  return (
    <section className="py-section" aria-labelledby="cta-heading">
      <div className="container-page">
        <div className="rounded-card border border-border bg-surface-sunken/60 px-8 py-14 text-center sm:px-14">
          <h2 id="cta-heading" className="mx-auto max-w-xl text-3xl font-semibold sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-fg-muted">{t('body')}</p>
          <Button size="lg" className="mt-8" asChild>
            <Link href="/dang-nhap">
              {t('button')}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
