import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, type TestDb } from './helpers/test-db.js';
import { importCourse, type SqlExecutor } from '../../src/core/content/import.js';
import { parseCourse, validateItemsFile } from '../../src/core/content/validate.js';
import { itemsFileSchema, type Course, type ContentItem } from '../../src/core/content/schema.js';
import { BENCHMARK_NEW_PER_DAY } from '../../src/config/app.config.js';

/**
 * Phase 1 acceptance test: import the real 1800-item German course into a real
 * Postgres and prove that running it twice changes nothing.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COURSE_DIR = join(ROOT, 'content', 'de', 'de-a1-b2');

let t: TestDb;
let sql: SqlExecutor;
let course: Course;
let items: ContentItem[];

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of ['courses', 'items', 'glossary_terms', 'item_glossary']) {
    const rows = await sql.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    out[table] = rows[0]!.n;
  }
  return out;
}

beforeAll(async () => {
  t = await createTestDb();
  sql = {
    query: async <T>(text: string, params?: unknown[]) =>
      (await t.db.query<Record<string, unknown>>(text, params)).rows as T[],
  };

  const parsed = parseCourse(loadJson(join(COURSE_DIR, 'course.json')));
  if (!('course' in parsed)) {
    throw new Error(`course.json không hợp lệ: ${JSON.stringify(parsed.issues)}`);
  }
  course = parsed.course;
  items = itemsFileSchema.parse(loadJson(join(COURSE_DIR, 'items.json'))).items;
}, 60_000);

afterAll(async () => {
  await t?.close();
});

describe('Dữ liệu tiếng Đức thật', () => {
  it('1800 mục trải đều bốn cấp độ, 90 chủ đề', () => {
    expect(items).toHaveLength(1800);
    const byLevel = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.level] = (acc[item.level] ?? 0) + 1;
      return acc;
    }, {});
    expect(byLevel).toEqual({ A1: 300, A2: 300, B1: 600, B2: 600 });
    expect(new Set(items.map((i) => i.topic)).size).toBe(90);

    // The benchmark the whole planner is built around: 1800 ÷ 20 = 90 days.
    expect(items.length / BENCHMARK_NEW_PER_DAY).toBe(90);
  });

  it('ID ổn định liên tục từ S0001 đến S1800, không trùng không hở', () => {
    expect(items[0]!.stableKey).toBe('S0001');
    expect(items.at(-1)!.stableKey).toBe('S1800');
    expect(items.map((i) => i.orderIndex)).toEqual(Array.from({ length: 1800 }, (_, i) => i + 1));
    expect(new Set(items.map((i) => i.stableKey)).size).toBe(1800);
  });

  it('giữ nguyên ký tự Đức, dấu tiếng Việt và ký hiệu IPA', () => {
    const umlauts = items.filter((i) => /[äöüßÄÖÜ]/.test(i.fields.text ?? ''));
    expect(umlauts.length).toBeGreaterThan(150);

    // Every sentence carries an IPA transcription in [brackets]; the characters
    // below are the ones a mangled encoding would be most likely to destroy.
    const translit = items.map((i) => i.fields.transliteration ?? '');
    expect(translit.filter((t) => t.length > 0)).toHaveLength(1800);
    expect(translit.every((t) => t.startsWith('[') && t.endsWith(']'))).toBe(true);
    expect(translit.filter((t) => /[ˈˌːʁəɛɔøyʏʊɪ]/.test(t)).length).toBe(1800);

    // Vietnamese diacritics must survive the whole pipeline unmangled.
    expect(items[0]!.fields.meaning).toBe('Chào buổi sáng!');
    expect(items[0]!.fields.transliteration).toBe('[ˈɡuːtən ˈmɔʁɡən]');
  });

  it('mọi câu đều có ít nhất một chú thích từ vựng', () => {
    // Three sentences shipped without one until their VOCAB rows were added;
    // the converter reported them rather than inventing the entries.
    const bare = items.filter((item) => item.glossary.length === 0);
    expect(bare.map((item) => item.stableKey)).toEqual([]);
  });

  it('không mục nào thiếu câu, nghĩa hay phiên âm', () => {
    const incomplete = items.filter(
      (i) =>
        (i.fields.text ?? '').trim() === '' ||
        (i.fields.meaning ?? '').trim() === '' ||
        (i.fields.transliteration ?? '').trim() === '',
    );
    expect(incomplete.map((i) => i.stableKey)).toEqual([]);
  });

  it('pass toàn bộ kiểm tra của content:validate', () => {
    const report = validateItemsFile(course, loadJson(join(COURSE_DIR, 'items.json')));
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.stats.itemCount).toBe(1800);
    expect(report.stats.glossaryLinks).toBe(2206);
    // Every declared level now has content, so nothing should be reported empty.
    expect(report.stats.emptyDeclaredLevels).toEqual([]);
  });
});

describe('content:import', () => {
  it('lần 1: đưa đúng 1800 mục và toàn bộ từ vựng vào DB', async () => {
    const result = await importCourse(sql, course, items);

    expect(result.itemsInserted).toBe(1800);
    expect(result.itemsUpdated).toBe(0);
    expect(result.glossaryLinks).toBe(2206);
    expect(result.orphanStableKeys).toEqual([]);

    expect(await counts()).toEqual({
      courses: 1,
      items: 1800,
      glossary_terms: result.glossaryTermsUpserted,
      item_glossary: 2206,
    });
  }, 180_000);

  it('lần 2: không sinh thêm một bản ghi nào (idempotent)', async () => {
    const before = await counts();
    const itemIdsBefore = await sql.query<{ id: string; stable_key: string }>(
      'select id, stable_key from items order by order_index',
    );

    const result = await importCourse(sql, course, items);

    expect(result.itemsInserted).toBe(0);
    expect(result.itemsUpdated).toBe(1800);
    expect(await counts()).toEqual(before);

    // The decisive check: item ids are unchanged, so learner progress survives.
    const itemIdsAfter = await sql.query<{ id: string; stable_key: string }>(
      'select id, stable_key from items order by order_index',
    );
    expect(itemIdsAfter).toEqual(itemIdsBefore);
  }, 120_000);

  it('tiến độ học của người dùng sống sót qua lần import lại', async () => {
    const user = await t.createUser('learner@example.com');
    const firstItem = (await sql.query<{ id: string }>('select id from items order by order_index limit 1'))[0]!;

    const enrollmentId = await t.asUser(user, async () => {
      const rows = await t.db.query<{ id: string }>(
        `insert into enrollments (user_id, course_id, level_from, level_to, start_date, target_date, new_per_day, buffer_days)
         values ($1, $2, 'A1', 'A2', '2026-10-05', '2026-11-04', 20, 10) returning id`,
        [user, course.id],
      );
      return rows.rows[0]!.id;
    });

    await t.asUser(user, async () => {
      await t.db.query(
        `insert into card_states (user_id, item_id, enrollment_id, due, stability, reps, state)
         values ($1, $2, $3, now(), 12.5, 3, 2)`,
        [user, firstItem.id, enrollmentId],
      );
    });

    await importCourse(sql, course, items);

    const card = await t.asUser(user, async () => {
      const rows = await t.db.query<{ stability: number; reps: number }>(
        'select stability, reps from card_states where item_id = $1',
        [firstItem.id],
      );
      return rows.rows[0];
    });
    expect(card).toMatchObject({ stability: 12.5, reps: 3 });
  }, 120_000);

  it('báo cáo mục bị xoá khỏi file nhưng KHÔNG tự xoá trong DB', async () => {
    const dropped = items.at(-1)!.stableKey;
    const result = await importCourse(sql, course, items.slice(0, -1));

    expect(result.orphanStableKeys).toEqual([dropped]);
    // Still in the database: deleting it would destroy anyone's progress on it.
    const remaining = await sql.query<{ n: number }>('select count(*)::int as n from items');
    expect(remaining[0]!.n).toBe(items.length);
  }, 180_000);

  it('bỏ qua field không khai báo trong course.json', async () => {
    const sneaky: ContentItem[] = [
      {
        ...items[0]!,
        fields: { ...items[0]!.fields, secretField: 'không được khai báo' },
      },
    ];
    await importCourse(sql, course, sneaky);

    const row = await sql.query<{ fields: Record<string, string> }>(
      'select fields from items where stable_key = $1',
      ['S0001'],
    );
    expect(row[0]!.fields).not.toHaveProperty('secretField');
    expect(row[0]!.fields.text).toBe('Guten Morgen!');
  }, 60_000);
});

describe('script import — đường transaction', () => {
  /**
   * Regression guard for a deadlock that the tests above cannot reach: they call
   * importCourse directly, so nothing exercised the script's transaction wrapper.
   *
   * The script runs the import inside `sql.begin` on a pool of one connection.
   * Issuing the statements on the outer pool handle instead of the transaction's
   * own waits for a connection that the transaction is holding — the import hung
   * silently forever — and would also place the writes outside the transaction,
   * so a mid-import failure could not roll back.
   */
  const source = readFileSync(
    join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'scripts', 'content-import.ts'),
    'utf8',
  );

  it('chạy câu lệnh trên handle của transaction, không trên pool bên ngoài', () => {
    const begin = /sql\.begin\(.*\);/.exec(source);
    expect(begin, 'không tìm thấy lời gọi sql.begin trong script').not.toBeNull();

    const call = begin![0];
    expect(call).toMatch(/\btx\b/);
    // `sql.unsafe` / `sql.query` inside the transaction is the deadlock.
    expect(call).not.toMatch(/\bsql\.(unsafe|query)\b/);
  });

  it('đặt statement_timeout để lỗi hiện ra thay vì treo im lặng', () => {
    expect(source).toMatch(/statement_timeout/);
    expect(source).toMatch(/connect_timeout/);
  });
});

describe('tham số jsonb', () => {
  /**
   * Regression guard for a bug the PGlite suite structurally cannot reproduce.
   *
   * PGlite parses a JSON string bound to a jsonb column into an object, so every
   * assertion here passed while the real import wrote a jsonb *string* into every
   * `fields` column: postgres.js JSON-encodes such a string a second time, and
   * `fields->>'text'` then returns null for every row. Every sentence rendered
   * blank in the app.
   *
   * The drivers only agree on objects, so the contract is checked at its source
   * — what importCourse binds — rather than at what one driver stores.
   */
  it('không truyền chuỗi JSON đã mã hoá sẵn vào cột jsonb', async () => {
    const seen: unknown[] = [];
    const spy: SqlExecutor = {
      query: async <T>(_text: string, params?: unknown[]) => {
        if (params) seen.push(...params);
        return [] as T[];
      },
    };

    await importCourse(spy, course, items.slice(0, 5));
    expect(seen.length).toBeGreaterThan(0);

    const preEncoded = seen.filter((value) => {
      if (typeof value !== 'string') return false;
      const text = value.trim();
      if (!text.startsWith('{') && !text.startsWith('[')) return false;
      try {
        return typeof JSON.parse(text) === 'object';
      } catch {
        return false;
      }
    });

    expect(preEncoded, 'phải truyền object thô, không phải JSON.stringify(...)').toEqual([]);
  });
});
