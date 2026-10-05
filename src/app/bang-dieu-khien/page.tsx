import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { getCourse } from '@/lib/data/courses';
import { countCompletedItems, listEnrollments } from '@/lib/data/enrollments';
import { getTodaySession } from '@/lib/data/study';
import { countItemsForGoal } from '@/core/planner/levels';
import { formatVi } from '@/core/planner/plan';
import { signOut } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return { title: t('title') };
}

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const tStudy = await getTranslations('study');
  const tPlan = await getTranslations('plan');
  const tAuth = await getTranslations('auth');
  const tApp = await getTranslations('app');

  const user = await getCurrentUser();
  if (!user) redirect('/dang-nhap?tiep-tuc=/bang-dieu-khien');

  const supabase = await createClient();
  const [{ data: profile }, enrollments] = await Promise.all([
    supabase.from('profiles').select('email, display_name').eq('id', user.id).maybeSingle(),
    listEnrollments('active'),
  ]);

  // Each enrollment tracks independently: two learners, or one learner on two
  // courses, never share a queue.
  const cards = await Promise.all(
    enrollments.map(async (enrollment) => {
      const course = await getCourse(enrollment.courseId);
      if (!course) return null;

      const totalItems = countItemsForGoal({
        currentLevel: enrollment.levelFrom,
        goalLevel: enrollment.levelTo,
        itemCountByLevel: course.itemCountByLevel,
      });

      const [session, completedItems] = await Promise.all([
        getTodaySession({ enrollment, userId: user.id, totalItems, now: new Date() }),
        countCompletedItems(enrollment.id),
      ]);

      return { enrollment, course, totalItems, session, completedItems };
    }),
  );

  const visible = cards.flatMap((card) => (card ? [card] : []));
  const name = (profile as { display_name?: string; email?: string } | null);
  const displayName = name?.display_name ?? name?.email?.split('@')[0] ?? '';

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

      <main className="container-page py-12">
        <h1 className="text-3xl font-semibold">{t('greeting', { name: displayName })}</h1>

        {visible.length === 0 ? (
          <Card className="mt-10">
            <CardHeader>
              <CardTitle>{t('emptyTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-fg-muted">{t('emptyBody')}</p>
              <Button className="mt-6" asChild>
                <Link href="/bat-dau">
                  <Plus aria-hidden="true" />
                  {tStudy('start')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-10 space-y-5">
            {visible.map(({ enrollment, course, totalItems, session, completedItems }) => {
              const reviewCount = session.plan.review.length;
              const learnCount = session.plan.learn.length;
              const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

              return (
                <Card key={enrollment.id}>
                  <CardHeader>
                    <CardTitle>{course.title.vi ?? course.id}</CardTitle>
                    <p className="text-sm text-fg-muted">
                      {enrollment.levelFrom} → {enrollment.levelTo} ·{' '}
                      {tPlan('completed', { done: completedItems, total: totalItems })} · {percent}%
                    </p>
                  </CardHeader>

                  <CardContent>
                    {/* Progress ring is Phase 3; the bar carries the same information today. */}
                    <div
                      className="h-2 overflow-hidden rounded-full bg-surface-sunken"
                      role="progressbar"
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={tPlan('progress')}
                    >
                      <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                    </div>

                    <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                      <div>
                        <dt className="text-fg-subtle">{tStudy('stages.review')}</dt>
                        <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums">
                          {reviewCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-fg-subtle">{tStudy('stages.learn')}</dt>
                        <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums">
                          {learnCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-fg-subtle">{tPlan('forecast')}</dt>
                        <dd className="mt-0.5 font-display text-xl font-semibold">
                          {formatVi(enrollment.targetDate)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-7 flex flex-wrap gap-3">
                      <Button size="lg" asChild disabled={session.plan.isEmpty}>
                        <Link href={`/hoc/${enrollment.id}`}>
                          {session.plan.isEmpty
                            ? tStudy('nothingToday')
                            : session.completedNewToday > 0
                              ? tStudy('resume')
                              : tStudy('start')}
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                      <Button size="lg" variant="outline" asChild>
                        <Link href={`/ke-hoach/${enrollment.id}`}>{tPlan('title')}</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <Button variant="ghost" asChild>
              <Link href="/bat-dau">
                <Plus aria-hidden="true" />
                {tStudy('start')}
              </Link>
            </Button>
          </div>
        )}
      </main>
    </>
  );
}
