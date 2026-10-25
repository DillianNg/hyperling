'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import { addSentence, editSentence, removeSentence } from '@/app/so-tay/actions';
import type { NotebookItem } from '@/lib/data/notebook';

/**
 * Adding, editing and removing the learner's own sentences.
 *
 * The form asks for two things and hides the rest behind a disclosure. That is
 * the point of the feature: a sentence is written down at the moment it is met,
 * and a form that demands IPA and a part of speech first is a form that does not
 * get used. Everything optional can be filled in later by editing.
 */

const GENDERS = ['der', 'die', 'das'] as const;

interface GlossaryDraft {
  term: string;
  meaning: string;
  gender: string;
}

interface Draft {
  text: string;
  meaning: string;
  transliteration: string;
  grammarNote: string;
  topic: string;
  glossary: GlossaryDraft[];
}

const EMPTY: Draft = {
  text: '',
  meaning: '',
  transliteration: '',
  grammarNote: '',
  topic: '',
  glossary: [],
};

function draftFrom(item: NotebookItem): Draft {
  return {
    text: item.text,
    meaning: item.meaning,
    transliteration: item.transliteration ?? '',
    grammarNote: item.grammarNote ?? '',
    topic: item.topic,
    glossary: item.glossary.map((entry) => ({
      term: entry.term,
      meaning: entry.meaning,
      gender: entry.gender ?? '',
    })),
  };
}

/** Drops blank rows and blank optional fields, so nothing empty is stored. */
function toInput(draft: Draft) {
  return {
    text: draft.text,
    meaning: draft.meaning,
    ...(draft.transliteration.trim() ? { transliteration: draft.transliteration } : {}),
    ...(draft.grammarNote.trim() ? { grammarNote: draft.grammarNote } : {}),
    ...(draft.topic.trim() ? { topic: draft.topic } : {}),
    glossary: draft.glossary
      .filter((entry) => entry.term.trim() !== '' && entry.meaning.trim() !== '')
      .map((entry) => ({
        term: entry.term,
        meaning: entry.meaning,
        partOfSpeech: 'other' as const,
        fields: entry.gender ? { gender: entry.gender } : {},
      })),
  };
}

const textareaClass =
  'w-full rounded-field border border-border-strong bg-surface-raised px-4 py-3 text-base ' +
  'text-fg placeholder:text-fg-subtle transition-colors duration-150 hover:border-primary-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-55';

export interface NotebookManagerProps {
  items: NotebookItem[];
  /** Null when the learner has no course yet, so the notebook cannot be placed. */
  studyHref: string | null;
}

export function NotebookManager({ items, studyHref }: NotebookManagerProps) {
  const t = useTranslations('notebook');
  const router = useRouter();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showOptional, setShowOptional] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = draft.text.trim() !== '' && draft.meaning.trim() !== '' && !pending;

  function reset() {
    setDraft(EMPTY);
    setEditingId(null);
    setShowOptional(false);
    setError(null);
  }

  function submit() {
    if (!canSubmit) return;
    setError(null);
    const input = toInput(draft);

    startTransition(async () => {
      const result = editingId
        ? await editSentence({ itemId: editingId, input })
        : await addSentence(input);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      router.refresh();
    });
  }

  function remove(itemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeSentence({ itemId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmingId(null);
      router.refresh();
    });
  }

  function startEditing(item: NotebookItem) {
    setDraft(draftFrom(item));
    setEditingId(item.id);
    // An edit is the moment the learner fills in what they skipped, so the
    // optional fields open rather than hiding what they already wrote.
    setShowOptional(true);
    setError(null);
  }

  function updateGlossary(index: number, patch: Partial<GlossaryDraft>) {
    setDraft((current) => ({
      ...current,
      glossary: current.glossary.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  }

  return (
    <div className="mt-8 space-y-10">
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <label htmlFor="nb-text" className="text-sm font-medium">
              {t('form.text')}
            </label>
            <Input
              id="nb-text"
              value={draft.text}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              placeholder={t('form.textPlaceholder')}
              maxLength={500}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="nb-meaning" className="text-sm font-medium">
              {t('form.meaning')}
            </label>
            <Input
              id="nb-meaning"
              value={draft.meaning}
              onChange={(event) => setDraft({ ...draft, meaning: event.target.value })}
              placeholder={t('form.meaningPlaceholder')}
              maxLength={500}
              autoComplete="off"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowOptional(!showOptional)}
            className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
            aria-expanded={showOptional}
          >
            <ChevronDown
              className={cn('size-4 transition-transform', showOptional && 'rotate-180')}
              aria-hidden="true"
            />
            {t('form.optional')}
          </button>

          {showOptional ? (
            <div className="space-y-5 border-l-2 border-border pl-4">
              <div className="space-y-2">
                <label htmlFor="nb-ipa" className="text-sm font-medium">
                  {t('form.transliteration')}
                </label>
                <Input
                  id="nb-ipa"
                  value={draft.transliteration}
                  onChange={(event) => setDraft({ ...draft, transliteration: event.target.value })}
                  placeholder={t('form.transliterationPlaceholder')}
                  maxLength={500}
                  autoComplete="off"
                />
                <p className="text-xs text-fg-subtle">{t('form.transliterationHint')}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="nb-topic" className="text-sm font-medium">
                  {t('form.topic')}
                </label>
                <Input
                  id="nb-topic"
                  value={draft.topic}
                  onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
                  placeholder={t('form.topicPlaceholder')}
                  maxLength={100}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="nb-grammar" className="text-sm font-medium">
                  {t('form.grammarNote')}
                </label>
                <textarea
                  id="nb-grammar"
                  value={draft.grammarNote}
                  onChange={(event) => setDraft({ ...draft, grammarNote: event.target.value })}
                  placeholder={t('form.grammarNotePlaceholder')}
                  maxLength={1000}
                  rows={3}
                  className={textareaClass}
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">{t('form.glossary')}</p>
                {draft.glossary.map((entry, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <Input
                      value={entry.term}
                      onChange={(event) => updateGlossary(index, { term: event.target.value })}
                      placeholder={t('form.glossaryTerm')}
                      className="h-11 min-w-36 flex-1"
                      aria-label={t('form.glossaryTerm')}
                    />
                    <Input
                      value={entry.meaning}
                      onChange={(event) => updateGlossary(index, { meaning: event.target.value })}
                      placeholder={t('form.glossaryMeaning')}
                      className="h-11 min-w-36 flex-1"
                      aria-label={t('form.glossaryMeaning')}
                    />
                    <select
                      value={entry.gender}
                      onChange={(event) => updateGlossary(index, { gender: event.target.value })}
                      aria-label={t('form.glossaryGender')}
                      className="h-11 rounded-field border border-border-strong bg-surface-raised px-3 text-base"
                    >
                      <option value="">{t('form.glossaryNoGender')}</option>
                      {GENDERS.map((gender) => (
                        <option key={gender} value={gender}>
                          {gender}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          glossary: draft.glossary.filter((_, i) => i !== index),
                        })
                      }
                      aria-label={t('form.glossaryRemove')}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                {draft.glossary.length < 20 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        glossary: [...draft.glossary, { term: '', meaning: '', gender: '' }],
                      })
                    }
                  >
                    <Plus aria-hidden="true" />
                    {t('form.glossaryAdd')}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button type="button" onClick={submit} disabled={!canSubmit}>
              {editingId ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
              {pending ? t('form.saving') : editingId ? t('form.save') : t('form.submit')}
            </Button>
            {editingId ? (
              <Button type="button" variant="ghost" onClick={reset} disabled={pending}>
                {t('form.cancel')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{t('list.heading', { count: items.length })}</h2>
          {items.length > 0 && studyHref ? (
            <Button variant="secondary" size="sm" asChild>
              <a href={studyHref}>{t('list.study')}</a>
            </Button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="mt-4 max-w-prose text-fg-muted">{t('list.empty')}</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <Card>
                  <CardContent className="pt-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-medium">{item.text}</p>
                        <p className="mt-1 text-fg-muted">{item.meaning}</p>
                        {item.transliteration ? (
                          <p className="mt-1 text-sm italic text-fg-subtle">{item.transliteration}</p>
                        ) : null}
                        {item.glossary.length > 0 ? (
                          <ul className="mt-3 flex flex-wrap gap-2">
                            {item.glossary.map((entry, index) => (
                              <li
                                key={index}
                                className="rounded-full bg-surface-sunken px-3 py-1 text-xs text-fg-muted"
                              >
                                {entry.gender ? `${entry.gender} ` : ''}
                                {entry.term} — {entry.meaning}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <p className="mt-3 text-xs text-fg-subtle">
                          {item.stableKey} ·{' '}
                          {item.reps > 0 ? t('list.reps', { count: item.reps }) : t('list.unstudied')}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditing(item)}
                          disabled={pending}
                          aria-label={t('list.edit')}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmingId(confirmingId === item.id ? null : item.id)}
                          disabled={pending}
                          aria-label={t('list.delete')}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    {confirmingId === item.id ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-field bg-surface-sunken p-3">
                        <p className="text-sm">{t('list.confirmDelete')}</p>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => remove(item.id)}
                          disabled={pending}
                        >
                          {t('list.confirmYes')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingId(null)}
                          disabled={pending}
                        >
                          {t('form.cancel')}
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
