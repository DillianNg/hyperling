'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/use-theme';

export function ThemeToggle() {
  const t = useTranslations('nav');
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label={t('toggleTheme')}
      title={t('toggleTheme')}
    >
      {/* Both icons render; CSS picks the visible one, so there is no hydration mismatch. */}
      <Sun className="size-5 dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-5 dark:block" aria-hidden="true" />
    </Button>
  );
}
