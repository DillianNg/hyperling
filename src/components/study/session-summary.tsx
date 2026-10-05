'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';

/**
 * End-of-session screen. Encouraging and factual — no streak-loss warnings, no
 * guilt. The point is that the learner comes back tomorrow.
 */
export function SessionSummary({
  reviewed,
  learned,
  accuracy,
  durationMs,
  onDone,
}: {
  reviewed: number;
  learned: number;
  accuracy: number | null;
  durationMs: number;
  onDone: () => void;
}) {
  const t = useTranslations('study.summary');
  const reduced = useReducedMotion();
  const minutes = Math.max(Math.round(durationMs / 60_000), 1);

  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center py-16 text-center">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <h1 className="text-3xl font-semibold">{t('title')}</h1>

        <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border text-left">
          <Stat label={t('learned', { count: learned })} value={String(learned)} />
          <Stat label={t('reviewed', { count: reviewed })} value={String(reviewed)} />
          {accuracy !== null ? (
            <Stat
              label={t('accuracy', { percent: Math.round(accuracy * 100) })}
              value={`${Math.round(accuracy * 100)}%`}
            />
          ) : null}
          <Stat label={t('duration', { minutes })} value={`${minutes}′`} />
        </dl>

        <p className="mt-8 text-fg-muted">{t('encouragement')}</p>

        <Button size="lg" className="mt-8" onClick={onDone}>
          {t('backToDashboard')}
        </Button>
      </motion.div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-raised p-5">
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-2xl font-semibold">{value}</dd>
      <p aria-hidden="true" className="mt-1 text-sm text-fg-subtle">
        {label}
      </p>
    </div>
  );
}
