import { getTranslations } from 'next-intl/server';
import { WifiOff } from 'lucide-react';

/** Shown by the service worker when a navigation fails because the device is offline. */
export default async function OfflinePage() {
  const t = await getTranslations('offline');

  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center text-center">
      <WifiOff className="size-8 text-fg-subtle" aria-hidden="true" />
      <h1 className="mt-6 text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-3 max-w-sm text-fg-muted">{t('body')}</p>
    </main>
  );
}
