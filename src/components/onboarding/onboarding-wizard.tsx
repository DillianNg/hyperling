'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import { BENCHMARK_NEW_PER_DAY, MAX_NEW_PER_DAY, type CefrLevel } from '@/config/app.config';
import { computePlan, formatVi } from '@/core/planner/plan';
import {
  countItemsForGoal,
  levelsToStudy,
  selectableGoals,
  selectableStartingLevels,
} from '@/core/planner/levels';
import {
  addDays,
  calendarDateInTimezone,
  parseCalendarDate,
  type CalendarDate,
  type IsoWeekday,
} from '@/core/planner/calendar';
import { createPlan, type CreatePlanState } from '@/app/bat-dau/actions';

/**
 * Onboarding: one question per step.
 *
 * The plan preview is computed right here with the same pure planner the server
 * uses, so the learner sees the consequence of each choice immediately with no
 * round trip. The server recomputes before storing anything.
 */

export interface OnboardingCourse {
  id: string;
  title: Record<string, string>;
  targetLanguage: string;
  targetLanguageName: string;
  sourceLanguage: string;
  sourceLanguageName: string;
  levels: string[];
  itemCountByLevel: Record<string, number>;
}

type StepId =
  | 'targetLanguage'
  | 'sourceLanguage'
  | 'currentLevel'
  | 'goalLevel'
  | 'startDate'
  | 'targetDate'
  | 'preview';

const STEPS: StepId[] = [
  'targetLanguage',
  'sourceLanguage',
  'currentLevel',
  'goalLevel',
  'startDate',
  'targetDate',
  'preview',
];

/** Rough reading+recall time per item, used only for the "minutes a day" estimate. */
const SECONDS_PER_ITEM = 25;

export function OnboardingWizard({
  courses,
  timezone,
  today,
}: {
  courses: OnboardingCourse[];
  timezone: string;
  today: CalendarDate;
}) {
  const t = useTranslations('onboarding');
  const [state, formAction, isPending] = useActionState<CreatePlanState, FormData>(createPlan, {
    status: 'idle',
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [targetLanguage, setTargetLanguage] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState<CefrLevel | null>(null);
  const [goalLevel, setGoalLevel] = useState<CefrLevel | null>(null);
  const [startDate, setStartDate] = useState<CalendarDate>(today);
  const [targetDate, setTargetDate] = useState<CalendarDate>(addDays(today, 89));
  const [restWeekdays, setRestWeekdays] = useState<IsoWeekday[]>([]);

  const course = useMemo(() => courses.find((c) => c.id === courseId) ?? null, [courses, courseId]);

  const targetLanguages = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of courses) seen.set(c.targetLanguage, c.targetLanguageName);
    return [...seen].map(([code, name]) => ({ code, name }));
  }, [courses]);

  const sourceOptions = useMemo(
    () => courses.filter((c) => c.targetLanguage === targetLanguage),
    [courses, targetLanguage],
  );

  const startingLevels = useMemo(
    () => (course ? selectableStartingLevels(course.levels) : []),
    [course],
  );

  const goals = useMemo(
    () =>
      course && currentLevel
        ? selectableGoals({
            currentLevel,
            courseLevels: course.levels,
            itemCountByLevel: course.itemCountByLevel,
          })
        : [],
    [course, currentLevel],
  );

  const totalItems = useMemo(
    () =>
      course && currentLevel && goalLevel
        ? countItemsForGoal({ currentLevel, goalLevel, itemCountByLevel: course.itemCountByLevel })
        : 0,
    [course, currentLevel, goalLevel],
  );

  const outcome = useMemo(
    () =>
      totalItems > 0
        ? computePlan({
            totalItems,
            startDate,
            targetDate,
            restWeekdays,
            maxNewPerDay: MAX_NEW_PER_DAY,
          })
        : null,
    [totalItems, startDate, targetDate, restWeekdays],
  );

  const step = STEPS[stepIndex]!;

  const canContinue = (() => {
    switch (step) {
      case 'targetLanguage':
        return targetLanguage !== null;
      case 'sourceLanguage':
        return courseId !== null;
      case 'currentLevel':
        return currentLevel !== null;
      case 'goalLevel':
        return goalLevel !== null && totalItems > 0;
      case 'startDate':
        return true;
      case 'targetDate':
        return outcome?.ok === true;
      case 'preview':
        return outcome?.ok === true;
    }
  })();

  function goNext() {
    // A single source language means there is nothing to ask on that step.
    if (step === 'targetLanguage' && sourceOptions.length === 1) {
      setCourseId(sourceOptions[0]!.id);
      setStepIndex(stepIndex + 2);
      return;
    }
    setStepIndex(Math.min(stepIndex + 1, STEPS.length - 1));
  }

  function goBack() {
    if (step === 'currentLevel' && sourceOptions.length === 1) {
      setStepIndex(Math.max(stepIndex - 2, 0));
      return;
    }
    setStepIndex(Math.max(stepIndex - 1, 0));
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="flex items-center justify-between text-sm text-fg-subtle">
        <span>{t('stepOf', { current: stepIndex + 1, total: STEPS.length })}</span>
      </div>

      {/* Progress rail: thin, non-decorative, shows where the learner is. */}
      <div className="mt-3 flex gap-1.5" role="presentation">
        {STEPS.map((id, index) => (
          <span
            key={id}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              index <= stepIndex ? 'bg-primary' : 'bg-surface-sunken',
            )}
          />
        ))}
      </div>

      <div className="mt-10 min-h-[22rem]">
        {step === 'targetLanguage' ? (
          <Question title={t('steps.targetLanguage.question')} hint={t('steps.targetLanguage.hint')}>
            <ChoiceList>
              {targetLanguages.map((lang) => (
                <Choice
                  key={lang.code}
                  selected={targetLanguage === lang.code}
                  onSelect={() => {
                    setTargetLanguage(lang.code);
                    const only = courses.filter((c) => c.targetLanguage === lang.code);
                    setCourseId(only.length === 1 ? only[0]!.id : null);
                    setCurrentLevel(null);
                    setGoalLevel(null);
                  }}
                  label={lang.name}
                />
              ))}
            </ChoiceList>
          </Question>
        ) : null}

        {step === 'sourceLanguage' ? (
          <Question title={t('steps.sourceLanguage.question')} hint={t('steps.sourceLanguage.hint')}>
            <ChoiceList>
              {sourceOptions.map((option) => (
                <Choice
                  key={option.id}
                  selected={courseId === option.id}
                  onSelect={() => setCourseId(option.id)}
                  label={option.sourceLanguageName}
                  detail={option.title.vi ?? option.title.en}
                />
              ))}
            </ChoiceList>
          </Question>
        ) : null}

        {step === 'currentLevel' ? (
          <Question title={t('steps.currentLevel.question')} hint={t('steps.currentLevel.hint')}>
            <ChoiceList>
              {startingLevels.map((level) => (
                <Choice
                  key={level}
                  selected={currentLevel === level}
                  onSelect={() => {
                    setCurrentLevel(level);
                    setGoalLevel(null);
                  }}
                  label={level === 'A0' ? t('steps.currentLevel.a0') : level}
                  detail={
                    level === 'A0'
                      ? t('steps.currentLevel.a0Hint')
                      : t('steps.currentLevel.levelHint', { level })
                  }
                />
              ))}
            </ChoiceList>
          </Question>
        ) : null}

        {step === 'goalLevel' ? (
          <Question title={t('steps.goalLevel.question')} hint={t('steps.goalLevel.hint')}>
            {goals.length === 0 ? (
              <Notice tone="warning">{t('steps.goalLevel.noGoals')}</Notice>
            ) : (
              <ChoiceList>
                {goals.map((level) => {
                  const count =
                    course && currentLevel
                      ? countItemsForGoal({
                          currentLevel,
                          goalLevel: level,
                          itemCountByLevel: course.itemCountByLevel,
                        })
                      : 0;
                  return (
                    <Choice
                      key={level}
                      selected={goalLevel === level}
                      onSelect={() => setGoalLevel(level)}
                      label={level}
                      detail={t('steps.goalLevel.itemCount', { count })}
                    />
                  );
                })}
              </ChoiceList>
            )}

            {/* Levels the course intends to cover but has no content for yet. */}
            {course && currentLevel
              ? course.levels
                  .filter(
                    (level) =>
                      !goals.includes(level as CefrLevel) &&
                      levelsToStudy(currentLevel, level).length > 0,
                  )
                  .map((level) => (
                    <p key={level} className="mt-3 text-sm text-fg-subtle">
                      {t('steps.goalLevel.comingSoon', { level })}
                    </p>
                  ))
              : null}
          </Question>
        ) : null}

        {step === 'startDate' ? (
          <Question title={t('steps.startDate.question')} hint={t('steps.startDate.hint')}>
            <ChoiceList>
              <Choice
                selected={startDate === today}
                onSelect={() => setStartDate(today)}
                label={t('steps.startDate.today')}
                detail={formatVi(today)}
              />
              <Choice
                selected={startDate === addDays(today, 1)}
                onSelect={() => setStartDate(addDays(today, 1))}
                label={t('steps.startDate.tomorrow')}
                detail={formatVi(addDays(today, 1))}
              />
            </ChoiceList>

            <label className="mt-6 block">
              <span className="text-sm font-medium">{t('steps.startDate.custom')}</span>
              <Input
                type="date"
                className="mt-2"
                value={startDate}
                min={today}
                onChange={(event) => {
                  const parsed = parseCalendarDate(event.target.value);
                  if (parsed) setStartDate(parsed);
                }}
              />
            </label>
          </Question>
        ) : null}

        {step === 'targetDate' ? (
          <Question title={t('steps.targetDate.question')} hint={t('steps.targetDate.hint')}>
            <ChoiceList>
              {[3, 6, 12].map((months) => {
                const date = addDays(startDate, months * 30 - 1);
                return (
                  <Choice
                    key={months}
                    selected={targetDate === date}
                    onSelect={() => setTargetDate(date)}
                    label={t('steps.targetDate.presetMonths', { count: months })}
                    detail={formatVi(date)}
                  />
                );
              })}
            </ChoiceList>

            <label className="mt-6 block">
              <span className="text-sm font-medium">{t('steps.targetDate.custom')}</span>
              <Input
                type="date"
                className="mt-2"
                value={targetDate}
                min={startDate}
                onChange={(event) => {
                  const parsed = parseCalendarDate(event.target.value);
                  if (parsed) setTargetDate(parsed);
                }}
              />
            </label>

            <fieldset className="mt-8">
              <legend className="text-sm font-medium">{t('steps.targetDate.restDays')}</legend>
              <p className="mt-1 text-sm text-fg-subtle">{t('steps.targetDate.restDaysHint')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {([1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]).map((day) => {
                  const active = restWeekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setRestWeekdays((current) =>
                          active ? current.filter((x) => x !== day) : [...current, day],
                        )
                      }
                      className={cn(
                        'h-11 min-w-12 rounded-field border px-3 text-sm font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary-subtle text-fg'
                          : 'border-border-strong text-fg-muted hover:bg-surface-hover',
                      )}
                    >
                      {t(`weekdays.${day}`)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {outcome && !outcome.ok ? (
              <div className="mt-6">
                <Notice tone="warning" title={t('blocked.title')}>
                  {outcome.blocked.message}
                </Notice>
                {outcome.blocked.earliestFeasibleTarget ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3"
                    onClick={() => setTargetDate(outcome.blocked.earliestFeasibleTarget!)}
                  >
                    {t('blocked.suggestTarget', {
                      date: formatVi(outcome.blocked.earliestFeasibleTarget),
                    })}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Question>
        ) : null}

        {step === 'preview' && outcome?.ok && course && currentLevel && goalLevel ? (
          <Question title={t('steps.preview.question')} hint={t('steps.preview.hint')}>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border">
              <Stat
                label={t('steps.preview.newPerDay')}
                value={String(outcome.plan.newPerDay)}
                highlight={outcome.plan.newPerDay === BENCHMARK_NEW_PER_DAY}
              />
              <Stat label={t('steps.preview.totalItems')} value={String(totalItems)} />
              <Stat label={t('steps.preview.studyDays')} value={String(outcome.plan.studyDays)} />
              <Stat label={t('steps.preview.bufferDays')} value={String(outcome.plan.bufferDays)} />
            </dl>

            <p className="mt-6 text-[0.9375rem]">
              {t('steps.preview.forecast', {
                level: goalLevel,
                date: formatVi(outcome.plan.forecastDate),
              })}
            </p>
            <p className="mt-2 text-sm text-fg-muted">
              {t('steps.preview.hardDeadline', {
                buffer: outcome.plan.bufferDays,
                date: formatVi(outcome.plan.hardDeadline),
              })}
            </p>
            <p className="mt-2 text-sm text-fg-subtle">
              {t('steps.preview.estimatedTime', {
                minutes: Math.max(Math.round((outcome.plan.newPerDay * SECONDS_PER_ITEM) / 60), 1),
              })}
            </p>

            {state.status === 'error' ? (
              <div className="mt-6">
                <Notice tone="danger">{state.message}</Notice>
              </div>
            ) : null}
          </Question>
        ) : null}
      </div>

      <div className="mt-10 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={goBack} disabled={stepIndex === 0}>
          <ArrowLeft aria-hidden="true" />
          {t('back')}
        </Button>

        {step === 'preview' ? (
          <form action={formAction}>
            <input type="hidden" name="courseId" value={courseId ?? ''} />
            <input type="hidden" name="currentLevel" value={currentLevel ?? ''} />
            <input type="hidden" name="goalLevel" value={goalLevel ?? ''} />
            <input type="hidden" name="startDate" value={startDate} />
            <input type="hidden" name="targetDate" value={targetDate} />
            <input type="hidden" name="restWeekdays" value={JSON.stringify(restWeekdays)} />
            <input type="hidden" name="timezone" value={timezone} />
            <Button type="submit" size="lg" disabled={!canContinue || isPending}>
              {isPending ? t('creating') : t('confirm')}
              <Check aria-hidden="true" />
            </Button>
          </form>
        ) : (
          <Button type="button" size="lg" onClick={goNext} disabled={!canContinue}>
            {t('next')}
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Question({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-live="polite">
      <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
      <p className="mt-3 text-fg-muted">{hint}</p>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function ChoiceList({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2.5">{children}</div>;
}

function Choice({
  selected,
  onSelect,
  label,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  detail?: string | undefined;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-14 w-full items-center justify-between gap-4 rounded-card border px-5 py-3.5 text-left transition-colors',
        selected
          ? 'border-primary bg-primary-subtle'
          : 'border-border bg-surface-raised hover:bg-surface-hover',
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-3">
        {detail ? <span className="text-sm text-fg-muted">{detail}</span> : null}
        {selected ? <Check className="size-4 shrink-0 text-primary" aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-surface-raised p-5">
      <dt className="text-sm text-fg-subtle">{label}</dt>
      <dd
        className={cn(
          'mt-1 font-display text-2xl font-semibold',
          highlight ? 'text-primary' : undefined,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-card border p-4 text-sm',
        tone === 'warning' ? 'border-warning/40 bg-warning-subtle' : 'border-danger/40 bg-danger-subtle',
      )}
    >
      <TriangleAlert
        className={cn('mt-0.5 size-4 shrink-0', tone === 'warning' ? 'text-warning' : 'text-danger')}
        aria-hidden="true"
      />
      <div>
        {title ? <p className="font-medium">{title}</p> : null}
        <p className={cn(title ? 'mt-1 text-fg-muted' : undefined)}>{children}</p>
      </div>
    </div>
  );
}

export { calendarDateInTimezone };
