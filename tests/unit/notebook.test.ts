import { describe, expect, it } from 'vitest';
import {
  NOTEBOOK_LEVEL,
  notebookFields,
  notebookItemInputSchema,
  notebookStableKey,
} from '../../src/core/content/notebook.js';
import { itemSchema } from '../../src/core/content/schema.js';
import { computeStreak, mergeActivityByDate, type DayActivity } from '../../src/core/stats/streak.js';

/**
 * The rules for a learner's own sentence, tested without a database.
 *
 * The one that matters most is that only the sentence and its meaning are
 * required: the feature exists so a sentence can be written down at the moment
 * it is met, and a schema that quietly demanded IPA would defeat that.
 */

describe('sổ tay — dữ liệu người học tự nhập', () => {
  it('chỉ cần câu và nghĩa', () => {
    const parsed = notebookItemInputSchema.parse({
      text: 'Ich habe das Buch gelesen.',
      meaning: 'Tôi đã đọc quyển sách đó.',
    });

    expect(parsed.text).toBe('Ich habe das Buch gelesen.');
    expect(parsed.transliteration).toBeUndefined();
    expect(parsed.grammarNote).toBeUndefined();
    expect(parsed.topic).toBeUndefined();
    expect(parsed.glossary).toEqual([]);
  });

  it('từ chối câu rỗng hoặc chỉ có khoảng trắng', () => {
    for (const text of ['', '   ']) {
      expect(notebookItemInputSchema.safeParse({ text, meaning: 'x' }).success).toBe(false);
    }
    expect(notebookItemInputSchema.safeParse({ text: 'x', meaning: '  ' }).success).toBe(false);
  });

  it('coi trường tuỳ chọn rỗng như không nhập, không lưu chuỗi rỗng', () => {
    // The study card tests presence, so an empty string would render a heading
    // with nothing under it.
    const parsed = notebookItemInputSchema.parse({
      text: 'Guten Morgen!',
      meaning: 'Chào buổi sáng!',
      transliteration: '   ',
      grammarNote: '',
      topic: '  ',
    });

    expect(parsed.transliteration).toBeUndefined();
    expect(notebookFields(parsed)).toEqual({ text: 'Guten Morgen!', meaning: 'Chào buổi sáng!' });
  });

  it('giữ lại trường tuỳ chọn khi có nhập', () => {
    const parsed = notebookItemInputSchema.parse({
      text: 'Guten Morgen!',
      meaning: 'Chào buổi sáng!',
      transliteration: 'ˈɡuːtn̩ ˈmɔʁɡn̩',
      grammarNote: 'Lời chào buổi sáng.',
    });

    expect(notebookFields(parsed)).toEqual({
      text: 'Guten Morgen!',
      meaning: 'Chào buổi sáng!',
      transliteration: 'ˈɡuːtn̩ ˈmɔʁɡn̩',
      grammarNote: 'Lời chào buổi sáng.',
    });
  });

  it('khoá ổn định theo dạng P0001 và khớp định dạng dùng chung', () => {
    expect(notebookStableKey(1)).toBe('P0001');
    expect(notebookStableKey(42)).toBe('P0042');
    expect(notebookStableKey(12345)).toBe('P12345');

    // The same regex the content pipeline enforces, so a notebook row would
    // survive being validated by it.
    for (const index of [1, 7, 99, 1000, 123456]) {
      const parsed = itemSchema.shape.stableKey.safeParse(notebookStableKey(index));
      expect(parsed.success, `P key cho ${index}`).toBe(true);
    }
  });

  it('từ chối thứ tự không hợp lệ thay vì sinh khoá sai', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => notebookStableKey(bad)).toThrow();
    }
  });

  it('không dùng trình độ CEFR cho câu chưa ai xếp loại', () => {
    // A sentence met in the wild has no level. Borrowing a CEFR code would be
    // inventing data, and would also put it into the planner's reach.
    expect(NOTEBOOK_LEVEL).toBe('PERSONAL');
    expect(['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']).not.toContain(NOTEBOOK_LEVEL);
  });

  it('chặn số chú thích từ vựng vượt ngưỡng', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ term: `w${i}`, meaning: `m${i}` }));
    expect(
      notebookItemInputSchema.safeParse({ text: 'x', meaning: 'y', glossary: many }).success,
    ).toBe(false);
  });
});

/**
 * Merging the course's activity with the notebook's.
 *
 * The learner chose one set of numbers rather than two, so a sentence they
 * wrote themselves extends the same streak. That makes double counting the
 * failure mode worth testing: activity is recorded per enrollment, and a day
 * studied in both would otherwise appear twice.
 */
describe('gộp hoạt động của khóa học và sổ tay', () => {
  const day = (date: string, newItems: number, reviews: number) =>
    ({ date, newItems, reviews }) as DayActivity;

  it('cộng hai dòng cùng ngày thành một', () => {
    const merged = mergeActivityByDate([
      day('2026-10-20', 20, 5), // the course
      day('2026-10-20', 2, 3), // the notebook, same day
    ]);

    expect(merged).toEqual([{ date: '2026-10-20', newItems: 22, reviews: 8 }]);
  });

  it('một ngày chỉ học sổ tay vẫn là một ngày có hoạt động', () => {
    // This is the point of merging rather than reporting separately: the streak
    // must not break on a day the learner only revised their own sentences.
    const merged = mergeActivityByDate([day('2026-10-19', 20, 0), day('2026-10-20', 0, 4)]);

    expect(merged).toHaveLength(2);
    expect(computeStreak({ activity: merged, today: '2026-10-20' as never, restWeekdays: [] }).current).toBe(2);
  });

  it('sắp xếp theo ngày, không phụ thuộc thứ tự truy vấn', () => {
    const merged = mergeActivityByDate([
      day('2026-10-22', 1, 0),
      day('2026-10-20', 1, 0),
      day('2026-10-21', 1, 0),
    ]);

    expect(merged.map((d) => d.date)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });

  it('không làm biến đổi danh sách đầu vào', () => {
    const input = [day('2026-10-20', 20, 5), day('2026-10-20', 2, 3)];
    mergeActivityByDate(input);
    expect(input[0]!.newItems).toBe(20);
  });

  it('danh sách rỗng cho kết quả rỗng', () => {
    expect(mergeActivityByDate([])).toEqual([]);
  });
});
