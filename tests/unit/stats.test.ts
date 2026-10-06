import { describe, expect, it } from 'vitest';
import { addDays, toCalendarDate, type IsoWeekday } from '../../src/core/planner/calendar.js';
import {
  buildHeatmap,
  computeLevelProgress,
  computeStreak,
  type DayActivity,
} from '../../src/core/stats/streak.js';

const d = toCalendarDate;
const TODAY = d('2026-10-20');

/** Active days counting back from `from`, newest first. */
function activeRun(from: string, count: number, perDay = 20): DayActivity[] {
  return Array.from({ length: count }, (_, i) => ({
    date: addDays(d(from), -i),
    newItems: perDay,
    reviews: 0,
  }));
}

describe('chuỗi ngày học', () => {
  it('chưa học gì thì chuỗi bằng 0', () => {
    expect(computeStreak({ activity: [], today: TODAY, restWeekdays: [] })).toEqual({
      current: 0,
      longest: 0,
      totalActiveDays: 0,
      studiedToday: false,
    });
  });

  it('học liên tục 5 ngày tính đến hôm nay', () => {
    const streak = computeStreak({
      activity: activeRun('2026-10-20', 5),
      today: TODAY,
      restWeekdays: [],
    });
    expect(streak.current).toBe(5);
    expect(streak.longest).toBe(5);
    expect(streak.studiedToday).toBe(true);
  });

  it('hôm nay chưa học vẫn giữ chuỗi — ngày chưa hết', () => {
    const streak = computeStreak({
      activity: activeRun('2026-10-19', 4),
      today: TODAY,
      restWeekdays: [],
    });
    expect(streak.studiedToday).toBe(false);
    expect(streak.current).toBe(4);
  });

  it('bỏ một ngày giữa chừng thì chuỗi hiện tại ngắn lại', () => {
    const activity = [...activeRun('2026-10-20', 2), ...activeRun('2026-10-16', 3)];
    const streak = computeStreak({ activity, today: TODAY, restWeekdays: [] });
    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(3);
  });

  it('ngày nghỉ đã khai báo KHÔNG làm đứt chuỗi', () => {
    // 17/10 là Thứ Bảy, 18/10 là Chủ Nhật — người học khai báo nghỉ cuối tuần.
    const activity = [
      ...activeRun('2026-10-20', 2), // T2 20/10, CN 19/10 -> thực ra 19/10 là CN
      ...activeRun('2026-10-16', 2), // T6 16/10, T5 15/10
    ];
    const rest: IsoWeekday[] = [6, 7];
    const streak = computeStreak({ activity, today: TODAY, restWeekdays: rest });
    // Không có hoạt động ngày 17–18 (T7, CN) nhưng đó là ngày nghỉ, nên vẫn nối.
    expect(streak.current).toBeGreaterThanOrEqual(3);
  });

  it('nghỉ không khai báo thì làm đứt chuỗi', () => {
    const activity = [...activeRun('2026-10-20', 2), ...activeRun('2026-10-16', 2)];
    const streak = computeStreak({ activity, today: TODAY, restWeekdays: [] });
    expect(streak.current).toBe(2);
  });

  it('ngày có hoạt động nhưng toàn là ôn tập vẫn tính', () => {
    const activity: DayActivity[] = [
      { date: TODAY, newItems: 0, reviews: 12 },
      { date: addDays(TODAY, -1), newItems: 0, reviews: 8 },
    ];
    expect(computeStreak({ activity, today: TODAY, restWeekdays: [] }).current).toBe(2);
  });

  it('ngày có dòng dữ liệu nhưng số liệu bằng 0 thì không tính', () => {
    const activity: DayActivity[] = [
      { date: TODAY, newItems: 0, reviews: 0 },
      { date: addDays(TODAY, -1), newItems: 5, reviews: 0 },
    ];
    const streak = computeStreak({ activity, today: TODAY, restWeekdays: [] });
    expect(streak.studiedToday).toBe(false);
    expect(streak.current).toBe(1);
    expect(streak.totalActiveDays).toBe(1);
  });

  it('chuỗi dài nhất không nhất thiết là chuỗi hiện tại', () => {
    const activity = [...activeRun('2026-10-20', 2), ...activeRun('2026-10-15', 8)];
    const streak = computeStreak({ activity, today: TODAY, restWeekdays: [] });
    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(8);
  });

  it('đếm đúng tổng số ngày đã học', () => {
    const activity = [...activeRun('2026-10-20', 3), ...activeRun('2026-10-10', 4)];
    expect(computeStreak({ activity, today: TODAY, restWeekdays: [] }).totalActiveDays).toBe(7);
  });
});

describe('heatmap hoạt động', () => {
  it('trả về đúng số ô, kết thúc ở hôm nay', () => {
    const cells = buildHeatmap({ activity: [], today: TODAY, days: 30, restWeekdays: [] });
    expect(cells).toHaveLength(30);
    expect(cells.at(-1)!.date).toBe(TODAY);
    expect(cells[0]!.date).toBe(addDays(TODAY, -29));
  });

  it('ngày không hoạt động có mức 0', () => {
    const cells = buildHeatmap({ activity: [], today: TODAY, days: 7, restWeekdays: [] });
    expect(cells.every((cell) => cell.level === 0 && cell.total === 0)).toBe(true);
  });

  it('cường độ tính theo ngày bận nhất của chính người học', () => {
    const activity: DayActivity[] = [
      { date: TODAY, newItems: 20, reviews: 20 }, // 40 — bận nhất
      { date: addDays(TODAY, -1), newItems: 10, reviews: 0 }, // 10 = 25%
      { date: addDays(TODAY, -2), newItems: 30, reviews: 0 }, // 30 = 75%
    ];
    const cells = buildHeatmap({ activity, today: TODAY, days: 3, restWeekdays: [] });
    const byDate = new Map(cells.map((c) => [c.date, c]));

    expect(byDate.get(TODAY)!.level).toBe(4);
    expect(byDate.get(addDays(TODAY, -2))!.level).toBe(3);
    expect(byDate.get(addDays(TODAY, -1))!.level).toBe(1);
  });

  it('người học nhịp nhẹ vẫn thấy lưới đầy — thang đo là tương đối', () => {
    const activity: DayActivity[] = [
      { date: TODAY, newItems: 7, reviews: 0 },
      { date: addDays(TODAY, -1), newItems: 7, reviews: 0 },
    ];
    const cells = buildHeatmap({ activity, today: TODAY, days: 2, restWeekdays: [] });
    expect(cells.every((cell) => cell.level === 4)).toBe(true);
  });

  it('đánh dấu ngày nghỉ', () => {
    const cells = buildHeatmap({ activity: [], today: TODAY, days: 14, restWeekdays: [6, 7] });
    const restCells = cells.filter((cell) => cell.isRestDay);
    expect(restCells).toHaveLength(4); // 2 tuần x 2 ngày
  });

  it('gộp đúng số câu mới và lượt ôn', () => {
    const activity: DayActivity[] = [{ date: TODAY, newItems: 20, reviews: 35 }];
    const cells = buildHeatmap({ activity, today: TODAY, days: 1, restWeekdays: [] });
    expect(cells[0]).toMatchObject({ newItems: 20, reviews: 35, total: 55 });
  });

  it('bỏ qua hoạt động nằm ngoài khoảng hiển thị', () => {
    const activity: DayActivity[] = [{ date: addDays(TODAY, -100), newItems: 20, reviews: 0 }];
    const cells = buildHeatmap({ activity, today: TODAY, days: 7, restWeekdays: [] });
    expect(cells.every((cell) => cell.total === 0)).toBe(true);
  });
});

describe('tiến độ theo cấp độ', () => {
  it('tính phần trăm cho từng cấp', () => {
    const progress = computeLevelProgress({
      itemCountByLevel: { A1: 300, A2: 300 },
      learnedByLevel: { A1: 300, A2: 75 },
      levels: ['A1', 'A2'],
    });
    expect(progress).toEqual([
      { level: 'A1', total: 300, learned: 300, percent: 100 },
      { level: 'A2', total: 300, learned: 75, percent: 25 },
    ]);
  });

  it('cấp chưa có nội dung hiện 0%, không chia cho 0', () => {
    const progress = computeLevelProgress({
      itemCountByLevel: { A1: 300 },
      learnedByLevel: {},
      levels: ['A1', 'B1'],
    });
    expect(progress[1]).toEqual({ level: 'B1', total: 0, learned: 0, percent: 0 });
  });

  it('số đã học không bao giờ vượt tổng số', () => {
    const progress = computeLevelProgress({
      itemCountByLevel: { A1: 300 },
      learnedByLevel: { A1: 999 },
      levels: ['A1'],
    });
    expect(progress[0]!.learned).toBe(300);
    expect(progress[0]!.percent).toBe(100);
  });
});
