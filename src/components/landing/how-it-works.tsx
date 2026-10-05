import { getTranslations } from 'next-intl/server';

interface Step {
  number: string;
  name: string;
  duration: string;
  body: string;
}

export async function HowItWorks() {
  const t = await getTranslations('landing.howItWorks');
  const steps = t.raw('steps') as Step[];

  return (
    <section id="cach-hoat-dong" className="scroll-mt-20 py-section" aria-labelledby="how-heading">
      <div className="container-page">
        <header className="max-w-2xl">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">{t('eyebrow')}</p>
          <h2 id="how-heading" className="mt-3 text-3xl font-semibold sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-4 text-lg text-fg-muted">{t('intro')}</p>
        </header>

        <ol className="mt-14 grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3">
          {steps.map((step) => (
            <li key={step.number} className="bg-surface-raised p-7">
              <div className="flex items-center justify-between">
                <span
                  className="flex size-8 items-center justify-center rounded-full bg-primary-subtle font-display text-sm font-semibold text-primary"
                  aria-hidden="true"
                >
                  {step.number}
                </span>
                <span className="text-xs text-fg-subtle">{step.duration}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{step.name}</h3>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-fg-muted">{step.body}</p>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-sm text-fg-subtle">{t('flexible')}</p>
      </div>
    </section>
  );
}
