import { describe, expect, it } from 'vitest';
import { addDays, toCalendarDate, type IsoWeekday } from '../../src/core/planner/calendar.js';
import {
  computeRebalance,
  forecastAtCurrentPace,
  type RebalanceInput,
  type RebalanceStrategy,
} from '../../src/core/planner/rebalance.js';

const d = toCalendarDate;
const START = d('2026-10-05');
const TARGET = d('2027-01-02');

function rebalance(overrides: Partial<RebalanceInput> = {}) {
  return computeRebalance({
    totalItems: 1800,
    completedItems: 0,
    startDate: START,
    targetDate: TARGET,
    today: START,
    restWeekdays: [],
    newPerDay: 20,
    bufferDays: 15,
    ...overrides,
  });
}

function option(report: ReturnType<typeof rebalance>, strategy: RebalanceStrategy) {
  const found = report.options.find((o) => o.strategy === strategy);
  if (!found) throw new Error(`Không tìm thấy phương án "${strategy}"`);
  return found;
}

describe('phát hiện trễ tiến độ', () => {
  it('ngày đầu tiên chưa học gì thì chưa tính là trễ', () => {
    const report = rebalance();
    expect(report.expectedByNow).toBe(20);
    expect(report.itemsBehind).toBe(20);
    expect(report.daysBehind).toBe(1);
  });

  it('học đúng kế hoạch thì không trễ', () => {
    // Sau 10 ngày học, đúng tiến độ là 200 mục.
    const report = rebalance({ today: addDays(START, 9), completedItems: 200 });
    expect(report.expectedByNow).toBe(200);
    expect(report.itemsBehind).toBe(0);
    expect(report.isBehind).toBe(false);
  });

  it('học vượt kế hoạch cũng không tính là trễ', () => {
    const report = rebalance({ today: addDays(START, 9), completedItems: 260 });
    expect(report.itemsBehind).toBe(0);
    expect(report.isBehind).toBe(false);
  });

  it('nghỉ một tuần: quy ra đúng số ngày trễ', () => {
    // Ngày 17 nhưng mới học tới ngày 10 => nợ 140 mục = 7 ngày.
    const report = rebalance({ today: addDays(START, 16), completedItems: 200 });
    expect(report.expectedByNow).toBe(340);
    expect(report.itemsBehind).toBe(140);
    expect(report.daysBehind).toBe(7);
  });

  it('kế hoạch chưa bắt đầu thì không bao giờ trễ', () => {
    const report = rebalance({ today: addDays(START, -5) });
    expect(report.expectedByNow).toBe(0);
    expect(report.isBehind).toBe(false);
  });

  it('ngày nghỉ không bị tính là ngày trễ', () => {
    const rest: IsoWeekday[] = [6, 7];
    // Sau 2 tuần lịch chỉ có 10 ngày học, nên kỳ vọng là 200 chứ không phải 280.
    const report = rebalance({
      today: addDays(START, 13),
      completedItems: 200,
      restWeekdays: rest,
    });
    expect(report.expectedByNow).toBe(200);
    expect(report.isBehind).toBe(false);
  });
});

describe('ba phương án rebalance', () => {
  it('luôn trả về đúng ba phương án', () => {
    const report = rebalance({ today: addDays(START, 16), completedItems: 200 });
    expect(report.options.map((o) => o.strategy)).toEqual(['catch-up', 'use-buffer', 'move-target']);
  });

  it('kế hoạch chạy dưới trần: dồn nhẹ khả dụng và nêu rõ con số mới', () => {
    // 600 mục / 90 ngày = 7 mục/ngày, còn dư chỗ dưới trần 20 để bù.
    const report = rebalance({
      totalItems: 600,
      newPerDay: 7,
      today: addDays(START, 9),
      completedItems: 35, // đáng lẽ 70, trễ 5 ngày
    });
    const catchUp = option(report, 'catch-up');
    expect(catchUp.available).toBe(true);
    expect(catchUp.newPerDay).toBeGreaterThan(7);
    expect(catchUp.newPerDay).toBeLessThanOrEqual(20);
    expect(catchUp.targetDate).toBe(TARGET);
    expect(catchUp.summary).toContain('Tăng từ 7 lên');
  });

  it('kế hoạch đã chạy đúng trần: dồn nhẹ không bao giờ khả dụng', () => {
    // Ở nhịp 20/ngày không còn chỗ nào để dồn, nên dù chỉ trễ một ngày
    // phương án này cũng bị loại — đúng với ý nghĩa của một trần cứng.
    for (const daysLate of [1, 3, 10]) {
      const report = rebalance({
        today: addDays(START, 9),
        completedItems: 200 - daysLate * 20,
      });
      expect(option(report, 'catch-up').available, `trễ ${daysLate} ngày`).toBe(false);
      // Nhưng người học vẫn luôn còn hai lối thoát.
      expect(option(report, 'use-buffer').available).toBe(true);
      expect(option(report, 'move-target').available).toBe(true);
    }
  });

  it('trễ nặng: dồn nhẹ bị chặn vì vượt trần, nêu rõ lý do', () => {
    // Trễ 20 ngày ở nửa sau kế hoạch: không thể bù trong trần 20/ngày.
    const report = rebalance({ today: addDays(START, 59), completedItems: 800 });
    const catchUp = option(report, 'catch-up');
    expect(catchUp.available).toBe(false);
    expect(catchUp.unavailableReason).toContain('giới hạn cứng');
    expect(catchUp.summary).toContain('vượt trần');
  });

  it('dùng ngày đệm khi số ngày trễ còn trong hạn mức', () => {
    const report = rebalance({ today: addDays(START, 16), completedItems: 200 });
    const buffer = option(report, 'use-buffer');
    expect(buffer.available).toBe(true);
    expect(buffer.bufferUsed).toBe(7);
    expect(buffer.newPerDay).toBe(20); // giữ nguyên nhịp
    expect(buffer.targetDate).not.toBe(TARGET);
    expect(buffer.summary).toContain('7/15 ngày đệm');
    expect(buffer.summary).toContain('còn lại 8 ngày đệm');
  });

  it('hết đệm thì phương án đệm bị chặn, nêu rõ lý do', () => {
    const report = rebalance({ today: addDays(START, 59), completedItems: 800 });
    const buffer = option(report, 'use-buffer');
    expect(buffer.available).toBe(false);
    expect(buffer.unavailableReason).toContain('nhiều hơn 15 ngày đệm');
  });

  it('dời mục tiêu luôn khả dụng, kể cả khi trễ rất nặng', () => {
    const report = rebalance({ today: addDays(START, 59), completedItems: 100 });
    const move = option(report, 'move-target');
    expect(move.available).toBe(true);
    expect(move.newPerDay).toBe(20); // giữ nguyên nhịp
    expect(move.summary).toContain('dời mục tiêu');
  });

  it('dời mục tiêu tính đúng ngày mới theo nhịp hiện tại', () => {
    // Còn 1700 mục ở nhịp 20/ngày = 85 ngày học kể từ ngày mai.
    const report = rebalance({ today: addDays(START, 59), completedItems: 100 });
    const move = option(report, 'move-target');
    expect(move.targetDate).toBe(addDays(START, 60 + 84));
  });

  it('phương án dời mục tiêu tôn trọng ngày nghỉ', () => {
    const report = rebalance({
      today: addDays(START, 59),
      completedItems: 100,
      restWeekdays: [6, 7],
    });
    const move = option(report, 'move-target');
    // 85 ngày học khi nghỉ cuối tuần trải dài hơn 85 ngày lịch.
    expect(move.targetDate > addDays(START, 60 + 84)).toBe(true);
  });

  it('không có phương án nào tăng vượt trần', () => {
    for (const completed of [0, 100, 500, 800, 1500]) {
      const report = rebalance({ today: addDays(START, 59), completedItems: completed });
      for (const opt of report.options) {
        expect(opt.newPerDay).toBeLessThanOrEqual(20);
      }
    }
  });

  it('hết ngày học trước mục tiêu: dồn nhẹ bị chặn, dời mục tiêu vẫn còn', () => {
    const report = rebalance({ today: TARGET, completedItems: 1000 });
    expect(option(report, 'catch-up').available).toBe(false);
    expect(option(report, 'catch-up').unavailableReason).toContain('Không còn ngày học nào');
    expect(option(report, 'move-target').available).toBe(true);
  });
});

describe('dự báo theo tốc độ thực tế', () => {
  it('đúng nhịp thì dự báo rơi vào ngày mục tiêu', () => {
    const { actualPerDay, forecastDate } = forecastAtCurrentPace({
      totalItems: 1800,
      completedItems: 200,
      startDate: START,
      today: addDays(START, 9),
      restWeekdays: [],
    });
    expect(actualPerDay).toBe(20);
    expect(forecastDate).toBe(TARGET);
  });

  it('chậm hơn kế hoạch thì dự báo lùi lại', () => {
    const { actualPerDay, forecastDate } = forecastAtCurrentPace({
      totalItems: 1800,
      completedItems: 100,
      startDate: START,
      today: addDays(START, 9),
      restWeekdays: [],
    });
    expect(actualPerDay).toBe(10);
    expect(forecastDate! > TARGET).toBe(true);
  });

  it('chưa học gì thì chưa dự báo được', () => {
    const result = forecastAtCurrentPace({
      totalItems: 1800,
      completedItems: 0,
      startDate: START,
      today: addDays(START, 5),
      restWeekdays: [],
    });
    expect(result.forecastDate).toBeNull();
    expect(result.actualPerDay).toBe(0);
  });

  it('học xong rồi thì dự báo là hôm nay', () => {
    const today = addDays(START, 9);
    const result = forecastAtCurrentPace({
      totalItems: 200,
      completedItems: 200,
      startDate: START,
      today,
      restWeekdays: [],
    });
    expect(result.forecastDate).toBe(today);
  });
});
