import { z } from 'zod';
import { CEFR_LEVELS } from '@/config/app.config';

/**
 * Content schemas. These define the contract between content files and the engine.
 *
 * Design rule: the engine must never know it is teaching German. Everything
 * language-specific (noun gender, transliteration, kanji, tones...) is declared
 * by the course through `fields` / `glossaryFields` and carried in `fields` bags.
 * See docs/ADDING_A_LANGUAGE.md.
 */

export const cefrLevelSchema = z.enum(CEFR_LEVELS);

/** BCP-47-ish language code: `de`, `vi`, `pt-BR`. */
export const languageCodeSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/, 'Mã ngôn ngữ phải theo dạng BCP-47, ví dụ "de" hoặc "pt-BR".');

/** Course id doubles as a folder name and a stable database key — never rename it. */
export const courseIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Course id chỉ gồm chữ thường, số và dấu gạch ngang, ví dụ "de-a1-b2".');

export const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'Version phải theo dạng semver, ví dụ "1.0.0".');

/** A localized label. `vi` is mandatory because Vietnamese is the default UI locale. */
export const localizedTextSchema = z.object({
  vi: z.string().min(1, 'Thiếu bản tiếng Việt.'),
  en: z.string().min(1).optional(),
});

/**
 * How one field of an item behaves in the UI. This is the "field plugin" mechanism:
 * a new language declares its own fields here instead of touching engine code.
 */
export const fieldRoleSchema = z.enum([
  'prompt', // what the learner is asked to produce/recognise (the target-language text)
  'answer', // the meaning in the learner's own language
  'hint', // optional support, e.g. Vietnamese-style transliteration
  'note', // explanatory text, e.g. the grammar point
  'tag', // short classifier, e.g. sentence type
  'badge', // tiny coloured marker, e.g. der/die/das
  'audio', // url or key for pronunciation audio
]);

export const fieldSpecSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]*$/, 'Key của field phải viết dạng camelCase, ví dụ "grammarNote".'),
  role: fieldRoleSchema,
  label: localizedTextSchema.optional(),
  required: z.boolean().default(false),
  /** `toggle` lets the learner hide the field (used for transliteration). */
  display: z.enum(['always', 'toggle', 'reveal']).default('always'),
  /** Render each distinct value in its own colour (used for noun gender). */
  colorCoded: z.boolean().default(false),
  /** Closed value set. Validation rejects anything outside it. */
  enum: z.array(z.string().min(1)).min(1).optional(),
});
export type FieldSpec = z.infer<typeof fieldSpecSchema>;

export const ttsSpecSchema = z.object({
  /** BCP-47 tag handed to the speech engine, e.g. `de-DE`. */
  lang: z.string().min(2),
  rate: z.number().min(0.5).max(2).default(0.9),
});

export const courseSchema = z
  .object({
    id: courseIdSchema,
    schemaVersion: z.literal(1),
    version: semverSchema,
    title: localizedTextSchema,
    description: localizedTextSchema.optional(),
    targetLanguage: languageCodeSchema,
    sourceLanguage: languageCodeSchema,
    levelFramework: z.literal('CEFR'),
    levelFrom: cefrLevelSchema,
    levelTo: cefrLevelSchema,
    /** Every level this course intends to cover, ascending. Content may lag behind. */
    levels: z.array(cefrLevelSchema).min(1),
    primaryItemKind: z.enum(['sentence', 'word', 'phrase']),
    fields: z.array(fieldSpecSchema).min(1),
    glossaryFields: z.array(fieldSpecSchema).default([]),
    tts: ttsSpecSchema.optional(),
    source: z
      .object({
        name: z.string().min(1),
        note: z.string().optional(),
      })
      .optional(),
  })
  .superRefine((course, ctx) => {
    const order = (lvl: string) => CEFR_LEVELS.indexOf(lvl as (typeof CEFR_LEVELS)[number]);
    if (order(course.levelFrom) > order(course.levelTo)) {
      ctx.addIssue({
        code: 'custom',
        path: ['levelTo'],
        message: `levelTo (${course.levelTo}) phải cao hơn hoặc bằng levelFrom (${course.levelFrom}).`,
      });
    }
    for (const lvl of course.levels) {
      if (order(lvl) < order(course.levelFrom) || order(lvl) > order(course.levelTo)) {
        ctx.addIssue({
          code: 'custom',
          path: ['levels'],
          message: `Cấp độ "${lvl}" nằm ngoài khoảng ${course.levelFrom}–${course.levelTo}.`,
        });
      }
    }
    const seen = new Set<string>();
    for (const f of [...course.fields, ...course.glossaryFields]) {
      const scope = course.fields.includes(f) ? 'fields' : 'glossaryFields';
      const id = `${scope}:${f.key}`;
      if (seen.has(id)) {
        ctx.addIssue({ code: 'custom', path: [scope], message: `Field "${f.key}" bị khai báo trùng.` });
      }
      seen.add(id);
    }
    if (!course.fields.some((f) => f.role === 'prompt')) {
      ctx.addIssue({ code: 'custom', path: ['fields'], message: 'Phải có đúng một field role="prompt".' });
    }
    if (!course.fields.some((f) => f.role === 'answer')) {
      ctx.addIssue({ code: 'custom', path: ['fields'], message: 'Phải có đúng một field role="answer".' });
    }
  });
export type Course = z.infer<typeof courseSchema>;

/** Canonical part-of-speech values. Vietnamese labels live in src/messages/. */
export const partOfSpeechSchema = z.enum([
  'noun',
  'verb',
  'reflexive_verb',
  'adjective',
  'adverb',
  'phrase',
  'other',
]);
export type PartOfSpeech = z.infer<typeof partOfSpeechSchema>;

export const glossaryEntrySchema = z.object({
  term: z.string().min(1, 'Thiếu từ/cụm từ.').trim(),
  meaning: z.string().min(1, 'Thiếu nghĩa của từ.').trim(),
  partOfSpeech: partOfSpeechSchema.default('other'),
  /** Free-form per-language extras declared via course.glossaryFields, e.g. `{ gender: "der" }`. */
  fields: z.record(z.string(), z.string()).default({}),
});
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;

/** `S0001` — the id carried over from the source spreadsheet. Must never change. */
export const stableKeySchema = z
  .string()
  .regex(/^[A-Z]\d{4,6}$/, 'stableKey phải theo dạng một chữ in hoa + 4–6 số, ví dụ "S0001".');

export const itemSchema = z.object({
  stableKey: stableKeySchema,
  kind: z.enum(['sentence', 'word', 'phrase']),
  level: cefrLevelSchema,
  topic: z.string().min(1, 'Thiếu chủ đề.').trim(),
  /** Teaching order within the course, 1-based and gapless. The planner maps it to dates. */
  orderIndex: z.number().int().positive(),
  /** Values for the fields the course declared. Validated against them in validateItemsFile(). */
  fields: z.record(z.string(), z.string()),
  glossary: z.array(glossaryEntrySchema).default([]),
});
export type ContentItem = z.infer<typeof itemSchema>;

export const itemsFileSchema = z.object({
  courseId: courseIdSchema,
  schemaVersion: z.literal(1),
  items: z.array(itemSchema).min(1, 'File nội dung không có mục nào.'),
});
export type ItemsFile = z.infer<typeof itemsFileSchema>;
