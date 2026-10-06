import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, type TestDb } from './helpers/test-db.js';
import { importCourse, type SqlExecutor } from '../../src/core/content/import.js';
import { parseCourse, validateItemsFile } from '../../src/core/content/validate.js';
import { itemsFileSchema, type Course } from '../../src/core/content/schema.js';
import { buildExercise, pickExerciseKind } from '../../src/core/session/exercises.js';
import { computePlan } from '../../src/core/planner/plan.js';
import { toCalendarDate } from '../../src/core/planner/calendar.js';

/**
 * Phase 3 acceptance test: the French course runs through the same engine as the
 * German one, having been added with content files alone.
 *
 * This is the test that keeps "content is data, code is the engine" honest. If
 * someone ever adds a German-specific branch to the core, something here breaks.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadCourse(dir: string): { course: Course; itemsRaw: unknown } {
  const parsed = parseCourse(JSON.parse(readFileSync(join(dir, 'course.json'), 'utf8')));
  if (!('course' in parsed)) {
    throw new Error(`course.json không hợp lệ: ${JSON.stringify(parsed.issues)}`);
  }
  return {
    course: parsed.course,
    itemsRaw: JSON.parse(readFileSync(join(dir, 'items.json'), 'utf8')),
  };
}

const GERMAN = loadCourse(join(ROOT, 'content', 'de', 'de-a1-b2'));
const FRENCH = loadCourse(join(ROOT, 'content', 'fr', 'fr-a1-b2'));

let t: TestDb;
let sql: SqlExecutor;

beforeAll(async () => {
  t = await createTestDb();
  sql = {
    query: async <T>(text: string, params?: unknown[]) =>
      (await t.db.query<Record<string, unknown>>(text, params)).rows as T[],
  };
  await t.db.exec(`
    insert into public.languages (code, name_native, name_vi, name_en, tts_lang)
    values ('fr', 'Français', 'Tiếng Pháp', 'French', 'fr-FR')
    on conflict (code) do nothing;
  `);
}, 120_000);

afterAll(async () => {
  await t?.close();
});

describe('khóa tiếng Pháp — thêm ngôn ngữ chỉ bằng file nội dung', () => {
  it('hợp lệ theo đúng schema mà khóa tiếng Đức dùng', () => {
    const report = validateItemsFile(FRENCH.course, FRENCH.itemsRaw);
    expect(report.errorCount).toBe(0);
    expect(report.stats.itemCount).toBe(20);
  });

  it('khai báo mạo từ của riêng nó, không mượn của tiếng Đức', () => {
    const gender = FRENCH.course.glossaryFields.find((f) => f.key === 'gender');
    expect(gender?.enum).toEqual(['le', 'la', "l'", 'les']);

    const germanGender = GERMAN.course.glossaryFields.find((f) => f.key === 'gender');
    expect(germanGender?.enum).toEqual(['der', 'die', 'das']);
  });

  it('giống danh từ tiếng Pháp được nhận đúng trong nội dung đã sinh', () => {
    const items = itemsFileSchema.parse(FRENCH.itemsRaw).items;
    const nouns = items.flatMap((item) => item.glossary).filter((g) => g.fields.gender);

    expect(nouns.length).toBeGreaterThan(0);
    for (const noun of nouns) {
      expect(["le", "la", "l'", 'les']).toContain(noun.fields.gender);
      expect(noun.partOfSpeech).toBe('noun');
    }
  });

  it('giữ nguyên dấu tiếng Pháp và tiếng Việt', () => {
    const items = itemsFileSchema.parse(FRENCH.itemsRaw).items;
    const text = items.map((i) => i.fields.text).join(' ');
    expect(text).toMatch(/[àâçéèêëîïôùûü]/);
    expect(items[0]!.fields.meaning).toContain('Xin chào');
  });

  it('import vào cùng một schema, cạnh khóa tiếng Đức', async () => {
    await importCourse(sql, GERMAN.course, itemsFileSchema.parse(GERMAN.itemsRaw).items);
    const result = await importCourse(sql, FRENCH.course, itemsFileSchema.parse(FRENCH.itemsRaw).items);

    expect(result.itemsInserted).toBe(20);

    const counts = await sql.query<{ course_id: string; n: number }>(
      'select course_id, count(*)::int as n from items group by course_id order by course_id',
    );
    expect(counts).toEqual([
      { course_id: 'de-a1-b2', n: 1800 },
      { course_id: 'fr-a1-b2', n: 20 },
    ]);
  }, 120_000);

  it('hai khóa không trộn nội dung dù dùng chung dãy stableKey', async () => {
    // Both courses number their items from S0001; the course id keeps them apart.
    const shared = await sql.query<{ course_id: string; stable_key: string }>(
      `select course_id, stable_key from items where stable_key = 'S0001' order by course_id`,
    );
    expect(shared).toHaveLength(2);

    const french = await sql.query<{ fields: Record<string, string> }>(
      `select fields from items where course_id = 'fr-a1-b2' and stable_key = 'S0001'`,
    );
    expect(french[0]!.fields.text).toBe('Bonjour !');

    const german = await sql.query<{ fields: Record<string, string> }>(
      `select fields from items where course_id = 'de-a1-b2' and stable_key = 'S0001'`,
    );
    expect(german[0]!.fields.text).toBe('Guten Morgen!');
  }, 60_000);

  it('sinh được bài kiểm tra bằng đúng engine dùng cho tiếng Đức', () => {
    const items = itemsFileSchema.parse(FRENCH.itemsRaw).items;
    const pool = items.map((item) => ({
      itemId: item.stableKey,
      stableKey: item.stableKey,
      prompt: item.fields.text ?? '',
      answer: item.fields.meaning ?? '',
    }));

    const kind = pickExerciseKind({ itemId: 'fr-1', reps: 0, isConsolidation: false });
    const exercise = buildExercise(kind, pool[2]!, pool);

    expect(exercise.kind).toBe('mcq');
    if (exercise.kind === 'mcq') {
      expect(exercise.question).toBe('Comment allez-vous ?');
      expect(exercise.options).toContain('Ông/bà có khỏe không?');
    }
  });

  it('planner xử lý khóa nhỏ như khóa lớn, không cần cấu hình riêng', () => {
    const outcome = computePlan({
      totalItems: 20,
      startDate: toCalendarDate('2026-10-05'),
      targetDate: toCalendarDate('2026-10-14'),
      restWeekdays: [],
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.plan.newPerDay).toBe(2);
      expect(outcome.plan.days.reduce((sum, day) => sum + day.plannedNew, 0)).toBe(20);
    }
  });
});

describe('engine không chứa nhánh riêng cho ngôn ngữ nào', () => {
  it('cả hai khóa dùng chung bộ field, chỉ khác giá trị khai báo', () => {
    const keys = (course: Course) => course.fields.map((f) => f.key).sort();
    expect(keys(FRENCH.course)).toEqual(keys(GERMAN.course));
  });

  it('tts lấy từ khai báo của khóa, không suy từ tên ngôn ngữ', () => {
    expect(GERMAN.course.tts?.lang).toBe('de-DE');
    expect(FRENCH.course.tts?.lang).toBe('fr-FR');
  });
});
