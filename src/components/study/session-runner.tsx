'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StudyCard, type StudyCardItem } from './study-card';
import { RatingButtons } from './rating-buttons';
import { SessionSummary } from './session-summary';
import { useTts } from './use-tts';
import type { FsrsRatingName, SessionStage } from '@/config/app.config';
import type { Interval } from '@/core/scheduler/types';
import { buildExercise, pickExerciseKind, type ExerciseItem } from '@/core/session/exercises';
import { sessionProgress, type SessionPlan } from '@/core/session/build-session';
import { beginSession, endSession, previewIntervals, recordReview } from '@/app/hoc/actions';

/**
 * Runs one session: review, then new items, then consolidation.
 *
 * The queue is held locally and every answer is posted as it happens, so closing
 * the tab halfway loses at most the current card. "Again" puts the item back at
 * the end of the current stage, which is what makes a lapse feel like a retry
 * rather than a punishment.
 */

export interface SessionRunnerProps {
  enrollmentId: string;
  plan: SessionPlan;
  itemsById: Record<string, StudyCardItem>;
  distractors: ExerciseItem[];
  repsByItemId: Record<string, number>;
  ttsLang: string | null;
  ttsRate: number;
}

interface QueueEntry {
  itemId: string;
  stage: SessionStage;
  /** True the first time the learner ever sees this item. */
  isNewItem: boolean;
  /** Distinguishes a retried card from its first appearance, for the remount key. */
  attempt: number;
}

interface SessionStats {
  reviewed: number;
  learned: number;
  correct: number;
  graded: number;
}

const RATING_KEYS: FsrsRatingName[] = ['again', 'hard', 'good', 'easy'];

export function SessionRunner({
  enrollmentId,
  plan,
  itemsById,
  distractors,
  repsByItemId,
  ttsLang,
  ttsRate,
}: SessionRunnerProps) {
  const t = useTranslations('study');
  const router = useRouter();
  const reduced = useReducedMotion();
  const { available: canSpeak, speak } = useTts(ttsLang);

  const initialQueue = useMemo<QueueEntry[]>(
    () => [
      ...plan.review.map((ref) => ({
        itemId: ref.itemId,
        stage: 'review' as const,
        isNewItem: false,
        attempt: 0,
      })),
      ...plan.learn.map((ref) => ({
        itemId: ref.itemId,
        stage: 'learn' as const,
        isNewItem: true,
        attempt: 0,
      })),
      ...plan.consolidate.map((ref) => ({
        itemId: ref.itemId,
        stage: 'consolidate' as const,
        isNewItem: false,
        attempt: 0,
      })),
    ],
    [plan],
  );

  const [queue, setQueue] = useState<QueueEntry[]>(initialQueue);
  const [cursor, setCursor] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [preview, setPreview] = useState<{
    itemId: string;
    intervals: Record<FsrsRatingName, Interval>;
  } | null>(null);
  const [showTransliteration, setShowTransliteration] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<SessionStats>({ reviewed: 0, learned: 0, correct: 0, graded: 0 });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finished, setFinished] = useState(false);

  // Clocks and the session id are written in effects and read in callbacks only,
  // never during render.
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const cardShownAtRef = useRef<number | null>(null);
  const lastCorrectRef = useRef<boolean | null>(null);

  const current = queue[cursor];
  const item = current ? itemsById[current.itemId] : undefined;

  const exercise = useMemo(() => {
    if (!current || !item) return null;
    const kind = pickExerciseKind({
      itemId: current.itemId,
      reps: (repsByItemId[current.itemId] ?? 0) + current.attempt,
      isConsolidation: current.stage === 'consolidate',
    });
    return buildExercise(
      kind,
      {
        itemId: item.id,
        stableKey: item.stableKey,
        prompt: item.fields.text ?? '',
        answer: item.fields.meaning ?? '',
      },
      distractors,
    );
  }, [current, item, repsByItemId, distractors]);

  // Open a session row once, so every review can be attributed to it.
  useEffect(() => {
    startedAtRef.current = Date.now();
    let cancelled = false;
    void beginSession(enrollmentId).then((id) => {
      if (!cancelled) sessionIdRef.current = id;
    });
    return () => {
      cancelled = true;
    };
  }, [enrollmentId]);

  // Fetch the interval preview for whichever card is on screen.
  const currentItemId = current?.itemId;
  const currentAttempt = current?.attempt;

  useEffect(() => {
    if (!currentItemId) return;
    cardShownAtRef.current = Date.now();

    let cancelled = false;
    void previewIntervals({ enrollmentId, itemId: currentItemId }).then((intervals) => {
      if (!cancelled && intervals) setPreview({ itemId: currentItemId, intervals });
    });

    return () => {
      cancelled = true;
    };
  }, [currentItemId, currentAttempt, enrollmentId]);

  // Only show intervals that belong to the card currently on screen.
  const intervals =
    preview !== null && preview.itemId === currentItemId ? preview.intervals : null;

  const handleAnswered = useCallback((result: { isCorrect: boolean | null }) => {
    lastCorrectRef.current = result.isCorrect;
    if (result.isCorrect !== null) {
      setStats((previous) => ({
        ...previous,
        graded: previous.graded + 1,
        correct: previous.correct + (result.isCorrect ? 1 : 0),
      }));
    }
    setAnswered(true);
  }, []);

  const finish = useCallback(
    async (finalStats: SessionStats) => {
      const startedAt = startedAtRef.current ?? Date.now();
      const duration = Date.now() - startedAt;
      setElapsedMs(duration);
      setFinished(true);

      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      await endSession({
        sessionId,
        reviewed: finalStats.reviewed,
        learned: finalStats.learned,
        correct: finalStats.correct,
        answered: finalStats.graded,
        durationMs: duration,
      });
    },
    [],
  );

  const handleRate = useCallback(
    async (rating: FsrsRatingName) => {
      if (!current || !exercise || saving) return;
      setSaving(true);

      const entry = current;
      const shownAt = cardShownAtRef.current ?? Date.now();

      const result = await recordReview({
        enrollmentId,
        itemId: entry.itemId,
        rating,
        exerciseKind: exercise.kind,
        isCorrect: lastCorrectRef.current,
        durationMs: Math.min(Date.now() - shownAt, 600_000),
        isNewItem: entry.isNewItem,
        sessionId: sessionIdRef.current,
      });

      if (!result.ok) {
        setSaving(false);
        return;
      }

      const nextStats: SessionStats = {
        ...stats,
        reviewed: stats.reviewed + (entry.isNewItem ? 0 : 1),
        learned: stats.learned + (entry.isNewItem ? 1 : 0),
      };
      setStats(nextStats);

      // "Again" means the learner did not know it: put it back at the end of the
      // current stage so it returns within this session, not tomorrow.
      let queueLength = queue.length;
      if (rating === 'again') {
        setQueue((previous) => {
          const next = [...previous];
          const lastOfStage = next.findLastIndex((q) => q.stage === entry.stage);
          next.splice(lastOfStage + 1, 0, {
            ...entry,
            isNewItem: false,
            attempt: entry.attempt + 1,
          });
          return next;
        });
        queueLength += 1;
      }

      lastCorrectRef.current = null;
      setAnswered(false);
      setSaving(false);

      const nextCursor = cursor + 1;
      setCursor(nextCursor);
      if (nextCursor >= queueLength) void finish(nextStats);
    },
    [current, exercise, saving, enrollmentId, cursor, queue.length, stats, finish],
  );

  // Keyboard shortcuts: Space reveals, 1-4 rate. Ignored while typing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.code === 'Space' && !answered) {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-reveal-button]')?.click();
        return;
      }

      if (answered && ['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault();
        const rating = RATING_KEYS[Number(event.key) - 1];
        if (rating) void handleRate(rating);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [answered, handleRate]);

  if (finished || !current || !item || !exercise) {
    return (
      <SessionSummary
        reviewed={stats.reviewed}
        learned={stats.learned}
        accuracy={stats.graded > 0 ? stats.correct / stats.graded : null}
        durationMs={elapsedMs}
        onDone={() => router.push('/bang-dieu-khien')}
      />
    );
  }

  const progress = sessionProgress(plan, Math.min(cursor, plan.totalSteps));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="container-page flex h-16 items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/bang-dieu-khien')}
            aria-label={t('exit')}
          >
            <X className="size-5" aria-hidden="true" />
          </Button>

          <div className="flex-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t(`stages.${progress.stage}`)}</span>
              <span className="text-fg-subtle tabular-nums">
                {t('progress', { current: progress.overallIndex, total: progress.overallTotal })}
              </span>
            </div>

            {/* Progress is always visible: the learner should never wonder how much is left. */}
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('title')}
            >
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${progress.percent}%` }}
                transition={reduced ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="container-page flex flex-1 flex-col py-10">
        <div className="mx-auto w-full max-w-2xl flex-1">
          {/* Remounting per card resets the card's own state without an effect. */}
          <StudyCard
            key={`${current.itemId}-${current.attempt}`}
            item={item}
            exercise={exercise}
            showTransliteration={showTransliteration}
            onToggleTransliteration={() => setShowTransliteration((value) => !value)}
            canSpeak={canSpeak}
            onSpeak={() => speak(item.fields.text ?? '', ttsRate)}
            onAnswered={handleAnswered}
            answered={answered}
          />
        </div>

        <div className="mx-auto mt-10 w-full max-w-2xl">
          {answered ? (
            <RatingButtons intervals={intervals} onRate={(r) => void handleRate(r)} disabled={saving} />
          ) : (
            <p className="hidden text-center text-sm text-fg-subtle sm:block">{t('keyboardHints')}</p>
          )}

          {plan.deferredReviews > 0 ? (
            <p className="mt-6 text-center text-sm text-fg-subtle">
              {t('deferredReviews', { count: plan.deferredReviews })}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
