export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/**
 * The theme lives in localStorage and in the OS preference — both external to
 * React — so it is exposed as an external store rather than component state.
 * That keeps the effect-free contract React wants and avoids cascading renders.
 */

const STORAGE_KEY = 'hyperling-theme';

const listeners = new Set<() => void>();
let cachedSnapshot: { theme: Theme; resolved: ResolvedTheme } | null = null;

const SERVER_SNAPSHOT: { theme: Theme; resolved: ResolvedTheme } = { theme: 'system', resolved: 'light' };

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function read(): { theme: Theme; resolved: ResolvedTheme } {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing can refuse storage; fall back to the OS preference.
  }
  const theme: Theme = isTheme(stored) ? stored : 'system';
  const resolved: ResolvedTheme = theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
  return { theme, resolved };
}

function applyToDocument(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

function invalidate(): void {
  cachedSnapshot = null;
  for (const listener of listeners) listener();
}

/** Stable snapshot: useSyncExternalStore requires referential equality between reads. */
export function getThemeSnapshot(): { theme: Theme; resolved: ResolvedTheme } {
  cachedSnapshot ??= read();
  return cachedSnapshot;
}

export function getServerThemeSnapshot(): { theme: Theme; resolved: ResolvedTheme } {
  return SERVER_SNAPSHOT;
}

export function subscribeToTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  const query = window.matchMedia('(prefers-color-scheme: dark)');

  const onExternalChange = () => {
    cachedSnapshot = null;
    applyToDocument(read().resolved);
    invalidate();
  };

  query.addEventListener('change', onExternalChange);
  // Keep other tabs of the same app in sync.
  window.addEventListener('storage', onExternalChange);

  return () => {
    listeners.delete(onChange);
    query.removeEventListener('change', onExternalChange);
    window.removeEventListener('storage', onExternalChange);
  };
}

export function setTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The choice still applies for this visit even if it cannot be persisted.
  }
  cachedSnapshot = null;
  applyToDocument(read().resolved);
  invalidate();
}

/**
 * Runs before first paint so dark-mode users never see a light flash. Kept as a
 * string because it must execute synchronously in <head>, before hydration.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var dark = stored === 'dark' ||
      ((!stored || stored === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`.trim();
