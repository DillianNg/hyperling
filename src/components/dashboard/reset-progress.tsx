'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { resetProgress } from '@/app/cai-dat/actions';

export interface ResetProgressProps {
  enrollmentId: string;
  courseTitle: string;
  reviewedCards: number;
  reviewLogs: number;
  flaggedItems: number;
}

/**
 * Discards the study plan and starts over, keeping the account signed in.
 *
 * Deliberately two-step: the first button only reveals what would be lost, in
 * real numbers, and the button that actually destroys anything appears second.
 * Nothing here is recoverable, and the counts are the only warning that means
 * something to the person reading it.
 */
export function ResetProgress({
  enrollmentId,
  courseTitle,
  reviewedCards,
  reviewLogs,
  flaggedItems,
}: ResetProgressProps) {
  const t = useTranslations('settings');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setFailed(false);
    startTransition(async () => {
      const result = await resetProgress({ enrollmentId });
      if (!result.ok) {
        setFailed(true);
        return;
      }
      // Onboarding is where a learner with no enrollment belongs.
      router.replace('/bat-dau');
      router.refresh();
    });
  }

  return (
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TriangleAlert aria-hidden="true" className="size-5 text-danger" />
          {t('reset')}
        </CardTitle>
        <p className="text-sm text-fg-muted">{t('resetHint')}</p>
      </CardHeader>

      <CardContent>
        <p className="text-sm">{t('resetCurrent', { course: courseTitle })}</p>

        {confirming ? (
          <div className="mt-5 rounded-lg border border-danger/40 bg-danger/5 p-4">
            <p className="text-sm font-medium">{t('resetConfirmTitle')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">
              <li>{t('resetLosesCards', { count: reviewedCards })}</li>
              <li>{t('resetLosesLogs', { count: reviewLogs })}</li>
              <li>{t('resetLosesPlan')}</li>
            </ul>
            <p className="mt-3 text-sm text-fg-muted">{t('resetKeepsAccount')}</p>
            {flaggedItems > 0 ? (
              <p className="mt-2 text-sm text-fg-muted">
                {t('resetKeepsNotes', { count: flaggedItems })}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" variant="danger" onClick={confirm} disabled={pending}>
                {pending ? t('resetWorking') : t('resetConfirm')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                {t('resetCancel')}
              </Button>
            </div>

            {failed ? (
              <p role="alert" className="mt-3 text-sm text-danger">
                {t('resetFailed')}
              </p>
            ) : null}
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="mt-5 border-danger/50 text-danger hover:bg-danger/10"
            onClick={() => setConfirming(true)}
          >
            {t('reset')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
