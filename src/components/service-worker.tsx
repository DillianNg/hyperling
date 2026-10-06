'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker after the page has settled, so it never competes
 * with first paint. Registration failure is non-fatal: the app works without it.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // Private browsing and some enterprise policies refuse registration.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
