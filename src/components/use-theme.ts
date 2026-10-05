'use client';

import { useSyncExternalStore } from 'react';
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  setTheme,
  subscribeToTheme,
  type ResolvedTheme,
  type Theme,
} from '@/lib/theme-store';

export function useTheme(): { theme: Theme; resolvedTheme: ResolvedTheme; setTheme: (theme: Theme) => void } {
  const snapshot = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  return { theme: snapshot.theme, resolvedTheme: snapshot.resolved, setTheme };
}
