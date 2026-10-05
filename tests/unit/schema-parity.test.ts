import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { createTestDb, type TestDb } from './helpers/test-db.js';
import * as schema from '../../src/lib/db/schema.js';

/**
 * The SQL migrations are authoritative and the Drizzle schema mirrors them for
 * typed queries. Two sources of truth drift silently, so this test compares the
 * Drizzle definitions against the columns the real migrations actually created.
 */

let t: TestDb;

interface DbColumn {
  table_name: string;
  column_name: string;
  is_nullable: 'YES' | 'NO';
  data_type: string;
}

let dbColumns: DbColumn[];

const DRIZZLE_TABLES = [
  schema.languages,
  schema.levels,
  schema.courses,
  schema.items,
  schema.glossaryTerms,
  schema.itemGlossary,
  schema.profiles,
  schema.enrollments,
  schema.dailyPlans,
  schema.cardStates,
  schema.reviewLogs,
  schema.studySessions,
  schema.itemFlags,
];

beforeAll(async () => {
  t = await createTestDb();
  const result = await t.db.query<DbColumn>(
    `select table_name, column_name, is_nullable, data_type
       from information_schema.columns
      where table_schema = 'public'
      order by table_name, column_name`,
  );
  dbColumns = result.rows;
}, 60_000);

afterAll(async () => {
  await t?.close();
});

describe('Drizzle schema khớp migration SQL', () => {
  it('số bảng khớp nhau', () => {
    const dbTables = [...new Set(dbColumns.map((c) => c.table_name))].sort();
    const drizzleTables = DRIZZLE_TABLES.map((table) => getTableConfig(table).name).sort();
    expect(drizzleTables).toEqual(dbTables);
  });

  it('mỗi bảng có đúng các cột như trong migration', () => {
    const mismatches: string[] = [];

    for (const table of DRIZZLE_TABLES) {
      const config = getTableConfig(table);
      const expected = config.columns.map((c) => c.name).sort();
      const actual = dbColumns
        .filter((c) => c.table_name === config.name)
        .map((c) => c.column_name)
        .sort();

      const missingInDb = expected.filter((c) => !actual.includes(c));
      const missingInDrizzle = actual.filter((c) => !expected.includes(c));

      if (missingInDb.length > 0) {
        mismatches.push(`${config.name}: Drizzle khai báo nhưng DB không có: ${missingInDb.join(', ')}`);
      }
      if (missingInDrizzle.length > 0) {
        mismatches.push(`${config.name}: DB có nhưng Drizzle thiếu: ${missingInDrizzle.join(', ')}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('cột NOT NULL khớp hai bên', () => {
    const mismatches: string[] = [];

    for (const table of DRIZZLE_TABLES) {
      const config = getTableConfig(table);
      for (const column of config.columns) {
        const dbColumn = dbColumns.find((c) => c.table_name === config.name && c.column_name === column.name);
        if (!dbColumn) continue;
        const dbNotNull = dbColumn.is_nullable === 'NO';
        if (column.notNull !== dbNotNull) {
          mismatches.push(
            `${config.name}.${column.name}: Drizzle notNull=${column.notNull}, DB notNull=${dbNotNull}`,
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});

describe('Index phục vụ truy vấn "thẻ đến hạn hôm nay"', () => {
  it('card_states có index partial trên (user_id, enrollment_id, due)', async () => {
    const { rows } = await t.db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where tablename = 'card_states' and indexname = 'card_states_due_idx'`,
    );
    expect(rows).toHaveLength(1);
    const def = rows[0]!.indexdef;
    expect(def).toContain('user_id');
    expect(def).toContain('enrollment_id');
    expect(def).toContain('due');
    // Partial: New cards are driven by the plan, not by a due date.
    expect(def).toMatch(/where \(state <> 0\)/i);
  });

  it('truy vấn thẻ đến hạn dùng index, không quét toàn bảng', async () => {
    const user = await t.createUser('planner@example.com');
    await t.db.exec(`
      insert into courses (id, version, title, target_language, source_language,
        level_from, level_to, levels, primary_item_kind, field_schema)
      values ('t', '1.0.0', '{}'::jsonb, 'de', 'vi', 'A1', 'A2', array['A1'], 'sentence', '{}'::jsonb);
    `);
    // Enough rows that the planner would prefer an index over a sequential scan.
    await t.db.query(
      `insert into items (course_id, stable_key, kind, level_code, topic, order_index, fields)
       select 't', 'S' || lpad(g::text, 4, '0'), 'sentence', 'A1', 'x', g, '{}'::jsonb
         from generate_series(1, 2000) g`,
    );
    const enrollment = await t.db.query<{ id: string }>(
      `insert into enrollments (user_id, course_id, level_from, level_to, start_date, target_date, new_per_day, buffer_days)
       values ($1, 't', 'A1', 'A2', '2026-10-05', '2026-12-05', 20, 15) returning id`,
      [user],
    );
    const enrollmentId = enrollment.rows[0]!.id;
    await t.db.query(
      `insert into card_states (user_id, item_id, enrollment_id, due, state)
       select $1, id, $2, now() + (order_index || ' days')::interval, 2 from items`,
      [user, enrollmentId],
    );
    await t.db.exec('analyze card_states;');

    const plan = await t.db.query<{ 'QUERY PLAN': string }>(
      `explain select item_id from card_states
        where user_id = $1 and enrollment_id = $2 and due <= now() and state <> 0`,
      [user, enrollmentId],
    );
    const text = plan.rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(text).toMatch(/card_states_due_idx/);
  }, 60_000);
});
