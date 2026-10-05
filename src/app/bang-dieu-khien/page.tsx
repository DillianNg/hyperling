import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { signOut } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return { title: t('title') };
}

/**
 * Phase 1 dashboard: proves end to end that sign-in works and that a profile row
 * exists and is readable by its owner only. The real dashboard arrives in Phase 3.
 */
export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const tAuth = await getTranslations('auth');
  const tApp = await getTranslations('app');

  const user = await getCurrentUser();
  if (!user) redirect('/dang-nhap?tiep-tuc=/bang-dieu-khien');

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, display_name, ui_locale, timezone')
    .eq('id', user.id)
    .single();

  const name = profile?.display_name ?? profile?.email?.split('@')[0] ?? '';

  return (
    <>
      <header className="border-b border-border">
        <div className="container-page flex h-16 items-center justify-between">
          <p className="font-display text-lg font-semibold tracking-tight">{tApp('name')}</p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                {tAuth('signOut')}
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="container-page py-14">
        <h1 className="text-3xl font-semibold">{t('greeting', { name })}</h1>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('emptyTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-fg-muted">{t('emptyBody')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('yourAccount')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">{t('email')}</dt>
                  <dd className="truncate">{profile?.email ?? user.email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">{t('timezone')}</dt>
                  <dd>{profile?.timezone ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">{t('locale')}</dt>
                  <dd>{profile?.ui_locale ?? '—'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
