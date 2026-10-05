import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { SessionRunner } from '@/components/study/session-runner';
import { Button } from '@/components/ui/button';
import { getCourse } from '@/lib/data/courses';
import { getEnrollment } from '@/lib/data/enrollments';
import { getTodaySession } from '@/lib/data/study';
import { getCurrentUser } from '@/lib/supabase/server';
import { countItemsForGoal } from '@/core/planner/levels';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('study');
  return { title: t('title') };
}

export default async function StudyPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const t = await getTranslations('study');
  const user = await getCurrentUser();
  const { enrollmentId } = await params;

  if (!user) redirect(`/dang-nhap?tiep-tuc=/hoc/${enrollmentId}`);

  const enrollment = await getEnrollment(enrollmentId);
  if (!enrollment) redirect('/bang-dieu-khien');

  const course = await getCourse(enrollment.courseId);
  if (!course) redirect('/bang-dieu-khien');

  const totalItems = countItemsForGoal({
    currentLevel: enrollment.levelFrom,
    goalLevel: enrollment.levelTo,
    itemCountByLevel: course.itemCountByLevel,
  });

  const session = await getTodaySession({ enrollment, userId: user.id, totalItems, now: new Date() });

  if (session.plan.isEmpty) {
    return (
      <main className="container-page flex min-h-dvh flex-col items-center justify-center py-16 text-center">
        <h1 className="text-2xl font-semibold">{t('nothingToday')}</h1>
        <p className="mt-3 max-w-sm text-fg-muted">{t('nothingTodayBody')}</p>
        <Button className="mt-8" asChild>
          <Link href="/bang-dieu-khien">{t('summary.backToDashboard')}</Link>
        </Button>
      </main>
    );
  }

  return (
    <SessionRunner
      enrollmentId={enrollment.id}
      plan={session.plan}
      itemsById={Object.fromEntries(
        Object.entries(session.itemsById).map(([id, item]) => [
          id,
          {
            id: item.id,
            stableKey: item.stableKey,
            topic: item.topic,
            fields: item.fields,
            glossary: item.glossary,
          },
        ]),
      )}
      distractors={session.distractors}
      repsByItemId={session.repsByItemId}
      ttsLang={course.tts?.lang ?? null}
      ttsRate={course.tts?.rate ?? 0.9}
    />
  );
}
