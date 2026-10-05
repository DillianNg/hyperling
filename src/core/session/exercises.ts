import type { ExerciseKind } from '@/config/app.config';

/**
 * Exercise generation, pure and deterministic.
 *
 * Determinism matters for more than tests: a learner who reloads mid-question
 * must get the same question back, not a different one. Everything that would
 * otherwise be random is derived from a seed built out of the item id.
 */

export interface ExerciseItem {
  itemId: string;
  stableKey: string;
  /** Target-language text, the thing being learned. */
  prompt: string;
  /** Meaning in the learner's own language. */
  answer: string;
}

export interface MultipleChoiceExercise {
  kind: 'mcq';
  itemId: string;
  /** Shown to the learner: the target-language sentence. */
  question: string;
  options: string[];
  correctIndex: number;
}

export interface TypingExercise {
  kind: 'type';
  itemId: string;
  /** The meaning; the learner types the target-language sentence. */
  question: string;
  expected: string;
}

export interface ClozeExercise {
  kind: 'cloze';
  itemId: string;
  /** Sentence with one word replaced by a blank. */
  question: string;
  /** The removed word. */
  expected: string;
  /** Meaning, shown as support. */
  hint: string;
}

export interface FlipExercise {
  kind: 'flip';
  itemId: string;
  question: string;
  answer: string;
}

export type Exercise = MultipleChoiceExercise | TypingExercise | ClozeExercise | FlipExercise;

/** Small deterministic hash, used to seed every "random" choice. */
export function seedFrom(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic PRNG: same seed, same sequence. */
function createRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

export function shuffleWithSeed<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  const random = createRandom(seed);
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Which exercise to use for a given item.
 *
 * The first encounter is always recognition (multiple choice): asking someone to
 * produce a sentence they met a minute ago tests nothing but frustration.
 * Production (typing, cloze) arrives once the card has some history.
 */
export function pickExerciseKind(args: {
  itemId: string;
  reps: number;
  /** Consolidation at the end of the day stays light. */
  isConsolidation: boolean;
}): ExerciseKind {
  const { itemId, reps, isConsolidation } = args;
  if (reps === 0) return 'mcq';
  if (isConsolidation) return 'mcq';
  if (reps === 1) return 'cloze';
  // From here on alternate, seeded per item so it is stable across reloads.
  return seedFrom(itemId) % 2 === 0 ? 'type' : 'cloze';
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

/**
 * Multiple choice over meanings. Distractors come from other items in the same
 * course, so the wrong answers are plausible rather than absurd.
 */
export function buildMultipleChoice(
  item: ExerciseItem,
  distractorPool: readonly ExerciseItem[],
): MultipleChoiceExercise {
  const seed = seedFrom(item.itemId);

  const candidates = distractorPool
    .filter((candidate) => candidate.itemId !== item.itemId && candidate.answer !== item.answer)
    // De-duplicate by answer text: two identical options would be unanswerable.
    .filter((candidate, index, all) => all.findIndex((c) => c.answer === candidate.answer) === index);

  const distractors = shuffleWithSeed(candidates, seed)
    .slice(0, MAX_OPTIONS - 1)
    .map((c) => c.answer);

  const options = shuffleWithSeed([item.answer, ...distractors], seed + 1);

  return {
    kind: 'mcq',
    itemId: item.itemId,
    question: item.prompt,
    options,
    correctIndex: options.indexOf(item.answer),
  };
}

/** Enough distinct meanings exist to build a usable question. */
export function canBuildMultipleChoice(
  item: ExerciseItem,
  distractorPool: readonly ExerciseItem[],
): boolean {
  const distinct = new Set(
    distractorPool.filter((c) => c.itemId !== item.itemId).map((c) => c.answer),
  );
  distinct.delete(item.answer);
  return distinct.size >= MIN_OPTIONS - 1;
}

export function buildTyping(item: ExerciseItem): TypingExercise {
  return { kind: 'type', itemId: item.itemId, question: item.answer, expected: item.prompt };
}

const BLANK = '____';

/**
 * Blank out one word of the sentence. Longer words carry more meaning than
 * articles, so the longest word is chosen — and the choice is deterministic,
 * which also means the same blank reappears on a reload.
 */
export function buildCloze(item: ExerciseItem): ClozeExercise | null {
  const words = item.prompt.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  let bestIndex = 0;
  let bestScore = -1;
  words.forEach((word, index) => {
    const bare = stripPunctuation(word);
    // Ties break toward the later word, which tends to be the content word.
    const score = bare.length;
    if (score >= bestScore && bare.length > 1) {
      bestScore = score;
      bestIndex = index;
    }
  });

  const target = words[bestIndex]!;
  const expected = stripPunctuation(target);
  if (expected.length < 2) return null;

  const question = words
    .map((word, index) => (index === bestIndex ? word.replace(expected, BLANK) : word))
    .join(' ');

  return { kind: 'cloze', itemId: item.itemId, question, expected, hint: item.answer };
}

export function buildFlip(item: ExerciseItem): FlipExercise {
  return { kind: 'flip', itemId: item.itemId, question: item.prompt, answer: item.answer };
}

/** Build the exercise of the requested kind, falling back when it is not possible. */
export function buildExercise(
  kind: ExerciseKind,
  item: ExerciseItem,
  distractorPool: readonly ExerciseItem[],
): Exercise {
  switch (kind) {
    case 'mcq':
      return canBuildMultipleChoice(item, distractorPool)
        ? buildMultipleChoice(item, distractorPool)
        : buildFlip(item);
    case 'cloze':
      return buildCloze(item) ?? buildFlip(item);
    case 'type':
      return buildTyping(item);
    case 'flip':
      return buildFlip(item);
  }
}

function stripPunctuation(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/**
 * Compare a typed answer with the expected text.
 *
 * Forgiving about what does not matter — case, spacing, surrounding punctuation —
 * and strict about what does. German umlauts are *not* folded away: writing
 * "schon" for "schön" is a different word, and accepting it would teach the
 * mistake.
 */
export function checkTypedAnswer(typed: string, expected: string): boolean {
  return normalizeForComparison(typed) === normalizeForComparison(expected);
}

export function normalizeForComparison(value: string): string {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('de-DE')
    .replace(/[.,!?;:¡¿"'„“”‚‘’()[\]]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** How close a wrong answer was, so feedback can say "almost". */
export function answerCloseness(typed: string, expected: string): number {
  const a = normalizeForComparison(typed);
  const b = normalizeForComparison(expected);
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

function levenshtein(a: string, b: string): number {
  // Single-row variant: only the previous row is ever needed.
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, previous[j]! + 1, current[j - 1]! + 1);
    }
    previous = current;
  }
  return previous[b.length]!;
}
