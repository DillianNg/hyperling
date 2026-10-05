import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';

export default async function NotFound() {
  const t = await getTranslations('common');

  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center text-center">
      <h1 className="text-3xl font-semibold">{t('notFoundTitle')}</h1>
      <p className="mt-3 text-fg-muted">{t('notFoundBody')}</p>
      <Button className="mt-8" asChild>
        <Link href="/">{t('backHome')}</Link>
      </Button>
    </main>
  );
}
