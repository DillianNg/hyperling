import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';
import { BENCHMARK_NEW_PER_DAY, BUFFER_DAYS_RANGE, MAX_NEW_PER_DAY } from '@/config/app.config';

export async function PlanSection() {
  const t = await getTranslations('landing.plan');

  return (
    <section className="py-section" aria-labelledby="plan-heading">
      <div className="container-page grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="text-sm font-medium tracking-wide text-primary uppercase">{t('eyebrow')}</p>
          <h2 id="plan-heading" className="mt-3 text-3xl font-semibold sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-4 text-lg text-fg-muted">{t('body')}</p>

          {/* The numbers come from config/app.config.ts, never retyped in prose. */}
          <dl className="mt-8 grid grid-cols-3 gap-4">
            <div>
              <dt className="text-sm text-fg-subtle">Chuẩn mỗi ngày</dt>
              <dd className="mt-1 font-display text-2xl font-semibold">{BENCHMARK_NEW_PER_DAY}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Trần mỗi ngày</dt>
              <dd className="mt-1 font-display text-2xl font-semibold">{MAX_NEW_PER_DAY}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Ngày đệm</dt>
              <dd className="mt-1 font-display text-2xl font-semibold">
                {BUFFER_DAYS_RANGE[0]}–{BUFFER_DAYS_RANGE[1]}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-card border border-border bg-surface-raised p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h3 className="font-semibold">{t('guardrailTitle')}</h3>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-fg-muted">{t('guardrailBody')}</p>
            </div>
          </div>

          <p className="mt-7 border-t border-border pt-5 font-mono text-sm text-fg-muted">{t('benchmark')}</p>
        </div>
      </div>
    </section>
  );
}
