import { z } from 'zod';
import { glossaryEntrySchema, stableKeySchema } from './schema';

/**
 * The learner's own sentences.
 *
 * These are sentences met outside the app — overheard, read, taught in class —
 * that the learner wants on the same review schedule as the curriculum. They
 * are stored as ordinary `items` rows owned by the learner, so everything
 * downstream (FSRS, buildSession, the word list, the dashboard) treats them
 * identically to imported content and needs no notion of "personal".
 *
 * What this module owns is the part that must not be decided twice: what a
 * notebook row is allowed to contain, and how it is keyed.
 */

/**
 * The notebook's level code.
 *
 * Deliberately not a CEFR level. A sentence picked up in the wild has no level
 * until someone grades it, and grading it on the learner's behalf would be
 * inventing data. It sits in its own framework so no CEFR ordering is implied —
 * in particular `levelsToStudy` and the planner never see it.
 */
export const NOTEBOOK_LEVEL = 'PERSONAL';

/** Course that holds every learner's German notebook, one owner per row. */
export const NOTEBOOK_COURSE_ID_BY_LANGUAGE: Record<string, string> = { de: 'de-personal' };

/** Topic recorded when the learner does not give one. */
export const NOTEBOOK_DEFAULT_TOPIC = 'Sổ tay';

/**
 * Only the sentence and its meaning are required.
 *
 * Asking for IPA up front would stop the learner writing a sentence down at the
 * moment they meet it, which is the only moment they reliably will. The study
 * card already hides whichever optional fields are absent, so a bare
 * sentence/meaning pair renders correctly rather than leaving empty headings.
 */
export const notebookItemInputSchema = z.object({
  // `.trim()` first: Zod applies checks in declaration order, so `.min(1)`
  // before `.trim()` accepts a string of spaces and then trims it to nothing.
  text: z.string().trim().min(1, 'Thiếu câu tiếng Đức.').max(500, 'Câu quá dài (tối đa 500 ký tự).'),
  meaning: z
    .string()
    .trim()
    .min(1, 'Thiếu nghĩa tiếng Việt.')
    .max(500, 'Nghĩa quá dài (tối đa 500 ký tự).'),
  transliteration: z
    .string()
    .max(500, 'Phiên âm quá dài (tối đa 500 ký tự).')
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  grammarNote: z
    .string()
    .max(1000, 'Ghi chú ngữ pháp quá dài (tối đa 1000 ký tự).')
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  topic: z
    .string()
    .max(100, 'Chủ đề quá dài (tối đa 100 ký tự).')
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  glossary: z.array(glossaryEntrySchema).max(20, 'Tối đa 20 chú thích từ vựng cho một câu.').default([]),
});

export type NotebookItemInput = z.infer<typeof notebookItemInputSchema>;

/**
 * The `fields` jsonb for a notebook row, with absent optional fields left out
 * rather than stored as empty strings — the study card tests presence, so an
 * empty string would render a heading above nothing.
 */
export function notebookFields(input: NotebookItemInput): Record<string, string> {
  const fields: Record<string, string> = { text: input.text, meaning: input.meaning };
  if (input.transliteration) fields.transliteration = input.transliteration;
  if (input.grammarNote) fields.grammarNote = input.grammarNote;
  return fields;
}

/**
 * `P0001` — the stable key for the learner's n-th sentence.
 *
 * Derived from `orderIndex` rather than counted separately, so the two cannot
 * drift apart. `P` keeps notebook keys visibly distinct from imported `S` keys
 * in logs and in the word list, and the pair (course, owner, key) is unique per
 * learner, so two learners both having `P0001` is expected, not a collision.
 */
export function notebookStableKey(orderIndex: number): string {
  if (!Number.isInteger(orderIndex) || orderIndex < 1) {
    throw new Error(`orderIndex phải là số nguyên dương, nhận được ${orderIndex}.`);
  }
  const key = `P${String(orderIndex).padStart(4, '0')}`;
  // The shared format is enforced here rather than trusted: a key that fails it
  // would be rejected by content validation later, far from this function.
  return stableKeySchema.parse(key);
}
