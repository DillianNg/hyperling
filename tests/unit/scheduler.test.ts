import { describe, expect, it } from 'vitest';
import { createScheduler, numberToRating, ratingToNumber } from '../../src/core/scheduler/fsrs.js';
import {
  CARD_STATE_TO_DB,
  DB_TO_CARD_STATE,
  describeInterval,
  type SchedulerCard,
} from '../../src/core/scheduler/types.js';

const NOW = new Date('2026-10-05T10:00:00Z');
const scheduler = createScheduler();

function studyThrough(ratings: Array<'again' | 'hard' | 'good' | 'easy'>): SchedulerCard {
  let card = scheduler.createCard(NOW);
  let at = NOW;
  for (const rating of ratings) {
    const result = scheduler.review(card, rating, at);
    card = result.card;
    at = card.due;
  }
  return card;
}

describe('thẻ mới', () => {
  it('bắt đầu ở trạng thái new, đến hạn ngay', () => {
    const card = scheduler.createCard(NOW);
    expect(card.state).toBe('new');
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.lastReview).toBeNull();
    expect(card.due.getTime()).toBe(NOW.getTime());
  });
});

describe('bốn mức tự đánh giá', () => {
  it('đánh giá càng tốt thì khoảng ôn càng xa', () => {
    const card = studyThrough(['good', 'good']); // đưa thẻ vào trạng thái review
    const preview = scheduler.preview(card, card.due);

    expect(preview.again.due.getTime()).toBeLessThan(preview.hard.due.getTime());
    expect(preview.hard.due.getTime()).toBeLessThan(preview.good.due.getTime());
    expect(preview.good.due.getTime()).toBeLessThan(preview.easy.due.getTime());
  });

  it('xem trước không làm thay đổi thẻ', () => {
    const card = studyThrough(['good']);
    const before = structuredClone(card);
    scheduler.preview(card, card.due);
    expect(card).toEqual(before);
  });

  it('"good" nhiều lần liên tiếp làm khoảng ôn giãn dần', () => {
    let card = scheduler.createCard(NOW);
    let at = NOW;
    const intervals: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      const result = scheduler.review(card, 'good', at);
      card = result.card;
      intervals.push(card.due.getTime() - at.getTime());
      at = card.due;
    }

    // Đây chính là cơ chế mà file Excel mô phỏng bằng 1/3/7/16/35 ngày cố định,
    // nhưng ở đây khoảng cách do chính thẻ đó quyết định.
    for (let i = 2; i < intervals.length; i += 1) {
      expect(intervals[i]!).toBeGreaterThan(intervals[i - 1]!);
    }
    expect(card.state).toBe('review');
    expect(card.reps).toBe(5);
  });

  it('"again" trên thẻ đã thuộc đưa về relearning và tăng lapses', () => {
    const mature = studyThrough(['good', 'good', 'good', 'good']);
    expect(mature.state).toBe('review');
    expect(mature.lapses).toBe(0);

    const result = scheduler.review(mature, 'again', mature.due);
    expect(result.card.state).toBe('relearning');
    expect(result.card.lapses).toBe(1);
    // Và quay lại rất sớm, tính bằng phút chứ không phải ngày.
    expect(result.card.due.getTime() - mature.due.getTime()).toBeLessThan(60 * 60 * 1000);
  });

  it('thẻ hay quên có stability thấp hơn thẻ nhớ chắc', () => {
    const solid = studyThrough(['good', 'good', 'good']);
    const shaky = studyThrough(['again', 'good', 'again', 'good']);
    expect(shaky.stability).toBeLessThan(solid.stability);
  });
});

describe('ảnh chụp trước khi ôn, phục vụ nhật ký bất biến', () => {
  it('ghi lại đúng trạng thái trước lần ôn', () => {
    const card = studyThrough(['good', 'good']);
    const result = scheduler.review(card, 'hard', card.due);

    expect(result.snapshotBefore).toEqual({
      state: card.state,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      due: card.due,
    });
    // Ảnh chụp là "trước", nên phải khác thẻ "sau".
    expect(result.card.due.getTime()).not.toBe(result.snapshotBefore.due.getTime());
  });
});

describe('tính tái lập', () => {
  it('cùng thẻ, cùng đánh giá, cùng thời điểm cho cùng kết quả', () => {
    const card = studyThrough(['good']);
    const a = scheduler.review(card, 'good', card.due);
    const b = scheduler.review(card, 'good', card.due);
    expect(a.card).toEqual(b.card);
  });

  it('fuzz đã tắt, nên dự báo lịch học không dao động', () => {
    const first = createScheduler();
    const second = createScheduler();
    const card = first.createCard(NOW);
    expect(first.review(card, 'good', NOW).card.due.getTime()).toBe(
      second.review(card, 'good', NOW).card.due.getTime(),
    );
  });
});

describe('ánh xạ sang database', () => {
  it('trạng thái khớp đúng số lưu trong card_states.state', () => {
    expect(CARD_STATE_TO_DB).toEqual({ new: 0, learning: 1, review: 2, relearning: 3 });
    for (const [state, value] of Object.entries(CARD_STATE_TO_DB)) {
      expect(DB_TO_CARD_STATE[value]).toBe(state);
    }
  });

  it('mức đánh giá khớp đúng số lưu trong review_logs.rating', () => {
    expect(ratingToNumber('again')).toBe(1);
    expect(ratingToNumber('hard')).toBe(2);
    expect(ratingToNumber('good')).toBe(3);
    expect(ratingToNumber('easy')).toBe(4);
    for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
      expect(numberToRating(ratingToNumber(rating))).toBe(rating);
    }
    expect(numberToRating(0)).toBeNull();
    expect(numberToRating(9)).toBeNull();
  });
});

describe('describeInterval', () => {
  const base = new Date('2026-10-05T10:00:00Z');
  const after = (ms: number) => new Date(base.getTime() + ms);

  it('chọn đơn vị mà người đọc sẽ dùng', () => {
    expect(describeInterval(base, after(10 * 60_000))).toMatchObject({ unit: 'minute', value: 10 });
    expect(describeInterval(base, after(3 * 3_600_000))).toMatchObject({ unit: 'hour', value: 3 });
    expect(describeInterval(base, after(2 * 86_400_000))).toMatchObject({ unit: 'day', value: 2 });
    expect(describeInterval(base, after(120 * 86_400_000))).toMatchObject({ unit: 'month', value: 4 });
  });

  it('khoảng rất ngắn vẫn hiện ít nhất 1 phút, không hiện 0', () => {
    expect(describeInterval(base, after(5_000))).toMatchObject({ unit: 'minute', value: 1 });
    expect(describeInterval(base, base)).toMatchObject({ unit: 'minute', value: 1 });
  });

  it('thời điểm trong quá khứ không cho ra số âm', () => {
    expect(describeInterval(base, after(-86_400_000)).minutes).toBe(0);
  });
});
