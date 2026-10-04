/**
 * pnpm content:new -- --lang fr --level A1-B2 [--source vi] [--id fr-a1-b2]
 *
 * Scaffolds content/<lang>/<course-id>/ with a course.json and a starter items
 * file. This is the whole "add a language" entry point: no engine code changes.
 * Language-specific fields (gender, tone marks, kanji, ...) are declared in the
 * generated course.json and can be edited before importing.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CEFR_LEVELS } from '../src/config/app.config.js';
import { courseSchema, itemsFileSchema } from '../src/core/content/schema.js';
import { CONTENT_DIR, rel } from './lib/paths.js';

const USAGE = `Cách dùng: pnpm content:new -- --lang <mã> --level <A1-B2> [--source vi] [--id <course-id>]

Ví dụ:
  pnpm content:new -- --lang fr --level A1-B2
  pnpm content:new -- --lang ja --level A0-A2 --source en`;

/** Field sets that differ by language family. Starting points, meant to be edited. */
const FIELD_PRESETS: Record<string, Array<{ key: string; role: string; display?: string; colorCoded?: boolean }>> = {
  default: [
    { key: 'text', role: 'prompt' },
    { key: 'meaning', role: 'answer' },
    { key: 'transliteration', role: 'hint', display: 'toggle' },
    { key: 'grammarNote', role: 'note' },
  ],
};

/** Glossary extras some languages need. Empty means "no extras". */
const GLOSSARY_PRESETS: Record<string, Array<Record<string, unknown>>> = {
  de: [{ key: 'gender', role: 'badge', colorCoded: true, enum: ['der', 'die', 'das'] }],
  fr: [{ key: 'gender', role: 'badge', colorCoded: true, enum: ['le', 'la'] }],
  es: [{ key: 'gender', role: 'badge', colorCoded: true, enum: ['el', 'la'] }],
  ja: [{ key: 'kanji', role: 'note' }],
  zh: [{ key: 'pinyin', role: 'hint' }],
};

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function parseLevelRange(raw: string): { from: string; to: string; levels: string[] } | null {
  const [from, to] = raw.toUpperCase().split('-');
  if (!from || !to) return null;
  const fromIndex = CEFR_LEVELS.indexOf(from as (typeof CEFR_LEVELS)[number]);
  const toIndex = CEFR_LEVELS.indexOf(to as (typeof CEFR_LEVELS)[number]);
  if (fromIndex === -1 || toIndex === -1 || fromIndex > toIndex) return null;
  return { from, to, levels: CEFR_LEVELS.slice(fromIndex, toIndex + 1) as unknown as string[] };
}

function main(): number {
  const args = process.argv.slice(2);
  const lang = flag(args, 'lang');
  const levelRange = flag(args, 'level');
  const sourceLanguage = flag(args, 'source') ?? 'vi';

  if (!lang || !levelRange) {
    console.error(USAGE);
    return 1;
  }

  const range = parseLevelRange(levelRange);
  if (!range) {
    console.error(`--level không hợp lệ: "${levelRange}". Phải theo dạng A1-B2, trong ${CEFR_LEVELS.join(', ')}.`);
    return 1;
  }

  const courseId = flag(args, 'id') ?? `${lang}-${range.from}-${range.to}`.toLowerCase();
  const dir = join(CONTENT_DIR, lang, courseId);

  if (existsSync(dir)) {
    console.error(`Thư mục đã tồn tại: ${rel(dir)}. Chọn --id khác hoặc xoá thư mục cũ.`);
    return 1;
  }

  const fields = (FIELD_PRESETS.default ?? []).map((f) => ({
    ...f,
    required: f.key === 'text' || f.key === 'meaning',
  }));

  const course = {
    id: courseId,
    schemaVersion: 1 as const,
    version: '0.1.0',
    title: { vi: `TODO: tên khóa học (${lang}, ${range.from}–${range.to})` },
    description: { vi: 'TODO: mô tả ngắn hiển thị trên trang chọn khóa.' },
    targetLanguage: lang,
    sourceLanguage,
    levelFramework: 'CEFR' as const,
    levelFrom: range.from,
    levelTo: range.to,
    levels: range.levels,
    primaryItemKind: 'sentence' as const,
    fields,
    glossaryFields: GLOSSARY_PRESETS[lang] ?? [],
    tts: { lang, rate: 0.9 },
    source: { name: 'TODO: nguồn dữ liệu', note: 'TODO' },
  };

  // The scaffold must itself be valid, otherwise it is a trap for the next person.
  const checkedCourse = courseSchema.safeParse(course);
  if (!checkedCourse.success) {
    console.error('Khung course.json sinh ra không hợp lệ — đây là lỗi của script:');
    for (const issue of checkedCourse.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    return 1;
  }

  const sampleItems = {
    courseId,
    schemaVersion: 1 as const,
    items: [
      {
        stableKey: 'S0001',
        kind: 'sentence' as const,
        level: range.from,
        topic: 'TODO: chủ đề đầu tiên',
        orderIndex: 1,
        fields: {
          text: 'TODO: câu ở ngôn ngữ đích',
          meaning: 'TODO: nghĩa ở ngôn ngữ nguồn',
          transliteration: '',
          grammarNote: '',
        },
        glossary: [
          { term: 'TODO', meaning: 'TODO', partOfSpeech: 'other' as const, fields: {} },
        ],
      },
    ],
  };
  const checkedItems = itemsFileSchema.safeParse(sampleItems);
  if (!checkedItems.success) {
    console.error('Khung items.json sinh ra không hợp lệ — đây là lỗi của script:');
    for (const issue of checkedItems.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    return 1;
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'course.json'), `${JSON.stringify(course, null, 2)}\n`, 'utf8');
  writeFileSync(join(dir, 'items.json'), `${JSON.stringify(sampleItems, null, 2)}\n`, 'utf8');

  console.log(`✓ Tạo khóa mới: ${rel(dir)}`);
  console.log(`  course.json — sửa các chỗ TODO, nhất là title và glossaryFields.`);
  console.log(`  items.json  — thay mục mẫu bằng nội dung thật.`);
  console.log(`\nCác bước tiếp theo:`);
  console.log(`  1. Thêm ngôn ngữ "${lang}" vào bảng languages (xem docs/ADDING_A_LANGUAGE.md).`);
  console.log(`  2. pnpm content:ingest -- <file.tsv> --course ${courseId}   (nếu có dữ liệu dạng bảng)`);
  console.log(`  3. pnpm content:validate ${courseId}`);
  console.log(`  4. pnpm content:import ${courseId}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
