import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, type TestDb } from './helpers/test-db.js';
import { importCourse, type SqlExecutor } from '../../src/core/content/import.js';
import { parseCourse } from '../../src/core/content/validate.js';
import { itemsFileSchema, type Course } from '../../src/core/content/schema.js';
import { createScheduler, ratingToNumber } from '../../src/core/scheduler/fsrs.js';
import { CARD_STATE_TO_DB, type SchedulerCard } from '../../src/core/scheduler/types.js';
import { buildSession } from '../../src/core/session/build-session.js';
import { computePlan } from '../../src/core/planner/plan.js';
import { countItemsForGoal, levelsToStudy } from '../../src/core/planner/levels.js';
import { toCalendarDate } from '../../src/core/planner/calendar.js';
import type { FsrsRatingName } from '../../src/config/app.config.js';

/**
 * Phase 2 acceptance test: a whole study session against real Postgres, run
 * twice over by two different learners.
 *
 * This exercises the same scheduler, planner and session builder the app uses,
 * writing to the same tables with the same RLS in force — the only thing left
 * out is the React layer.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COURSE_DIR = join(ROOT, 'content', 'de', 'de-a1-b2');

const START = toCalendarDate('2026-10-05');
const scheduler = createScheduler();

let t: TestDb;
let sql: SqlExecutor;
let course: Course;
let itemCountByLevel: Record<string, number>;

interface Learner {
  userId: string;
  enrollmentId: string;
}

async function enrol(email: string, newPerDay: number, targetDate: string): Promise<Learner> {
  const userId = await t.createUser(email);
  const enrollmentId = await t.asUser(userId, async () => {
    const result = await t.db.query<{ id: string }>(
      `insert into enrollments
         (user_id, course_id, level_from, level_to, start_date, target_date, new_per_day, buffer_days, timezone)
       values ($1, 'de-a1-b2', 'A0', 'A2', $2, $3, $4, 15, 'Asia/Ho_Chi_Minh')
       returning id`,
      [userId, START, targetDate, newPerDay],
    );
    return result.rows[0]!.id;
  });
  return { userId, enrollmentId };
}

/** One review, exactly as submitReview does it: reschedule, log, never mutate the log. */
async function review(
  learner: Learner,
  itemId: string,
  rating: FsrsRatingName,
  now: Date,
): Promise<SchedulerCard> {
  return t.asUser(learner.userId, async () => {
    const existing = await t.db.query<{
      due: string;
      stability: number;
      difficulty: number;
      elapsed_days: number;
      scheduled_days: number;
      learning_steps: number;
      reps: number;
      lapses: number;
      state: number;
      last_review: string | null;
    }>(
      `select due, stability, difficulty, elapsed_days, scheduled_days, learning_steps,
              reps, lapses, state, last_review
         from card_states where user_id = $1 and item_id = $2`,
      [learner.userId, itemId],
    );

    const previous = existing.rows[0];
    const card: SchedulerCard = previous
      ? {
          due: new Date(previous.due),
          stability: previous.stability,
          difficulty: previous.difficulty,
          elapsedDays: previous.elapsed_days,
          scheduledDays: previous.scheduled_days,
          learningSteps: previous.learning_steps,
          reps: previous.reps,
          lapses: previous.lapses,
          state: (['new', 'learning', 'review', 'relearning'] as const)[previous.state]!,
          lastReview: previous.last_review ? new Date(previous.last_review) : null,
        }
      : scheduler.createCard(now);

    const { card: next, snapshotBefore } = scheduler.review(card, rating, now);

    await t.db.query(
      `insert into card_states
         (user_id, item_id, enrollment_id, due, stability, difficulty, elapsed_days,
          scheduled_days, learning_steps, reps, lapses, state, last_review)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (user_id, item_id) do update set
         due = excluded.due, stability = excluded.stability, difficulty = excluded.difficulty,
         elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days,
         learning_steps = excluded.learning_steps, reps = excluded.reps,
         lapses = excluded.lapses, state = excluded.state, last_review = excluded.last_review`,
      [
        learner.userId,
        itemId,
        learner.enrollmentId,
        next.due.toISOString(),
        next.stability,
        next.difficulty,
        next.elapsedDays,
        next.scheduledDays,
        next.learningSteps,
        next.reps,
        next.lapses,
        CARD_STATE_TO_DB[next.state],
        now.toISOString(),
      ],
    );

    await t.db.query(
      `insert into review_logs
         (user_id, item_id, enrollment_id, rating, exercise_kind, is_correct, state_before,
          stability_before, difficulty_before, due_before)
       values ($1,$2,$3,$4,'mcq',$5,$6,$7,$8,$9)`,
      [
        learner.userId,
        itemId,
        learner.enrollmentId,
        ratingToNumber(rating),
        rating !== 'again',
        CARD_STATE_TO_DB[snapshotBefore.state],
        snapshotBefore.stability,
        snapshotBefore.difficulty,
        snapshotBefore.due.toISOString(),
      ],
    );

    return next;
  });
}

async function unseenItemIds(learner: Learner, limit: number): Promise<string[]> {
  return t.asUser(learner.userId, async () => {
    const result = await t.db.query<{ id: string }>(
      `select i.id from items i
        where i.course_id = 'de-a1-b2'
          and i.level_code = any($2)
          and not exists (
            select 1 from card_states c where c.user_id = $1 and c.item_id = i.id
          )
        order by i.order_index
        limit $3`,
      [learner.userId, levelsToStudy('A0', 'A2'), limit],
    );
    return result.rows.map((r) => r.id);
  });
}

beforeAll(async () => {
  t = await createTestDb();
  sql = {
    query: async <T>(text: string, params?: unknown[]) =>
      (await t.db.query<Record<string, unknown>>(text, params)).rows as T[],
  };

  const parsed = parseCourse(JSON.parse(readFileSync(join(COURSE_DIR, 'course.json'), 'utf8')));
  if (!('course' in parsed)) throw new Error('course.json không hợp lệ');
  course = parsed.course;

  const items = itemsFileSchema.parse(
    JSON.parse(readFileSync(join(COURSE_DIR, 'items.json'), 'utf8')),
  ).items;

  await importCourse(sql, course, items);

  itemCountByLevel = {};
  for (const item of items) {
    itemCountByLevel[item.level] = (itemCountByLevel[item.level] ?? 0) + 1;
  }
}, 120_000);

afterAll(async () => {
  await t?.close();
});

describe('kế hoạch dựa trên dữ liệu thật trong DB', () => {
  it('A0 → A2 lấy đúng 600 câu hiện có', () => {
    expect(countItemsForGoal({ currentLevel: 'A0', goalLevel: 'A2', itemCountByLevel })).toBe(600);
  });

  it('A0 → A1 chỉ lấy 300 câu của cấp A1', () => {
    expect(countItemsForGoal({ currentLevel: 'A0', goalLevel: 'A1', itemCountByLevel })).toBe(300);
  });

  it('600 câu trong 30 ngày cho đúng 20 câu/ngày — nhịp chuẩn của phương pháp', () => {
    const outcome = computePlan({
      totalItems: 600,
      startDate: START,
      targetDate: toCalendarDate('2026-11-03'),
      restWeekdays: [],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.plan.newPerDay).toBe(20);
  });

  it('600 câu trong 20 ngày bị chặn, kèm ngày khả thi sớm nhất', () => {
    const outcome = computePlan({
      totalItems: 600,
      startDate: START,
      targetDate: toCalendarDate('2026-10-24'),
      restWeekdays: [],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.blocked.reason).toBe('timeframe-too-short');
      expect(outcome.blocked.earliestFeasibleTarget).toBe('2026-11-03');
    }
  });
});

describe('một phiên học trọn vẹn', () => {
  it('học 20 câu mới, mỗi câu ghi đúng một card_state và một review_log', async () => {
    const learner = await enrol('an@example.com', 20, '2026-11-03');
    const newItems = await unseenItemIds(learner, 20);
    expect(newItems).toHaveLength(20);

    const plan = buildSession({
      dueCards: [],
      unseenItems: newItems.map((id, index) => ({
        itemId: id,
        stableKey: `S${String(index + 1).padStart(4, '0')}`,
        orderIndex: index + 1,
      })),
      plannedNew: 20,
      completedNewToday: 0,
      stageFlags: { review: true, learn: true, consolidate: true },
    });

    expect(plan.learn).toHaveLength(20);
    expect(plan.consolidate).toHaveLength(20);
    expect(plan.totalSteps).toBe(40);

    const now = new Date('2026-10-05T09:00:00Z');
    for (const itemId of newItems) {
      await review(learner, itemId, 'good', now);
    }

    const counts = await t.asUser(learner.userId, async () => {
      const cards = await t.db.query<{ n: number }>(
        'select count(*)::int as n from card_states where enrollment_id = $1',
        [learner.enrollmentId],
      );
      const logs = await t.db.query<{ n: number }>(
        'select count(*)::int as n from review_logs where enrollment_id = $1',
        [learner.enrollmentId],
      );
      return { cards: cards.rows[0]!.n, logs: logs.rows[0]!.n };
    });

    expect(counts).toEqual({ cards: 20, logs: 20 });
  }, 120_000);

  it('hôm sau những câu đó đã đến hạn ôn, không phải học lại từ đầu', async () => {
    const learner = await enrol('binh@example.com', 20, '2026-11-03');
    const newItems = await unseenItemIds(learner, 5);

    let now = new Date('2026-10-05T09:00:00Z');
    for (const itemId of newItems) {
      // Two "good" ratings graduate a card out of learning steps into review.
      await review(learner, itemId, 'good', now);
      await review(learner, itemId, 'good', new Date(now.getTime() + 10 * 60_000));
    }

    // The app offers everything due by the end of the learner's day, so a card
    // due at 09:10 is available during that evening's session.
    now = new Date('2026-10-07T17:00:00Z');
    const due = await t.asUser(learner.userId, async () => {
      const result = await t.db.query<{ n: number }>(
        `select count(*)::int as n from card_states
          where enrollment_id = $1 and state <> 0 and due <= $2`,
        [learner.enrollmentId, now.toISOString()],
      );
      return result.rows[0]!.n;
    });

    expect(due).toBe(5);

    // And they are no longer offered as new items.
    const stillUnseen = await unseenItemIds(learner, 100);
    expect(stillUnseen.some((id) => newItems.includes(id))).toBe(false);
  }, 120_000);

  it('"Chưa nhớ" làm câu quay lại sớm và tăng số lần quên', async () => {
    const learner = await enrol('cuong@example.com', 20, '2026-11-03');
    const [itemId] = await unseenItemIds(learner, 1);

    const now = new Date('2026-10-05T09:00:00Z');
    await review(learner, itemId!, 'good', now);
    await review(learner, itemId!, 'good', new Date(now.getTime() + 10 * 60_000));
    const beforeLapse = await review(learner, itemId!, 'good', new Date('2026-10-07T09:00:00Z'));
    expect(beforeLapse.state).toBe('review');

    const afterLapse = await review(learner, itemId!, 'again', beforeLapse.due);
    expect(afterLapse.state).toBe('relearning');
    expect(afterLapse.lapses).toBe(1);
    expect(afterLapse.due.getTime() - beforeLapse.due.getTime()).toBeLessThan(60 * 60 * 1000);
  }, 120_000);
});

describe('hai tài khoản có tiến độ hoàn toàn độc lập', () => {
  it('cùng một câu, hai người có trạng thái thẻ riêng', async () => {
    const an = await enrol('doc-lap-a@example.com', 20, '2026-11-03');
    const binh = await enrol('doc-lap-b@example.com', 10, '2026-12-13');

    const [sharedItem] = await unseenItemIds(an, 1);
    expect(sharedItem).toBeDefined();

    const now = new Date('2026-10-05T09:00:00Z');
    // An knows it; Binh does not.
    const anCard = await review(an, sharedItem!, 'easy', now);
    const binhCard = await review(binh, sharedItem!, 'again', now);

    expect(anCard.due.getTime()).toBeGreaterThan(binhCard.due.getTime());
    expect(anCard.lapses).toBe(0);

    // Each sees exactly one card — their own.
    const anView = await t.asUser(an.userId, async () => {
      const r = await t.db.query<{ n: number; due: string }>(
        'select count(*)::int as n, min(due) as due from card_states',
      );
      return r.rows[0]!;
    });
    const binhView = await t.asUser(binh.userId, async () => {
      const r = await t.db.query<{ n: number; due: string }>(
        'select count(*)::int as n, min(due) as due from card_states',
      );
      return r.rows[0]!;
    });

    expect(anView.n).toBe(1);
    expect(binhView.n).toBe(1);
    expect(anView.due).not.toBe(binhView.due);
  }, 120_000);

  it('hai người cùng khóa với khung thời gian khác nhau có nhịp khác nhau', async () => {
    const fast = computePlan({
      totalItems: 600,
      startDate: START,
      targetDate: toCalendarDate('2026-11-03'), // 30 ngày
      restWeekdays: [],
    });
    const slow = computePlan({
      totalItems: 600,
      startDate: START,
      targetDate: toCalendarDate('2027-01-02'), // 90 ngày
      restWeekdays: [],
    });

    expect(fast.ok && slow.ok).toBe(true);
    if (fast.ok && slow.ok) {
      expect(fast.plan.newPerDay).toBe(20);
      expect(slow.plan.newPerDay).toBe(7);
    }
  });

  it('tiến độ của người này không xuất hiện trong thống kê của người kia', async () => {
    const an = await enrol('thong-ke-a@example.com', 20, '2026-11-03');
    const binh = await enrol('thong-ke-b@example.com', 20, '2026-11-03');

    const anItems = await unseenItemIds(an, 12);
    const now = new Date('2026-10-05T09:00:00Z');
    for (const itemId of anItems) await review(an, itemId, 'good', now);

    const binhItems = await unseenItemIds(binh, 3);
    for (const itemId of binhItems) await review(binh, itemId, 'good', now);

    const count = async (learner: Learner) =>
      t.asUser(learner.userId, async () => {
        const r = await t.db.query<{ n: number }>(
          'select count(*)::int as n from review_logs where enrollment_id = $1',
          [learner.enrollmentId],
        );
        return r.rows[0]!.n;
      });

    expect(await count(an)).toBe(12);
    expect(await count(binh)).toBe(3);
  }, 120_000);
});

describe('ghi nhận hoạt động theo ngày', () => {
  it('daily_plans cộng dồn đúng số câu mới và lượt ôn', async () => {
    const learner = await enrol('nhat-ky@example.com', 20, '2026-11-03');
    const items = await unseenItemIds(learner, 4);
    const now = new Date('2026-10-05T09:00:00Z');

    await t.asUser(learner.userId, async () => {
      await t.db.query(
        `insert into daily_plans (enrollment_id, plan_date, day_index, planned_new, completed_new, completed_reviews)
         values ($1, '2026-10-05', 1, 20, 0, 0)`,
        [learner.enrollmentId],
      );
    });

    for (const itemId of items) await review(learner, itemId, 'good', now);

    await t.asUser(learner.userId, async () => {
      await t.db.query(
        `update daily_plans set completed_new = $2 where enrollment_id = $1 and plan_date = '2026-10-05'`,
        [learner.enrollmentId, items.length],
      );
    });

    const row = await t.asUser(learner.userId, async () => {
      const r = await t.db.query<{ completed_new: number; planned_new: number }>(
        `select completed_new, planned_new from daily_plans where enrollment_id = $1`,
        [learner.enrollmentId],
      );
      return r.rows[0]!;
    });

    expect(row).toEqual({ completed_new: 4, planned_new: 20 });
  }, 120_000);
});
