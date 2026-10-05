'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import type { FsrsRatingName } from '@/config/app.config';
import type { Interval } from '@/core/scheduler/types';

/**
 * The four self-assessment buttons.
 *
 * Each one shows when the card would come back, so the learner can see what
 * their answer costs rather than guessing what "Hard" means.
 */

const ORDER: FsrsRatingName[] = ['again', 'hard', 'good', 'easy'];

const TONE: Record<FsrsRatingName, string> = {
  again: 'border-danger/50 hover:bg-danger-subtle',
  hard: 'border-warning/50 hover:bg-warning-subtle',
  good: 'border-primary/50 hover:bg-primary-subtle',
  easy: 'border-success/50 hover:bg-success-subtle',
};

export function RatingButtons({
  intervals,
  onRate,
  disabled = false,
}: {
  intervals: Record<FsrsRatingName, Interval> | null;
  onRate: (rating: FsrsRatingName) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('study');

  return (
    <div>
      <p className="text-sm text-fg-subtle">{t('rate')}</p>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {ORDER.map((rating, index) => {
          const interval = intervals?.[rating];
          return (
            <button
              key={rating}
              type="button"
              onClick={() => onRate(rating)}
              disabled={disabled}
              // The keyboard shortcut is announced, not just hinted at visually.
              aria-keyshortcuts={String(index + 1)}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1 rounded-card border-2 bg-surface-raised px-3 py-2.5 transition-colors',
                TONE[rating],
                disabled && 'pointer-events-none opacity-55',
              )}
            >
              <span className="font-medium">{t(`ratings.${rating}`)}</span>
              {interval ? (
                <span className="text-xs text-fg-subtle tabular-nums">
                  {t(`interval.${interval.unit}`, { value: interval.value })}
                </span>
              ) : null}
              <span className="sr-only">{t(`ratingHints.${rating}`)}</span>
              <span aria-hidden="true" className="text-[0.625rem] text-fg-subtle opacity-70">
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
