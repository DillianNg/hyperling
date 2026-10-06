'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import type { HeatmapCell } from '@/core/stats/streak';
import { isoWeekday } from '@/core/planner/calendar';

/**
 * Activity grid, one column per week.
 *
 * Levels map to opacity steps of a single colour rather than to different hues,
 * so the grid reads as one quantity and stays legible for colour-blind viewers.
 * Every cell also carries a text label, because colour alone is never the only
 * channel carrying information.
 */

const LEVEL_CLASS: Record<HeatmapCell['level'], string> = {
  0: 'bg-surface-sunken',
  1: 'bg-primary/25',
  2: 'bg-primary/45',
  3: 'bg-primary/70',
  4: 'bg-primary',
};

export function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  const t = useTranslations('dashboard');
  const format = useFormatter();

  if (cells.length === 0) return null;

  // Pad the first week so columns line up with weekdays.
  const leadingBlanks = isoWeekday(cells[0]!.date) - 1;
  const padded: Array<HeatmapCell | null> = [...Array.from({ length: leadingBlanks }, () => null), ...cells];

  const weeks: Array<Array<HeatmapCell | null>> = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-1">
            {week.map((cell, dayIndex) =>
              cell === null ? (
                <span key={dayIndex} className="size-3 rounded-[3px]" aria-hidden="true" />
              ) : (
                <span
                  key={cell.date}
                  className={cn(
                    'size-3 rounded-[3px]',
                    LEVEL_CLASS[cell.level],
                    cell.isRestDay && cell.level === 0 && 'ring-1 ring-border-strong ring-inset',
                  )}
                  title={`${format.dateTime(new Date(`${cell.date}T12:00:00Z`), {
                    day: '2-digit',
                    month: '2-digit',
                  })} — ${t('heatmapCell', { newItems: cell.newItems, reviews: cell.reviews })}`}
                >
                  <span className="sr-only">
                    {cell.date}: {t('heatmapCell', { newItems: cell.newItems, reviews: cell.reviews })}
                  </span>
                </span>
              ),
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-fg-subtle">
        <span>{t('heatmapLess')}</span>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span key={level} className={cn('size-3 rounded-[3px]', LEVEL_CLASS[level])} aria-hidden="true" />
        ))}
        <span>{t('heatmapMore')}</span>
      </div>
    </div>
  );
}
