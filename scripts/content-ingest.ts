/**
 * pnpm content:ingest -- <file.csv|tsv|json> --course <course-id> [--out <name>]
 *
 * Turns a spreadsheet export into a valid items file. This is the path for adding
 * the remaining 1200 German sentences (S0601-S1800) without hand-writing JSON:
 * paste the rows out of Excel into a .tsv or .csv and run this.
 *
 * Column headers are matched against the Vietnamese labels used in the original
 * workbook as well as the canonical field keys, so either spelling works.
 * Rows with no sentence are skipped and counted; nothing is ever invented.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import { parseCourse } from '../src/core/content/validate.js';
import { itemsFileSchema, type ContentItem } from '../src/core/content/schema.js';
import { discoverCourses, readJson, rel } from './lib/paths.js';
import {
  SENTENCE_TYPES,
  canonicalHeader,
  norm,
  orderIndexFromStableKey,
  parseGlossary,
} from './lib/ingest-parse.js';

const USAGE = 'Cách dùng: pnpm content:ingest -- <file.csv|tsv|json> --course <course-id> [--out items.b1-b2.json]';

function parseTable(path: string): Array<Record<string, unknown>> {
  const content = readFileSync(path, 'utf8');

  if (path.endsWith('.json')) {
    const parsed: unknown = JSON.parse(content);
    const rows = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
    if (!Array.isArray(rows)) throw new Error('File JSON phải là một mảng, hoặc một object có khóa "items".');
    return rows as Array<Record<string, unknown>>;
  }

  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: canonicalHeader,
    delimiter: path.endsWith('.tsv') ? '\t' : '',
  });
  if (result.errors.length > 0) {
    const first = result.errors[0]!;
    throw new Error(`Lỗi đọc bảng ở dòng ${first.row ?? '?'}: ${first.message}`);
  }
  return result.data;
}

function main(): number {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith('--'));
  const courseFlag = args.indexOf('--course');
  const courseId = courseFlag === -1 ? undefined : args[courseFlag + 1];
  const outFlag = args.indexOf('--out');
  const outName = outFlag === -1 ? undefined : args[outFlag + 1];

  if (!input || !courseId || courseId.startsWith('--')) {
    console.error(USAGE);
    return 1;
  }
  if (!existsSync(input)) {
    console.error(`Không tìm thấy file: ${input}`);
    return 1;
  }

  const location = discoverCourses().find((c) => c.courseId === courseId);
  if (!location) {
    console.error(`Không tìm thấy khóa "${courseId}" trong content/.`);
    return 1;
  }

  const parsedCourse = parseCourse(readJson(location.coursePath));
  if (!('course' in parsedCourse)) {
    console.error('course.json không hợp lệ:');
    for (const issue of parsedCourse.issues) console.error(`  ${issue.path}: ${issue.message}`);
    return 1;
  }
  const { course } = parsedCourse;
  const declaredFields = new Set(course.fields.map((f) => f.key));

  // Gender articles come from the course's own declaration, never from the code.
  const genderArticles = course.glossaryFields.find((f) => f.key === 'gender')?.enum ?? [];

  const rows = parseTable(input);
  console.log(`Đọc ${rows.length} dòng từ ${input}`);

  const items: ContentItem[] = [];
  const skipped: string[] = [];
  const problems: string[] = [];

  rows.forEach((row, index) => {
    const lineNo = index + 2; // header occupies line 1
    const cell: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      cell[canonicalHeader(key)] = norm(value === null || value === undefined ? '' : String(value));
    }

    const stableKey = cell.stableKey ?? '';
    const text = cell.text ?? '';

    // Empty placeholder rows are skipped, never filled in with invented content.
    if (!text) {
      skipped.push(stableKey || `dòng ${lineNo}`);
      return;
    }
    if (!stableKey) {
      problems.push(`dòng ${lineNo}: có nội dung nhưng thiếu ID.`);
      return;
    }

    const orderIndex = orderIndexFromStableKey(stableKey);
    if (orderIndex === null) {
      problems.push(`dòng ${lineNo}: ID "${stableKey}" không theo dạng một chữ cái + số, ví dụ "S0601".`);
      return;
    }

    const fields: Record<string, string> = {};
    for (const key of ['text', 'meaning', 'transliteration', 'grammarNote'] as const) {
      const value = cell[key];
      if (value && declaredFields.has(key)) fields[key] = value;
    }

    const typeLabel = cell.sentenceType;
    if (typeLabel && declaredFields.has('sentenceType')) {
      fields.sentenceType = SENTENCE_TYPES[typeLabel.toLowerCase()] ?? typeLabel;
    }

    const { entries, malformed } = parseGlossary(cell.newWords ?? '', genderArticles);
    for (const bad of malformed) {
      problems.push(`dòng ${lineNo} (${stableKey}): mục từ mới "${bad}" thiếu dấu "=" theo dạng "từ = nghĩa".`);
    }

    items.push({
      stableKey,
      kind: course.primaryItemKind,
      level: (cell.level || course.levelFrom) as ContentItem['level'],
      topic: cell.topic || 'Chưa phân loại',
      orderIndex,
      fields,
      glossary: entries,
    });
  });

  if (problems.length > 0) {
    console.error(`\n✗ ${problems.length} vấn đề — chưa ghi file nào:`);
    for (const p of problems.slice(0, 30)) console.error(`  - ${p}`);
    if (problems.length > 30) console.error(`  ... và ${problems.length - 30} vấn đề nữa`);
    return 1;
  }
  if (items.length === 0) {
    console.error('\n✗ Không có dòng nào mang nội dung. Chưa ghi gì.');
    return 1;
  }

  items.sort((a, b) => a.orderIndex - b.orderIndex);

  const fileName = outName ?? `items.${items[0]!.stableKey}-${items.at(-1)!.stableKey}.json`;
  const outPath = join(location.dir, fileName);
  const payload = { courseId: course.id, schemaVersion: 1 as const, items };

  // Fail before writing if the result would not survive validation.
  const checked = itemsFileSchema.safeParse(payload);
  if (!checked.success) {
    console.error('\n✗ Kết quả không hợp lệ — chưa ghi file:');
    for (const issue of checked.error.issues.slice(0, 20)) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    return 1;
  }

  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`\n✓ Ghi ${rel(outPath)}`);
  console.log(`  Mục có nội dung  : ${items.length} (${items[0]!.stableKey} → ${items.at(-1)!.stableKey})`);
  if (skipped.length > 0) console.log(`  Bỏ qua dòng rỗng : ${skipped.length}`);
  console.log(`  Liên kết từ vựng : ${items.reduce((n, i) => n + i.glossary.length, 0)}`);
  console.log('\nBước tiếp: pnpm content:validate');
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
