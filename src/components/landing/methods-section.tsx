import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { MethodDiagram } from './method-diagrams';

/*
 * This section renders on the server. Only the three diagrams are client
 * components, so the landing page ships the animation library for those alone
 * instead of for all the prose around them.
 */

interface MethodItem {
  id: 'lexical' | 'sentences' | 'srs';
  number: string;
  name: string;
  author: string;
  claim: string;
  body: string;
  contribution: string;
}

interface SynergyPoint {
  from: string;
  to: string;
  effect: string;
}

export async function MethodsSection() {
  const t = await getTranslations('landing.methods');
  const items = t.raw('items') as MethodItem[];
  const synergy = t.raw('synergyPoints') as SynergyPoint[];

  return (
    <section id="phuong-phap" className="scroll-mt-20 py-section" aria-labelledby="methods-heading">
      <div className="container-page">
        <header className="max-w-2xl">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">{t('eyebrow')}</p>
          <h2 id="methods-heading" className="mt-3 text-3xl font-semibold sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-4 text-lg text-fg-muted">{t('intro')}</p>
        </header>

        <ul className="mt-14 grid gap-6 lg:grid-cols-3">
          {items.map((item) => {
            return (
              <li
                key={item.id}
                className="flex flex-col rounded-card border border-border bg-surface-raised p-7"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-sm font-semibold text-primary">{item.number}</span>
                  <div>
                    <h3 className="text-lg font-semibold">{item.name}</h3>
                    <p className="text-sm text-fg-subtle">{item.author}</p>
                  </div>
                </div>

                <p className="mt-5 font-display text-base font-medium">{item.claim}</p>

                <div className="my-6 rounded-lg bg-surface-sunken/60 p-3">
                  <MethodDiagram id={item.id} />
                </div>

                <p className="text-[0.9375rem] leading-relaxed text-fg-muted">{item.body}</p>

                <p className="mt-6 border-t border-border pt-4 text-sm text-fg">
                  <span className="font-medium">{t('contributionLabel')}: </span>
                  {item.contribution}
                </p>
              </li>
            );
          })}
        </ul>

        {/* Why the combination, stated as three concrete hand-offs rather than a claim. */}
        <div className="mt-16 rounded-card border border-border bg-surface-sunken/50 p-8 sm:p-10">
          <h3 className="max-w-xl text-xl font-semibold sm:text-2xl">{t('synergyTitle')}</h3>
          <p className="mt-4 max-w-3xl text-fg-muted">{t('synergyBody')}</p>

          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {synergy.map((point) => (
              <li key={`${point.from}-${point.to}`} className="rounded-lg bg-surface-raised p-5">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span>{point.from}</span>
                  <ArrowRight className="size-3.5 text-primary" aria-hidden="true" />
                  <span>{point.to}</span>
                </p>
                <p className="mt-2 text-sm text-fg-muted">{point.effect}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
