'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';
import type { LevelProgress } from '@/core/stats/streak';

/**
 * Concentric arcs, one per CEFR level, showing how far the learner is through
 * each. Levels with no content are drawn as an empty track so the shape of the
 * whole journey stays visible — including the part that is still coming.
 */

const SIZE = 180;
const CENTER = SIZE / 2;
const STROKE = 11;
const GAP = 4;

export function ProgressRing({
  levels,
  totalPercent,
}: {
  levels: LevelProgress[];
  totalPercent: number;
}) {
  const t = useTranslations('dashboard');
  const reduced = useReducedMotion();

  if (levels.length === 0) return null;

  return (
    <div className="flex items-center gap-6">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="size-44 shrink-0 -rotate-90"
        role="img"
        aria-label={t('levelProgressLabel', { percent: totalPercent })}
      >
        {levels.map((level, index) => {
          const radius = CENTER - STROKE / 2 - index * (STROKE + GAP);
          if (radius <= 0) return null;

          const circumference = 2 * Math.PI * radius;
          const filled = (level.percent / 100) * circumference;

          return (
            <g key={level.level}>
              <circle
                cx={CENTER}
                cy={CENTER}
                r={radius}
                fill="none"
                stroke="var(--surface-sunken)"
                strokeWidth={STROKE}
                // Levels with no content yet are dashed, not solid: nothing to fill.
                strokeDasharray={level.total === 0 ? '2 6' : undefined}
              />
              {level.total > 0 ? (
                <motion.circle
                  cx={CENTER}
                  cy={CENTER}
                  r={radius}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={reduced ? { strokeDashoffset: circumference - filled } : { strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: circumference - filled }}
                  transition={{ duration: 0.9, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  opacity={0.4 + 0.6 * ((levels.length - index) / levels.length)}
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      <dl className="space-y-2.5 text-sm">
        {levels.map((level) => (
          <div key={level.level} className="flex items-baseline gap-3">
            <dt className="w-7 font-display font-semibold">{level.level}</dt>
            <dd className="text-fg-muted tabular-nums">
              {level.total > 0 ? (
                <>
                  {level.learned}/{level.total}
                  <span className="ml-2 text-fg-subtle">{level.percent}%</span>
                </>
              ) : (
                <span className="text-fg-subtle">{t('levelNoContent')}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
