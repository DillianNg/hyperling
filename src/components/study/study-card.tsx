'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Eye, Volume2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import type { Exercise } from '@/core/session/exercises';
import { answerCloseness, checkTypedAnswer } from '@/core/session/exercises';

/**
 * One item on screen.
 *
 * The shape of the card is driven by the course's field declarations, not by
 * the language: transliteration appears because the course declared a `hint`
 * field, gender colours appear because it declared a colour-coded badge.
 */

export interface StudyCardItem {
  id: string;
  stableKey: string;
  topic: string;
  fields: Record<string, string>;
  glossary: Array<{
    term: string;
    meaning: string;
    partOfSpeech: string;
    fields: Record<string, string>;
  }>;
}

export interface StudyCardProps {
  item: StudyCardItem;
  exercise: Exercise;
  showTransliteration: boolean;
  onToggleTransliteration: () => void;
  canSpeak: boolean;
  onSpeak: () => void;
  /** Called once the learner has produced an answer (or revealed it). */
  onAnswered: (result: { isCorrect: boolean | null }) => void;
  answered: boolean;
}

const GENDER_CLASS: Record<string, string> = {
  der: 'bg-gender-der-subtle text-gender-der',
  die: 'bg-gender-die-subtle text-gender-die',
  das: 'bg-gender-das-subtle text-gender-das',
};

export function StudyCard({
  item,
  exercise,
  showTransliteration,
  onToggleTransliteration,
  canSpeak,
  onSpeak,
  onAnswered,
  answered,
}: StudyCardProps) {
  const t = useTranslations('study');
  const reduced = useReducedMotion();

  // This component is remounted per exercise (see the `key` in SessionRunner),
  // so component state starts clean without an effect to reset it.
  const [typed, setTyped] = useState('');
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const expected = exercise.kind === 'type' || exercise.kind === 'cloze' ? exercise.expected : '';
  const typedCorrect = expected ? checkTypedAnswer(typed, expected) : false;
  const closeness = expected ? answerCloseness(typed, expected) : 0;

  function submitTyped() {
    if (revealed) return;
    setRevealed(true);
    onAnswered({ isCorrect: typedCorrect });
  }

  function chooseOption(index: number) {
    if (chosenIndex !== null) return;
    setChosenIndex(index);
    setRevealed(true);
    onAnswered({ isCorrect: exercise.kind === 'mcq' ? index === exercise.correctIndex : null });
  }

  function reveal() {
    if (revealed) return;
    setRevealed(true);
    onAnswered({ isCorrect: null });
  }

  const transliteration = item.fields.transliteration;
  const grammarNote = item.fields.grammarNote;

  return (
    <div className="flex flex-col">
      <p className="text-sm text-fg-subtle">{item.topic}</p>

      {/* The prompt: the biggest thing on screen, in the target language. */}
      <div className="mt-4 flex items-start gap-3">
        <motion.p
          key={exercise.itemId}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-2xl leading-snug font-semibold sm:text-3xl"
        >
          {exercise.kind === 'type' ? exercise.question : exercise.question}
        </motion.p>

        {canSpeak ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSpeak}
            aria-label={t('playAudio')}
            title={t('playAudio')}
            className="shrink-0"
          >
            <Volume2 className="size-5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {transliteration ? (
        <div className="mt-3">
          {showTransliteration ? (
            <p className="text-fg-muted italic">{transliteration}</p>
          ) : null}
          <button
            type="button"
            onClick={onToggleTransliteration}
            className="mt-1 text-sm text-fg-subtle underline underline-offset-4 hover:text-fg"
          >
            {showTransliteration ? t('hideTransliteration') : t('showTransliteration')}
          </button>
        </div>
      ) : null}

      {/* The answer area changes with the exercise kind. */}
      <div className="mt-8">
        {exercise.kind === 'mcq' ? (
          <ul className="grid gap-2.5">
            {exercise.options.map((option, index) => {
              const isCorrectOption = index === exercise.correctIndex;
              const isChosen = chosenIndex === index;
              const state =
                chosenIndex === null
                  ? 'idle'
                  : isCorrectOption
                    ? 'correct'
                    : isChosen
                      ? 'wrong'
                      : 'muted';

              return (
                <li key={option}>
                  <button
                    type="button"
                    onClick={() => chooseOption(index)}
                    disabled={chosenIndex !== null}
                    className={cn(
                      'flex min-h-14 w-full items-center justify-between gap-3 rounded-card border px-5 py-3.5 text-left transition-colors',
                      state === 'idle' && 'border-border bg-surface-raised hover:bg-surface-hover',
                      state === 'correct' && 'border-success bg-success-subtle',
                      state === 'wrong' && 'border-danger bg-danger-subtle',
                      state === 'muted' && 'border-border bg-surface-raised opacity-55',
                    )}
                  >
                    <span>{option}</span>
                    {state === 'correct' ? (
                      <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                    ) : null}
                    {state === 'wrong' ? (
                      <X className="size-4 shrink-0 text-danger" aria-hidden="true" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {exercise.kind === 'type' || exercise.kind === 'cloze' ? (
          <div>
            {exercise.kind === 'cloze' ? (
              <p className="mb-4 text-fg-muted">{exercise.hint}</p>
            ) : null}

            <div className="flex gap-2">
              <Input
                autoFocus
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitTyped();
                  }
                }}
                disabled={revealed}
                placeholder={t('typePlaceholder')}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label={t('typePlaceholder')}
              />
              <Button type="button" onClick={submitTyped} disabled={revealed || typed.length === 0}>
                {t('check')}
              </Button>
            </div>

            {revealed ? (
              <div
                role="status"
                className={cn(
                  'mt-4 rounded-card border p-4',
                  typedCorrect
                    ? 'border-success bg-success-subtle'
                    : closeness > 0.8
                      ? 'border-warning bg-warning-subtle'
                      : 'border-danger bg-danger-subtle',
                )}
              >
                <p className="font-medium">
                  {typedCorrect ? t('correct') : closeness > 0.8 ? t('almost') : t('incorrect')}
                </p>
                {!typedCorrect ? (
                  <p className="mt-1 text-[0.9375rem]">
                    {t('expectedAnswer', { answer: expected })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {exercise.kind === 'flip' ? (
          <div>
            {revealed ? (
              <motion.p
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="text-xl"
              >
                {exercise.answer}
              </motion.p>
            ) : (
              <Button type="button" variant="outline" size="lg" onClick={reveal} data-reveal-button>
                <Eye aria-hidden="true" />
                {t('show')}
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {/* Supporting detail, shown only after the learner has committed. */}
      {(revealed || answered) && (grammarNote || item.glossary.length > 0) ? (
        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.1 }}
          className="mt-8 space-y-5 border-t border-border pt-6"
        >
          {exercise.kind !== 'flip' && exercise.kind !== 'mcq' ? (
            <p className="text-lg">{item.fields.meaning}</p>
          ) : null}

          {grammarNote ? (
            <div>
              <h3 className="text-sm font-medium text-fg-subtle">{t('grammarNote')}</h3>
              <p className="mt-1 text-[0.9375rem]">{grammarNote}</p>
            </div>
          ) : null}

          {item.glossary.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-fg-subtle">{t('glossary')}</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {item.glossary.map((entry) => {
                  const gender = entry.fields.gender;
                  return (
                    <li
                      key={`${entry.term}-${entry.meaning}`}
                      className={cn(
                        'rounded-field px-3 py-1.5 text-sm',
                        gender && GENDER_CLASS[gender]
                          ? GENDER_CLASS[gender]
                          : 'bg-surface-sunken text-fg-muted',
                      )}
                    >
                      <span className="font-medium">{entry.term}</span>
                      <span className="mx-1.5 opacity-50">·</span>
                      <span>{entry.meaning}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </div>
  );
}
