import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NotebookManager } from '@/components/notebook/notebook-manager';
import { getCourse } from '@/lib/data/courses';
import { listEnrollments } from '@/lib/data/enrollments';
import { getNotebookEnrollment, listNotebookItems, notebookCourseIdFor } from '@/lib/data/notebook';
import { getCurrentUser } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notebook');
  return { title: t('title') };
}

export default async function NotebookPage() {
  const t = await getTranslations('notebook');
  const user = await getCurrentUser();
  if (!user) redirect('/dang-nhap?tiep-tuc=/so-tay');

  const enrollments = await listEnrollments('active');
  const enrollment = enrollments.find((item) => item.kind === 'curriculum');

  // The notebook holds sentences in the language of a course being studied, and
  // borrows that course's field schema to render them, so there is nowhere to
  // put a sentence until a course exists.
  if (!enrollment) {
    return (
      <main className="container-page py-10">
        <Button variant="ghost" size="sm" asChild className="-ml-3">
          <Link href="/bang-dieu-khien">
            <ArrowLeft aria-hidden="true" />
            {t('back')}
          </Link>
        </Button>
        <h1 className="mt-6 text-3xl font-semibold">{t('title')}</h1>
        <Card className="mt-8">
          <CardContent className="pt-6">
            <p className="max-w-prose text-fg-muted">{t('needCourse')}</p>
            <Button className="mt-5" asChild>
              <Link href="/bat-dau">{t('startCourse')}</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const course = await getCourse(enrollment.courseId);
  const notebookCourseId = course ? notebookCourseIdFor(course.targetLanguage) : null;
  if (!notebookCourseId) redirect('/bang-dieu-khien');

  // Read-only: visiting the page must not create anything. The notebook
  // enrollment is created by the first sentence the learner actually adds.
  const notebook = await getNotebookEnrollment(notebookCourseId);
  const items = await listNotebookItems({
    userId: user.id,
    notebookCourseId,
    enrollmentId: notebook?.id ?? null,
  });

  return (
    <main className="container-page py-10">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href="/bang-dieu-khien">
          <ArrowLeft aria-hidden="true" />
          {t('back')}
        </Link>
      </Button>

      <h1 className="mt-6 text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-fg-muted">{t('subtitle')}</p>

      <NotebookManager items={items} studyHref={notebook ? `/hoc/${notebook.id}` : null} />
    </main>
  );
}
