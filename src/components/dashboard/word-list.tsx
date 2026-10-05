'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import { formatVi } from '@/core/planner/plan';
import type { LearnedWord } from '@/lib/data/stats';
import { toggleHard } from '@/app/tu-vung/actions';

/**
 * The sentences a learner has studied, with search, filters and the "hard" mark.
 *
 * Filters live in the URL rather than in component state, so a filtered view can
 * be bookmarked, shared and survives a reload.
 */

const GENDER_CLASS: Record<string, string> = {
  der: 'bg-gender-der-subtle text-gender-der',
  die: 'bg-gender-die-subtle text-gender-die',
  das: 'bg-gender-das-subtle text-gender-das',
};

export function WordList({
  enrollmentId,
  words,
  total,
  page,
  pageSize,
  levels,
  filters,
}: {
  enrollmentId: string;
  words: LearnedWord[];
  total: number;
  page: number;
  pageSize: number;
  levels: string[];
  filters: { q: string; level: string; onlyHard: boolean };
}) {
  const t = useTranslations('words');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(filters.q);
  const [hardIds, setHardIds] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  function updateQuery(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    // Any filter change starts the listing again from the first page.
    if (!('trang' in changes)) next.delete('trang');
    router.push(`${pathname}?${next.toString()}`);
  }

  function onToggleHard(word: LearnedWord) {
    const nextValue = !(hardIds[word.itemId] ?? word.isHard);
    setHardIds((current) => ({ ...current, [word.itemId]: nextValue }));

    startTransition(async () => {
      const result = await toggleHard({ itemId: word.itemId, isHard: nextValue, enrollmentId });
      // Put the star back if the write failed, rather than showing an unsaved state.
      if (!result.ok) {
        setHardIds((current) => ({ ...current, [word.itemId]: !nextValue }));
      }
    });
  }

  const lastPage = Math.max(Math.ceil(total / pageSize), 1);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-8">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          updateQuery({ q: search });
        }}
      >
        <div className="min-w-56 flex-1">
          <label htmlFor="word-search" className="sr-only">
            {t('searchLabel')}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle"
              aria-hidden="true"
            />
            <Input
              id="word-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('search')}
              className="pl-10"
              type="search"
            />
          </div>
        </div>

        <div>
          <label htmlFor="level-filter" className="sr-only">
            {t('allLevels')}
          </label>
          <select
            id="level-filter"
            value={filters.level}
            onChange={(event) => updateQuery({ cap: event.target.value || null })}
            className="h-12 rounded-field border border-border-strong bg-surface-raised px-3.5 text-[0.9375rem]"
          >
            <option value="">{t('allLevels')}</option>
            {levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="button"
          variant={filters.onlyHard ? 'primary' : 'outline'}
          size="lg"
          aria-pressed={filters.onlyHard}
          onClick={() => updateQuery({ kho: filters.onlyHard ? null : '1' })}
        >
          <Star aria-hidden="true" />
          {t('onlyHard')}
        </Button>
      </form>

      {words.length === 0 ? (
        <p className="mt-10 text-fg-muted">
          {filters.q || filters.level || filters.onlyHard ? t('empty') : t('emptyAll')}
        </p>
      ) : (
        <ul className="mt-7 space-y-3">
          {words.map((word) => {
            const isHard = hardIds[word.itemId] ?? word.isHard;
            return (
              <li key={word.itemId} className="rounded-card border border-border bg-surface-raised p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-display text-lg font-semibold">{word.text}</p>
                    <p className="mt-1 text-fg-muted">{word.meaning}</p>
                    {word.transliteration ? (
                      <p className="mt-1 text-sm text-fg-subtle italic">{word.transliteration}</p>
                    ) : null}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onToggleHard(word)}
                    aria-pressed={isHard}
                    aria-label={isHard ? t('unmarkHard') : t('markHard')}
                    title={isHard ? t('unmarkHard') : t('markHard')}
                  >
                    <Star
                      className={cn('size-5', isHard ? 'fill-warning text-warning' : 'text-fg-subtle')}
                      aria-hidden="true"
                    />
                  </Button>
                </div>

                {word.glossary.length > 0 ? (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {word.glossary.map((entry) => (
                      <li
                        key={`${entry.term}-${entry.meaning}`}
                        className={cn(
                          'rounded-field px-2.5 py-1 text-sm',
                          entry.gender && GENDER_CLASS[entry.gender]
                            ? GENDER_CLASS[entry.gender]
                            : 'bg-surface-sunken text-fg-muted',
                        )}
                      >
                        <span className="font-medium">{entry.term}</span>
                        <span className="mx-1.5 opacity-50">·</span>
                        <span>{entry.meaning}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-subtle">
                  <span>{word.level}</span>
                  <span>{word.topic}</span>
                  <span>{t('reps', { count: word.reps })}</span>
                  {word.lapses > 0 ? <span>{t('lapses', { count: word.lapses })}</span> : null}
                  {word.due ? <span>{t('nextReview', { date: formatVi(word.due) })}</span> : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {total > pageSize ? (
        <nav className="mt-8 flex items-center justify-between gap-4" aria-label={t('title')}>
          <p className="text-sm text-fg-subtle">{t('showing', { from, to, total })}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateQuery({ trang: String(page - 1) })}
            >
              {t('previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => updateQuery({ trang: String(page + 1) })}
            >
              {t('next')}
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
