import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OnboardingWizard, type OnboardingCourse } from '@/components/onboarding/onboarding-wizard';
import { listCourses } from '@/lib/data/courses';
import { listEnrollments } from '@/lib/data/enrollments';
import { getCurrentUser, createClient } from '@/lib/supabase/server';
import { calendarDateInTimezone } from '@/core/planner/calendar';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('title') };
}

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/dang-nhap?tiep-tuc=/bat-dau');

  const supabase = await createClient();
  const [courses, enrollments, { data: profile }, { data: languages }] = await Promise.all([
    listCourses(),
    listEnrollments('active'),
    supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle(),
    supabase.from('languages').select('code, name_vi, name_native'),
  ]);

  const nameByCode = new Map(
    ((languages ?? []) as Array<{ code: string; name_vi: string; name_native: string }>).map(
      (row) => [row.code, row.name_vi],
    ),
  );

  // Courses the learner is already enrolled in have nothing left to set up.
  const enrolled = new Set(enrollments.map((e) => e.courseId));
  const available: OnboardingCourse[] = courses
    .filter((course) => !enrolled.has(course.id))
    .map((course) => ({
      id: course.id,
      title: course.title,
      targetLanguage: course.targetLanguage,
      targetLanguageName: nameByCode.get(course.targetLanguage) ?? course.targetLanguage,
      sourceLanguage: course.sourceLanguage,
      sourceLanguageName: nameByCode.get(course.sourceLanguage) ?? course.sourceLanguage,
      levels: course.levels,
      itemCountByLevel: course.itemCountByLevel,
    }));

  const timezone = (profile as { timezone?: string } | null)?.timezone ?? 'Asia/Ho_Chi_Minh';
  const today = calendarDateInTimezone(new Date(), timezone);

  return (
    <main className="container-page flex min-h-dvh flex-col justify-center py-16">
      <OnboardingWizard courses={available} timezone={timezone} today={today} />
    </main>
  );
}
