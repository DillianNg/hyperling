'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import type { RebalanceOption } from '@/core/planner/rebalance';
import { applyRebalance } from '@/app/ke-hoach/actions';

/**
 * The three ways out of being behind.
 *
 * Unavailable options stay visible with their reason. Hiding them would leave
 * the learner wondering why the obvious answer is not on offer; showing why
 * "just do more per day" is refused is the point.
 */
export function RebalanceOptions({
  enrollmentId,
  daysBehind,
  expected,
  actual,
  options,
}: {
  enrollmentId: string;
  daysBehind: number;
  expected: number;
  actual: number;
  options: RebalanceOption[];
}) {
  const t = useTranslations('plan');
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function choose(option: RebalanceOption) {
    if (!option.available) return;
    setChosen(option.strategy);
    setError(null);

    startTransition(async () => {
      const result = await applyRebalance({
        enrollmentId,
        strategy: option.strategy,
        newPerDay: option.newPerDay,
        targetDate: option.targetDate,
      });

      if (result.ok) {
        router.refresh();
      } else {
        setChosen(null);
        setError(result.error ?? null);
      }
    });
  }

  return (
    <Card className="border-warning/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TriangleAlert className="size-4 text-warning" aria-hidden="true" />
          {t('behindTitle', { days: daysBehind })}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <p className="text-[0.9375rem] text-fg-muted">
          {t('behindBody', { expected, actual })}
        </p>

        <ul className="mt-6 space-y-3">
          {options.map((option) => (
            <li
              key={option.strategy}
              className={cn(
                'rounded-card border p-4',
                option.available ? 'border-border bg-surface-raised' : 'border-border bg-surface-sunken/50',
              )}
            >
              <p className="font-medium">{t(`strategies.${option.strategy}`)}</p>
              <p className="mt-1.5 text-sm text-fg-muted">{option.summary}</p>

              {option.unavailableReason ? (
                <p className="mt-2 text-sm text-fg-subtle">{option.unavailableReason}</p>
              ) : null}

              {option.available ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => choose(option)}
                  disabled={isPending}
                >
                  {chosen === option.strategy ? (
                    t('applying')
                  ) : (
                    <>
                      <Check aria-hidden="true" />
                      {t('chooseOption')}
                    </>
                  )}
                </Button>
              ) : (
                <p className="mt-3 text-sm font-medium text-fg-subtle">{t('unavailable')}</p>
              )}
            </li>
          ))}
        </ul>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
