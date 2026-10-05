'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createWebSpeechProvider, onVoicesChanged, type TtsProvider } from '@/lib/tts/speech';

/**
 * Speech availability.
 *
 * The voice list is browser state, not React state: `getVoices()` is commonly
 * empty on the first call and fills in later, so this subscribes to the browser
 * rather than snapshotting once in an effect.
 */

function subscribe(onChange: () => void): () => void {
  const unsubscribe = onVoicesChanged(onChange);
  // Some browsers populate the list shortly after load without firing the event.
  const timer = typeof window === 'undefined' ? null : window.setTimeout(onChange, 400);

  return () => {
    unsubscribe();
    if (timer !== null) window.clearTimeout(timer);
  };
}

export function useTts(lang: string | null): {
  available: boolean;
  speak: (text: string, rate?: number) => void;
  stop: () => void;
} {
  const provider: TtsProvider = useMemo(() => createWebSpeechProvider(), []);

  // A boolean snapshot is referentially stable, which is what the store contract needs.
  const getSnapshot = useCallback(
    () => (lang ? provider.isAvailable(lang) : false),
    [lang, provider],
  );

  const available = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const speak = useCallback(
    (text: string, rate?: number) => {
      if (lang) provider.speak(text, lang, rate);
    },
    [lang, provider],
  );

  const stop = useCallback(() => provider.stop(), [provider]);

  return { available, speak, stop };
}
