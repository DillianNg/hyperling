import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './helpers/test-db.js';

/**
 * Phase 1 acceptance test: prove that user A can neither read nor write user B's
 * data, on every table that holds learner data. These run the real migration
 * files against real Postgres (PGlite), so they test the deployed policies.
 */

let t: TestDb;
let alice: string;
let bob: string;
let itemId: string;
let aliceEnrollment: string;
let bobEnrollment: string;

/** Tables that must never leak across users, with how ownership is expressed. */
const LEARNER_TABLES = [
  'profiles',
  'enrollments',
  'daily_plans',
  'card_states',
  'review_logs',
  'study_sessions',
  'item_flags',
] as const;

beforeAll(async () => {
  t = await createTestDb();

  // Minimal course content, written as the service role (RLS bypassed), the way
  // the import script does it.
  await t.db.exec(`
    insert into public.courses (
      id, version, title, target_language, source_language,
      level_from, level_to, levels, primary_item_kind, field_schema
    ) values (
      'de-a1-b2', '1.0.0', '{"vi":"Thử"}'::jsonb, 'de', 'vi',
      'A1', 'B2', array['A1','A2','B1','B2'], 'sentence', '{"fields":[]}'::jsonb
    );
    insert into public.items (course_id, stable_key, kind, level_code, topic, order_index, fields)
    values ('de-a1-b2', 'S0001', 'sentence', 'A1', 'Chào hỏi', 1, '{"text":"Guten Morgen!"}'::jsonb);
  `);
  itemId = (await t.db.query<{ id: string }>('select id from public.items limit 1')).rows[0]!.id;

  alice = await t.createUser('alice@example.com');
  bob = await t.createUser('bob@example.com');

  // Each learner creates their own enrollment, as themselves.
  for (const [user, label] of [
    [alice, 'alice'],
    [bob, 'bob'],
  ] as const) {
    const id = await t.asUser(user, async () => {
      const r = await t.db.query<{ id: string }>(
        `insert into public.enrollments
           (user_id, course_id, level_from, level_to, start_date, target_date, new_per_day, buffer_days)
         values ($1, 'de-a1-b2', 'A1', 'A2', '2026-10-05', '2027-01-02', 20, 15)
         returning id`,
        [user],
      );
      return r.rows[0]!.id;
    });
    if (label === 'alice') aliceEnrollment = id;
    else bobEnrollment = id;
  }

  // Alice fills every learner table with one row.
  await t.asUser(alice, async () => {
    await t.db.query(
      `insert into public.daily_plans (enrollment_id, plan_date, day_index, planned_new)
       values ($1, '2026-10-05', 1, 20)`,
      [aliceEnrollment],
    );
    await t.db.query(
      `insert into public.card_states (user_id, item_id, enrollment_id, due, state)
       values ($1, $2, $3, now(), 2)`,
      [alice, itemId, aliceEnrollment],
    );
    await t.db.query(
      `insert into public.review_logs (user_id, item_id, enrollment_id, rating, state_before)
       values ($1, $2, $3, 3, 2)`,
      [alice, itemId, aliceEnrollment],
    );
    await t.db.query(
      `insert into public.study_sessions (user_id, enrollment_id, session_date)
       values ($1, $2, '2026-10-05')`,
      [alice, aliceEnrollment],
    );
    await t.db.query(
      `insert into public.item_flags (user_id, item_id, is_hard) values ($1, $2, true)`,
      [alice, itemId],
    );
  });
});

afterAll(async () => {
  await t?.close();
});

describe('RLS: học viên chỉ thấy dữ liệu của chính mình', () => {
  it('mỗi bảng dữ liệu người dùng đều đã bật RLS', async () => {
    const { rows } = await t.db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables
       where schemaname = 'public' order by tablename`,
    );
    const unprotected = rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
    expect(unprotected).toEqual([]);
  });

  it('Alice đọc được đúng dữ liệu của mình', async () => {
    const counts = await t.asUser(alice, async () => {
      const out: Record<string, number> = {};
      for (const table of LEARNER_TABLES) {
        const r = await t.db.query<{ n: number }>(`select count(*)::int as n from public.${table}`);
        out[table] = r.rows[0]!.n;
      }
      return out;
    });
    // One row each, plus the profile the auth trigger created.
    for (const table of LEARNER_TABLES) {
      expect(counts[table], `${table} của Alice`).toBe(1);
    }
  });

  it('Bob KHÔNG đọc được một dòng nào của Alice', async () => {
    const counts = await t.asUser(bob, async () => {
      const out: Record<string, number> = {};
      for (const table of LEARNER_TABLES) {
        const r = await t.db.query<{ n: number }>(`select count(*)::int as n from public.${table}`);
        out[table] = r.rows[0]!.n;
      }
      return out;
    });
    // Bob sees only his own profile and enrollment; everything Alice wrote is invisible.
    expect(counts.profiles).toBe(1);
    expect(counts.enrollments).toBe(1);
    expect(counts.daily_plans).toBe(0);
    expect(counts.card_states).toBe(0);
    expect(counts.review_logs).toBe(0);
    expect(counts.study_sessions).toBe(0);
    expect(counts.item_flags).toBe(0);
  });

  it('Bob KHÔNG sửa được dữ liệu của Alice', async () => {
    const affected = await t.asUser(bob, async () => ({
      profile: (await t.db.query(`update public.profiles set display_name = 'hacked'`)).affectedRows ?? 0,
      enrollment: (await t.db.query(`update public.enrollments set new_per_day = 1`)).affectedRows ?? 0,
      card: (await t.db.query(`update public.card_states set stability = 999`)).affectedRows ?? 0,
      plan: (await t.db.query(`update public.daily_plans set planned_new = 0`)).affectedRows ?? 0,
      flag: (await t.db.query(`update public.item_flags set is_hard = false`)).affectedRows ?? 0,
    }));
    // Bob's own profile and enrollment are his to change; Alice's rows are not reachable.
    expect(affected.profile).toBe(1);
    expect(affected.enrollment).toBe(1);
    expect(affected.card).toBe(0);
    expect(affected.plan).toBe(0);
    expect(affected.flag).toBe(0);

    const stability = await t.asUser(alice, async () => {
      const r = await t.db.query<{ stability: number }>(`select stability from public.card_states`);
      return r.rows[0]!.stability;
    });
    expect(stability).toBe(0);
  });

  it('Bob KHÔNG xoá được dữ liệu của Alice', async () => {
    const affected = await t.asUser(bob, async () => ({
      card: (await t.db.query(`delete from public.card_states`)).affectedRows ?? 0,
      plan: (await t.db.query(`delete from public.daily_plans`)).affectedRows ?? 0,
      flag: (await t.db.query(`delete from public.item_flags`)).affectedRows ?? 0,
    }));
    expect(affected).toEqual({ card: 0, plan: 0, flag: 0 });

    const stillThere = await t.asUser(alice, async () => {
      const r = await t.db.query<{ n: number }>(`select count(*)::int as n from public.card_states`);
      return r.rows[0]!.n;
    });
    expect(stillThere).toBe(1);
  });

  it('Bob KHÔNG ghi được dòng mang user_id của Alice', async () => {
    await expect(
      t.asUser(bob, () =>
        t.db.query(
          `insert into public.card_states (user_id, item_id, enrollment_id, due)
           values ($1, $2, $3, now())`,
          [alice, itemId, bobEnrollment],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);

    await expect(
      t.asUser(bob, () =>
        t.db.query(
          `insert into public.item_flags (user_id, item_id, is_hard) values ($1, $2, true)`,
          [alice, itemId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('Bob KHÔNG gắn được daily_plan vào enrollment của Alice', async () => {
    await expect(
      t.asUser(bob, () =>
        t.db.query(
          `insert into public.daily_plans (enrollment_id, plan_date, day_index, planned_new)
           values ($1, '2026-11-01', 28, 20)`,
          [aliceEnrollment],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('RLS: nhật ký ôn tập là append-only', () => {
  it('chủ sở hữu cũng không sửa hay xoá được review_logs của mình', async () => {
    await expect(
      t.asUser(alice, () => t.db.query(`update public.review_logs set rating = 4`)),
    ).rejects.toThrow(/row-level security|permission denied/i);

    await expect(
      t.asUser(alice, () => t.db.query(`delete from public.review_logs`)),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });
});

describe('RLS: nội dung khóa học đọc được, không ghi được', () => {
  it('người đã đăng nhập đọc được items và glossary', async () => {
    const n = await t.asUser(alice, async () => {
      const r = await t.db.query<{ n: number }>(`select count(*)::int as n from public.items`);
      return r.rows[0]!.n;
    });
    expect(n).toBe(1);
  });

  it('người đã đăng nhập KHÔNG ghi được vào items hay courses', async () => {
    await expect(
      t.asUser(alice, () =>
        t.db.query(
          `insert into public.items (course_id, stable_key, kind, level_code, topic, order_index, fields)
           values ('de-a1-b2', 'S9999', 'sentence', 'A1', 'x', 999, '{}'::jsonb)`,
        ),
      ),
    ).rejects.toThrow(/permission denied|row-level security/i);

    await expect(
      t.asUser(alice, () => t.db.query(`update public.items set topic = 'hacked'`)),
    ).rejects.toThrow(/permission denied|row-level security/i);

    await expect(
      t.asUser(alice, () => t.db.query(`delete from public.courses`)),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });
});

describe('RLS: khách chưa đăng nhập không thấy gì', () => {
  it('anon không đọc được nội dung khóa học lẫn dữ liệu người dùng', async () => {
    for (const table of ['items', 'courses', 'profiles', 'card_states']) {
      await expect(
        t.asAnon(() => t.db.query(`select count(*) from public.${table}`)),
        `anon đọc ${table}`,
      ).rejects.toThrow(/permission denied/i);
    }
  });
});

describe('Trigger tạo profile tự động', () => {
  it('user mới có profile ngay, không cần app gọi thêm', async () => {
    const carol = await t.createUser('carol@example.com');
    const profile = await t.asUser(carol, async () => {
      const r = await t.db.query<{ id: string; email: string; ui_locale: string; timezone: string }>(
        `select id, email, ui_locale, timezone from public.profiles`,
      );
      return r.rows[0];
    });
    expect(profile).toMatchObject({
      id: carol,
      email: 'carol@example.com',
      ui_locale: 'vi',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });
});

describe('Xoá lộ trình học — cascade và những gì cố ý sống sót', () => {
  /**
   * The reset in Settings deletes one enrollment and lets foreign keys do the
   * rest. These assert the blast radius is exactly what the confirmation dialog
   * promises: all plan state for that enrollment, nothing of anyone else's, and
   * neither the account nor the learner's own notes.
   */
  let dana: string;
  let danaEnrollment: string;

  beforeAll(async () => {
    dana = await t.createUser('dana@example.com');
    danaEnrollment = await t.asUser(dana, async () => {
      const r = await t.db.query<{ id: string }>(
        `insert into public.enrollments
           (user_id, course_id, level_from, level_to, start_date, target_date, new_per_day, buffer_days)
         values ($1, 'de-a1-b2', 'A1', 'A2', '2026-10-05', '2027-01-02', 20, 15)
         returning id`,
        [dana],
      );
      return r.rows[0]!.id;
    });

    await t.asUser(dana, async () => {
      await t.db.query(
        `insert into public.daily_plans (enrollment_id, plan_date, day_index, planned_new)
         values ($1, '2026-10-05', 1, 20)`,
        [danaEnrollment],
      );
      await t.db.query(
        `insert into public.card_states (user_id, item_id, enrollment_id, due, state)
         values ($1, $2, $3, now(), 2)`,
        [dana, itemId, danaEnrollment],
      );
      await t.db.query(
        `insert into public.review_logs (user_id, item_id, enrollment_id, rating, state_before)
         values ($1, $2, $3, 3, 2)`,
        [dana, itemId, danaEnrollment],
      );
      await t.db.query(
        `insert into public.study_sessions (user_id, enrollment_id, session_date)
         values ($1, $2, '2026-10-05')`,
        [dana, danaEnrollment],
      );
      await t.db.query(
        `insert into public.item_flags (user_id, item_id, is_hard, note)
         values ($1, $2, true, 'Câu này khó nhớ')`,
        [dana, itemId],
      );
    });
  });

  it('xoá enrollment cuốn theo toàn bộ trạng thái kế hoạch', async () => {
    await t.asUser(dana, async () => {
      await t.db.query('delete from public.enrollments where id = $1', [danaEnrollment]);
    });

    for (const table of ['enrollments', 'daily_plans', 'card_states', 'review_logs', 'study_sessions']) {
      const left = await t.db.query<{ n: number }>(
        `select count(*)::int as n from public.${table}
          where ${table === 'daily_plans' ? 'enrollment_id' : 'user_id'} = $1`,
        [table === 'daily_plans' ? danaEnrollment : dana],
      );
      expect(left.rows[0]!.n, `${table} còn sót dòng`).toBe(0);
    }
  });

  it('cascade xoá được review_logs dù bảng này không có policy DELETE', async () => {
    // Append-only is enforced for the owner's own statements. A cascade runs as
    // the table owner, so discarding a whole course does take its log with it —
    // the one path by which those rows can ever disappear.
    const policies = await t.db.query<{ n: number }>(
      `select count(*)::int as n from pg_policies
        where tablename = 'review_logs' and cmd = 'DELETE'`,
    );
    expect(policies.rows[0]!.n).toBe(0);
  });

  it('KHÔNG đụng tới ghi chú của người học — đó là chữ họ tự viết', async () => {
    const flags = await t.db.query<{ note: string | null }>(
      'select note from public.item_flags where user_id = $1',
      [dana],
    );
    expect(flags.rows).toHaveLength(1);
    expect(flags.rows[0]!.note).toBe('Câu này khó nhớ');
  });

  it('KHÔNG đụng tới tài khoản — người học vẫn đăng nhập được', async () => {
    const profile = await t.db.query<{ n: number }>(
      'select count(*)::int as n from public.profiles where id = $1',
      [dana],
    );
    expect(profile.rows[0]!.n).toBe(1);
  });

  it('KHÔNG đụng tới nội dung khóa học lẫn dữ liệu người khác', async () => {
    const items = await t.db.query<{ n: number }>('select count(*)::int as n from public.items');
    expect(items.rows[0]!.n).toBe(1);

    const others = await t.db.query<{ n: number }>(
      'select count(*)::int as n from public.enrollments where user_id in ($1, $2)',
      [alice, bob],
    );
    expect(others.rows[0]!.n).toBe(2);
  });
});
