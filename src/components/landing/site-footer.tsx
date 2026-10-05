import { getTranslations } from 'next-intl/server';

export async function SiteFooter() {
  const t = await getTranslations('landing.footer');
  const tApp = await getTranslations('app');

  return (
    <footer className="border-t border-border py-12">
      <div className="container-page flex flex-col gap-3">
        <p className="font-display font-semibold">{tApp('name')}</p>
        <p className="max-w-2xl text-sm text-fg-muted">{t('builtWith')}</p>
        <p className="max-w-2xl text-sm text-fg-subtle">{t('dataNote')}</p>
      </div>
    </footer>
  );
}
