import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, Flame, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { Heatmap } from '@/components/dashboard/heatmap';
import { ProgressRing } from '@/components/dashboard/progress-ring';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { getCourse } from '@/lib/data/courses';
import { countCompletedItems, listEnrollments } from '@/lib/data/enrollments';
import { getEnrollmentStats } from '@/lib/data/stats';
import { getTodaySession } from '@/lib/data/study';
import { countItemsForGoal, levelsToStudy } from '@/core/planner/levels';
import { formatVi } from '@/core/planner/plan';
import { calendarDateInTimezone } from '@/core/planner/calendar';
import { buildHeatmap, computeLevelProgress, computeStreak } from '@/core/stats/streak';
import { signOut } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return { title: t('title') };
}

const HEATMAP_DAYS = 112; // sixteen weeks, enough to show a three-month course

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

  // Each enrollment tracks independently: one learner on two courses never
  // shares a queue, a streak or a set of numbers.
  const cards = await Promise.all(
    enrollments.map(async (enrollment) => {
      const course = await getCourse(enrollment.courseId);
      if (!course) return null;

      const totalItems = countItemsForGoal({
        currentLevel: enrollment.levelFrom,
        goalLevel: enrollment.levelTo,
        itemCountByLevel: course.itemCountByLevel,
      });

      const [session, completedItems, stats] = await Promise.all([
        getTodaySession({ enrollment, userId: user.id, totalItems, now: new Date() }),
        countCompletedItems(enrollment.id),
        getEnrollmentStats({ enrollmentId: enrollment.id, courseId: enrollment.courseId }),
      ]);

      const today = calendarDateInTimezone(new Date(), enrollment.timezone);

      return {
        enrollment,
        course,
        totalItems,
        session,
        completedItems,
        stats,
        today,
        streak: computeStreak({
          activity: stats.activity,
          today,
          restWeekdays: enrollment.restWeekdays,
        }),
        heatmap: buildHeatmap({
          activity: stats.activity,
          today,
          days: HEATMAP_DAYS,
          restWeekdays: enrollment.restWeekdays,
        }),
        levelProgress: computeLevelProgress({
          itemCountByLevel: course.itemCountByLevel,
          learnedByLevel: stats.learnedByLevel,
          levels: levelsToStudy(enrollment.levelFrom, enrollment.levelTo),
        }),
      };
    }),
  );

  const visible = cards.flatMap((card) => (card ? [card] : []));
  const profileRow = profile as { display_name?: string; email?: string } | null;
  const displayName = profileRow?.display_name ?? profileRow?.email?.split('@')[0] ?? '';

  return (
    <>
      <header className="border-b border-border">
        <div className="container-page flex h-16 items-center justify-between">
          <p className="font-display text-lg font-semibold tracking-tight">{tApp('name')}</p>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" asChild>
              <Link href="/cai-dat" aria-label={tApp('name')} title="Cài đặt">
                <Settings className="size-5" aria-hidden="true" />
              </Link>
            </Button>
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
              <p className="max-w-md text-fg-muted">{t('emptyBody')}</p>
              <Button className="mt-6" asChild>
                <Link href="/bat-dau">
                  <Plus aria-hidden="true" />
                  {tStudy('start')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-10 space-y-10">
            {visible.map(
              ({
                enrollment,
                course,
                totalItems,
                session,
                completedItems,
                stats,
                streak,
                heatmap,
                levelProgress,
              }) => {
                const reviewCount = session.plan.review.length;
                const learnCount = session.plan.learn.length;
                const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
                const isDone = session.plan.isEmpty;

                return (
                  <section key={enrollment.id} aria-label={course.title.vi ?? course.id}>
                    {/* Today comes first: the one thing the learner is here to do. */}
                    <Card>
                      <CardHeader>
                        <CardTitle>{course.title.vi ?? course.id}</CardTitle>
                        <p className="text-sm text-fg-muted">
                          {enrollment.levelFrom} → {enrollment.levelTo} ·{' '}
                          {tPlan('completed', { done: completedItems, total: totalItems })} · {percent}%
                        </p>
                      </CardHeader>

                      <CardContent>
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

                        <div className="mt-7 flex flex-wrap items-end justify-between gap-6">
                          <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                            <div>
                              <dt className="text-fg-subtle">{tStudy('stages.review')}</dt>
                              <dd className="mt-0.5 font-display text-2xl font-semibold tabular-nums">
                                {reviewCount}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-fg-subtle">{tStudy('stages.learn')}</dt>
                              <dd className="mt-0.5 font-display text-2xl font-semibold tabular-nums">
                                {learnCount}
                              </dd>
                            </div>
                            <div>
                              <dt className="flex items-center gap-1.5 text-fg-subtle">
                                <Flame className="size-3.5" aria-hidden="true" />
                                {t('streak')}
                              </dt>
                              <dd className="mt-0.5 font-display text-2xl font-semibold tabular-nums">
                                {streak.current}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-fg-subtle">{tPlan('forecast')}</dt>
                              <dd className="mt-0.5 font-display text-2xl font-semibold">
                                {formatVi(enrollment.targetDate)}
                              </dd>
                            </div>
                          </dl>

                          <div className="flex flex-wrap gap-3">
                            <Button size="lg" asChild={!isDone} disabled={isDone}>
                              {isDone ? (
                                <span>{t('todayDone')}</span>
                              ) : (
                                <Link href={`/hoc/${enrollment.id}`}>
                                  {session.completedNewToday > 0 ? tStudy('resume') : tStudy('start')}
                                  <ArrowRight aria-hidden="true" />
                                </Link>
                              )}
                            </Button>
                            <Button size="lg" variant="outline" asChild>
                              <Link href={`/ke-hoach/${enrollment.id}`}>{tPlan('title')}</Link>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="mt-5 grid gap-5 lg:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle>{t('levelProgress')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ProgressRing levels={levelProgress} totalPercent={percent} />
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>{t('activity')}</CardTitle>
                          <p className="text-sm text-fg-muted">
                            {streak.current > 0
                              ? t('longestStreak', { count: streak.longest })
                              : t('noStreak')}
                          </p>
                        </CardHeader>
                        <CardContent>
                          <Heatmap cells={heatmap} />

                          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
                            <Metric
                              label={t('accuracy')}
                              value={
                                stats.accuracy === null
                                  ? '—'
                                  : `${Math.round(stats.accuracy * 100)}%`
                              }
                            />
                            <Metric
                              label={t('studyTime')}
                              value={
                                stats.totalMinutes >= 60
                                  ? t('hours', { count: Math.round(stats.totalMinutes / 60) })
                                  : t('minutes', { count: stats.totalMinutes })
                              }
                            />
                            <Metric
                              label={t('mastered')}
                              value={String(stats.masteredCount)}
                              hint={t('masteredHint')}
                            />
                            <Metric label={t('activeDays')} value={String(streak.totalActiveDays)} />
                          </dl>

                          <Button variant="outline" size="sm" className="mt-7" asChild>
                            <Link href={`/tu-vung/${enrollment.id}`}>{t('wordList')}</Link>
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </section>
                );
              },
            )}

            <Button variant="ghost" asChild>
              <Link href="/bat-dau">
                <Plus aria-hidden="true" />
                {t('newCourse')}
              </Link>
            </Button>
          </div>
        )}
      </main>
    </>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-fg-subtle" title={hint}>
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
