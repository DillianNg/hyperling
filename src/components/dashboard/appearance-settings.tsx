'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/use-theme';
import type { Theme } from '@/lib/theme-store';
import { updateAppearance } from '@/app/cai-dat/actions';

const SCALES = [0.9, 1, 1.15, 1.3] as const;
const THEMES: Theme[] = ['light', 'dark', 'system'];

/** Theme and text size. Text size is applied immediately and then persisted. */
export function AppearanceSettings({ fontScale }: { fontScale: number }) {
  const t = useTranslations('settings');
  const { theme, setTheme } = useTheme();
  const [scale, setScale] = useState(fontScale);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  function applyScale(next: number) {
    setScale(next);
    setSaved(false);
    // The CSS variable drives the root font size, so this is visible at once.
    document.documentElement.style.setProperty('--font-scale', String(next));

    startTransition(async () => {
      const result = await updateAppearance({ fontScale: next });
      if (result.ok) setSaved(true);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance')}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-7">
        <fieldset>
          <legend className="text-sm font-medium">{t('theme')}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {THEMES.map((option) => (
              <Button
                key={option}
                type="button"
                variant={theme === option ? 'primary' : 'outline'}
                size="sm"
                aria-pressed={theme === option}
                onClick={() => setTheme(option)}
              >
                {t(option === 'light' ? 'themeLight' : option === 'dark' ? 'themeDark' : 'themeSystem')}
              </Button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">{t('fontScale')}</legend>
          <p className="mt-1 text-sm text-fg-muted">{t('fontScaleHint')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {SCALES.map((option) => (
              <Button
                key={option}
                type="button"
                variant={Math.abs(scale - option) < 0.01 ? 'primary' : 'outline'}
                size="sm"
                aria-pressed={Math.abs(scale - option) < 0.01}
                onClick={() => applyScale(option)}
              >
                <span style={{ fontSize: `${option}rem` }}>A</span>
              </Button>
            ))}
            {saved ? <span className="ml-2 text-sm text-success">{t('saved')}</span> : null}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
