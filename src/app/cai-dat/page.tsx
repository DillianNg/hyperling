import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppearanceSettings } from '@/components/dashboard/appearance-settings';
import { ResetProgress } from '@/components/dashboard/reset-progress';
import { LOCALES } from '@/config/app.config';
import { getUserLocale } from '@/lib/i18n/locale';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { getCourse } from '@/lib/data/courses';
import { getEnrollmentFootprint, listEnrollments } from '@/lib/data/enrollments';
import { changeLocale } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('title') };
}

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  const user = await getCurrentUser();
  if (!user) redirect('/dang-nhap?tiep-tuc=/cai-dat');

  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('font_scale, timezone, email')
    .eq('id', user.id)
    .maybeSingle();

  const profile = data as { font_scale?: string; timezone?: string; email?: string } | null;
  const fontScale = Number(profile?.font_scale ?? 1) || 1;
  const locale = await getUserLocale();

  // Reset is only offered when there is a plan to reset; a learner who has not
  // finished onboarding has nothing here but a confusing red box.
  const [enrollment] = await listEnrollments();
  const course = enrollment ? await getCourse(enrollment.courseId) : null;
  const footprint = enrollment
    ? await getEnrollmentFootprint(enrollment.id)
    : { reviewedCards: 0, reviewLogs: 0, flaggedItems: 0 };

  return (
    <main className="container-page py-10">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href="/bang-dieu-khien">
          <ArrowLeft aria-hidden="true" />
          {t('back')}
        </Link>
      </Button>

      <h1 className="mt-6 text-3xl font-semibold">{t('title')}</h1>

      <div className="mt-10 grid max-w-2xl gap-5">
        <Card>
          <CardHeader>
            <CardTitle>{t('language')}</CardTitle>
            <p className="text-sm text-fg-muted">{t('languageHint')}</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {LOCALES.map((code) => (
                <form key={code} action={changeLocale}>
                  <input type="hidden" name="locale" value={code} />
                  <Button type="submit" variant={locale === code ? 'primary' : 'outline'}>
                    {t(code)}
                  </Button>
                </form>
              ))}
            </div>
          </CardContent>
        </Card>

        <AppearanceSettings fontScale={fontScale} />

        {enrollment ? (
          <ResetProgress
            enrollmentId={enrollment.id}
            courseTitle={
              course?.title[locale] ?? course?.title.vi ?? course?.title.en ?? enrollment.courseId
            }
            reviewedCards={footprint.reviewedCards}
            reviewLogs={footprint.reviewLogs}
            flaggedItems={footprint.flaggedItems}
          />
        ) : null}
      </div>
    </main>
  );
}
