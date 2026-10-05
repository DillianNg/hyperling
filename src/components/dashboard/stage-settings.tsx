'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import { SESSION_STAGES, type SessionStage } from '@/config/app.config';
import { updateStageFlags } from '@/app/ke-hoach/actions';

/** Switch the three session stages on and off. */
export function StageSettings({
  enrollmentId,
  stageFlags,
}: {
  enrollmentId: string;
  stageFlags: Record<SessionStage, boolean>;
}) {
  const t = useTranslations('plan');
  const [flags, setFlags] = useState(stageFlags);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(stage: SessionStage) {
    const next = { ...flags, [stage]: !flags[stage] };
    setFlags(next);
    setError(null);

    startTransition(async () => {
      const result = await updateStageFlags({ enrollmentId, stageFlags: next });
      if (!result.ok) {
        // Put the switch back where it was rather than showing a state that was not saved.
        setFlags(flags);
        setError(result.error ?? null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {SESSION_STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            role="switch"
            aria-checked={flags[stage]}
            onClick={() => toggle(stage)}
            disabled={isPending}
            className="flex w-full items-start justify-between gap-4 rounded-field border border-border p-4 text-left transition-colors hover:bg-surface-hover disabled:opacity-60"
          >
            <span>
              <span className="font-medium">{t(`stages.${stage}`)}</span>
              <span className="mt-1 block text-sm text-fg-muted">{t(`stageHints.${stage}`)}</span>
            </span>

            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
                flags[stage] ? 'bg-primary' : 'bg-surface-sunken',
              )}
            >
              <span
                className={cn(
                  'size-5 rounded-full bg-surface-raised transition-transform duration-200',
                  flags[stage] ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </span>
          </button>
        ))}

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
