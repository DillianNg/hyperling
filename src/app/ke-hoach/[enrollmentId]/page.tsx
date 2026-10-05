import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RebalanceOptions } from '@/components/dashboard/rebalance-options';
import { StageSettings } from '@/components/dashboard/stage-settings';
import { getCourse } from '@/lib/data/courses';
import { countCompletedItems, getEnrollment } from '@/lib/data/enrollments';
import { getCurrentUser } from '@/lib/supabase/server';
import { countItemsForGoal } from '@/core/planner/levels';
import { computePlan, formatVi } from '@/core/planner/plan';
import { computeRebalance, forecastAtCurrentPace } from '@/core/planner/rebalance';
import { calendarDateInTimezone } from '@/core/planner/calendar';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('plan');
  return { title: t('title') };
}

export default async function PlanPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const t = await getTranslations('plan');
  const user = await getCurrentUser();
  const { enrollmentId } = await params;

  if (!user) redirect(`/dang-nhap?tiep-tuc=/ke-hoach/${enrollmentId}`);

  const enrollment = await getEnrollment(enrollmentId);
  if (!enrollment) redirect('/bang-dieu-khien');

  const course = await getCourse(enrollment.courseId);
  if (!course) redirect('/bang-dieu-khien');

  const totalItems = countItemsForGoal({
    currentLevel: enrollment.levelFrom,
    goalLevel: enrollment.levelTo,
    itemCountByLevel: course.itemCountByLevel,
  });

  const completedItems = await countCompletedItems(enrollment.id);
  const today = calendarDateInTimezone(new Date(), enrollment.timezone);

  const outcome = computePlan({
    totalItems,
    startDate: enrollment.startDate,
    targetDate: enrollment.targetDate,
    restWeekdays: enrollment.restWeekdays,
    maxNewPerDay: enrollment.newPerDay,
  });

  const rebalance = computeRebalance({
    totalItems,
    completedItems,
    startDate: enrollment.startDate,
    targetDate: enrollment.targetDate,
    today,
    restWeekdays: enrollment.restWeekdays,
    newPerDay: enrollment.newPerDay,
    bufferDays: enrollment.bufferDays,
  });

  const forecast = forecastAtCurrentPace({
    totalItems,
    completedItems,
    startDate: enrollment.startDate,
    today,
    restWeekdays: enrollment.restWeekdays,
  });

  const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <main className="container-page py-10">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href="/bang-dieu-khien">
          <ArrowLeft aria-hidden="true" />
          {t('title')}
        </Link>
      </Button>

      <h1 className="mt-6 text-3xl font-semibold">{course.title.vi ?? course.id}</h1>
      <p className="mt-2 text-fg-muted">
        {enrollment.levelFrom} → {enrollment.levelTo} · {formatVi(enrollment.startDate)} –{' '}
        {formatVi(enrollment.targetDate)}
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-4">
        <Stat label={t('newPerDay')} value={String(enrollment.newPerDay)} />
        <Stat label={t('progress')} value={`${percent}%`} />
        <Stat label={t('completed', { done: completedItems, total: totalItems })} value={String(completedItems)} />
        <Stat
          label={t('forecast')}
          value={outcome.ok ? formatVi(outcome.plan.forecastDate) : '—'}
        />
      </dl>

      {forecast.forecastDate ? (
        <p className="mt-4 text-sm text-fg-muted">
          {t('forecastAtPace', { date: formatVi(forecast.forecastDate) })}
        </p>
      ) : null}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div>
          {rebalance.isBehind ? (
            <RebalanceOptions
              enrollmentId={enrollment.id}
              daysBehind={rebalance.daysBehind}
              expected={rebalance.expectedByNow}
              actual={completedItems}
              options={rebalance.options}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t('progress')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-fg-muted">
                  {completedItems > rebalance.expectedByNow ? t('aheadOfSchedule') : t('onTrack')}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <StageSettings enrollmentId={enrollment.id} stageFlags={enrollment.stageFlags} />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-raised p-5">
      <dt className="text-sm text-fg-subtle">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold">{value}</dd>
    </div>
  );
}
