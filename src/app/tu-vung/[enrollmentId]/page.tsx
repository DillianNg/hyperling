import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WordList } from '@/components/dashboard/word-list';
import { getEnrollment } from '@/lib/data/enrollments';
import { getCourse } from '@/lib/data/courses';
import { studyScope } from '@/lib/data/notebook';
import { getStudiedLevels, listLearnedItems } from '@/lib/data/stats';
import { getCurrentUser } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('words');
  return { title: t('title') };
}

const PAGE_SIZE = 25;

export default async function WordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ enrollmentId: string }>;
  searchParams: Promise<{ q?: string; cap?: string; kho?: string; trang?: string }>;
}) {
  const t = await getTranslations('words');
  const user = await getCurrentUser();
  const { enrollmentId } = await params;

  if (!user) redirect(`/dang-nhap?tiep-tuc=/tu-vung/${enrollmentId}`);

  const enrollment = await getEnrollment(enrollmentId);
  if (!enrollment) redirect('/bang-dieu-khien');

  const course = await getCourse(enrollment.courseId);
  if (!course) redirect('/bang-dieu-khien');

  // The learner's own sentences belong in this list too — they studied them,
  // so searching for one should find it. `level` then includes the notebook's
  // own level alongside the CEFR ones.
  const scope = await studyScope({ enrollment, targetLanguage: course.targetLanguage });

  const query = await searchParams;
  const page = Math.max(Number.parseInt(query.trang ?? '1', 10) || 1, 1);

  const [result, levels] = await Promise.all([
    listLearnedItems({
      enrollmentIds: scope.enrollmentIds,
      userId: user.id,
      ...(query.q ? { search: query.q } : {}),
      ...(query.cap ? { level: query.cap } : {}),
      ...(query.kho === '1' ? { onlyHard: true } : {}),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getStudiedLevels(scope.enrollmentIds, scope.courseIds),
  ]);

  return (
    <main className="container-page py-10">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href="/bang-dieu-khien">
          <ArrowLeft aria-hidden="true" />
          {t('back')}
        </Link>
      </Button>

      <h1 className="mt-6 text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-2 text-fg-muted">{t('subtitle', { count: result.total })}</p>

      <WordList
        enrollmentId={enrollmentId}
        words={result.words}
        total={result.total}
        page={page}
        pageSize={PAGE_SIZE}
        levels={levels}
        filters={{
          q: query.q ?? '',
          level: query.cap ?? '',
          onlyHard: query.kho === '1',
        }}
      />
    </main>
  );
}
