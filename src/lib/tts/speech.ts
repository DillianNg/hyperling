'use client';

/**
 * Pronunciation, behind an interface.
 *
 * Today this is the browser's own speech synthesis: free, offline, no API key.
 * It is also uneven — iOS Safari in particular often has no German voice — so
 * the contract reports availability and the UI hides the button rather than
 * offering something that silently does nothing. Swapping in a server-side TTS
 * later means writing another implementation of `TtsProvider`.
 */

export interface TtsProvider {
  /** Whether this provider can speak the given BCP-47 language right now. */
  isAvailable(lang: string): boolean;
  speak(text: string, lang: string, rate?: number): void;
  stop(): void;
}

function matchesLanguage(voiceLang: string, wanted: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace('_', '-');
  const a = normalize(voiceLang);
  const b = normalize(wanted);
  // `de` should match `de-DE`, and `de-DE` should match `de`.
  return a === b || a.startsWith(`${b.split('-')[0]}-`) || b.startsWith(`${a.split('-')[0]}-`);
}

export function createWebSpeechProvider(): TtsProvider {
  return {
    isAvailable(lang: string): boolean {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
      const voices = window.speechSynthesis.getVoices();
      // Voices load asynchronously; an empty list early on is not proof of absence,
      // so the caller re-checks on the `voiceschanged` event.
      return voices.some((voice) => matchesLanguage(voice.lang, lang));
    },

    speak(text: string, lang: string, rate = 0.9): void {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;

      const voice = window.speechSynthesis.getVoices().find((v) => matchesLanguage(v.lang, lang));
      if (voice) utterance.voice = voice;

      window.speechSynthesis.speak(utterance);
    },

    stop(): void {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
    },
  };
}

/** Subscribe to voice-list changes, which fire once the browser has loaded them. */
export function onVoicesChanged(callback: () => void): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return () => {};
  window.speechSynthesis.addEventListener('voiceschanged', callback);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', callback);
}
