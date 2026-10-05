import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_NEW_PER_DAY,
  BUFFER_DAYS_RANGE,
  MAX_NEW_PER_DAY,
} from '../../src/config/app.config.js';
import {
  addDays,
  calendarDateInTimezone,
  compareDates,
  diffDays,
  eachDay,
  endOfDayInstant,
  isoWeekday,
  parseCalendarDate,
  startOfDayInstant,
  toCalendarDate,
  type IsoWeekday,
} from '../../src/core/planner/calendar.js';
import {
  computeBufferDays,
  computePlan,
  countStudyDays,
  effectiveCeiling,
  nthStudyDay,
  type PlanInput,
} from '../../src/core/planner/plan.js';

const d = toCalendarDate;

/** The source workbook's plan: start 2026-10-05, 1800 items, 90 days. */
const BENCHMARK_START = d('2026-10-05');
const BENCHMARK_TARGET = d('2027-01-02');

function planOf(overrides: Partial<PlanInput> = {}) {
  const outcome = computePlan({
    totalItems: 1800,
    startDate: BENCHMARK_START,
    targetDate: BENCHMARK_TARGET,
    restWeekdays: [],
    ...overrides,
  });
  if (!outcome.ok) throw new Error(`Mong đợi kế hoạch hợp lệ, nhưng bị chặn: ${outcome.blocked.message}`);
  return outcome.plan;
}

function blockedOf(overrides: Partial<PlanInput> = {}) {
  const outcome = computePlan({
    totalItems: 1800,
    startDate: BENCHMARK_START,
    targetDate: BENCHMARK_TARGET,
    restWeekdays: [],
    ...overrides,
  });
  if (outcome.ok) throw new Error('Mong đợi bị chặn, nhưng kế hoạch lại hợp lệ.');
  return outcome.blocked;
}

// ---------------------------------------------------------------------------

describe('calendar', () => {
  it('nhận và từ chối đúng định dạng ngày', () => {
    expect(parseCalendarDate('2026-10-05')).toBe('2026-10-05');
    expect(parseCalendarDate('2026-02-29')).toBeNull(); // 2026 không nhuận
    expect(parseCalendarDate('2024-02-29')).toBe('2024-02-29');
    expect(parseCalendarDate('2026-13-01')).toBeNull();
    expect(parseCalendarDate('2026-04-31')).toBeNull();
    expect(parseCalendarDate('05/10/2026')).toBeNull();
    expect(parseCalendarDate(null)).toBeNull();
  });

  it('cộng ngày vượt qua ranh giới tháng và năm', () => {
    expect(addDays(d('2026-10-05'), 89)).toBe('2027-01-02');
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(d('2024-02-28'), 1)).toBe('2024-02-29');
    expect(addDays(d('2026-01-01'), -1)).toBe('2025-12-31');
  });

  it('đếm ngày đúng và đối xứng', () => {
    expect(diffDays(d('2026-10-05'), d('2027-01-02'))).toBe(89);
    expect(diffDays(d('2027-01-02'), d('2026-10-05'))).toBe(-89);
    expect(diffDays(d('2026-10-05'), d('2026-10-05'))).toBe(0);
  });

  it('tính thứ theo chuẩn ISO', () => {
    expect(isoWeekday(d('2026-10-05'))).toBe(1); // Thứ Hai
    expect(isoWeekday(d('2026-10-11'))).toBe(7); // Chủ Nhật
    expect(isoWeekday(d('1970-01-01'))).toBe(4); // Thứ Năm
  });

  it('eachDay bao gồm cả hai đầu, rỗng khi khoảng đảo ngược', () => {
    expect(eachDay(d('2026-10-05'), d('2026-10-07'))).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(eachDay(d('2026-10-05'), d('2026-10-05'))).toHaveLength(1);
    expect(eachDay(d('2026-10-07'), d('2026-10-05'))).toEqual([]);
  });

  it('"hôm nay" tính theo múi giờ người học, không theo server', () => {
    // 23:30 UTC ngày 04/10 đã là 06:30 ngày 05/10 ở Việt Nam.
    const instant = new Date('2026-10-04T23:30:00Z');
    expect(calendarDateInTimezone(instant, 'Asia/Ho_Chi_Minh')).toBe('2026-10-05');
    expect(calendarDateInTimezone(instant, 'UTC')).toBe('2026-10-04');
    // Và vẫn là 04/10 ở Los Angeles.
    expect(calendarDateInTimezone(instant, 'America/Los_Angeles')).toBe('2026-10-04');
  });

  it('múi giờ lạ không làm vỡ, rơi về UTC', () => {
    expect(calendarDateInTimezone(new Date('2026-10-04T23:30:00Z'), 'Khong/Ton_Tai')).toBe('2026-10-04');
  });

  it('mốc đầu ngày đúng theo múi giờ', () => {
    const start = startOfDayInstant(d('2026-10-05'), 'Asia/Ho_Chi_Minh');
    expect(start.toISOString()).toBe('2026-10-04T17:00:00.000Z'); // UTC+7
    const end = endOfDayInstant(d('2026-10-05'), 'Asia/Ho_Chi_Minh');
    expect(end.toISOString()).toBe('2026-10-05T17:00:00.000Z');
  });

  it('qua mốc đổi giờ DST vẫn ra đúng số ngày', () => {
    // Mỹ đổi giờ ngày 08/03/2026. Cộng ngày theo lịch, không theo mili giây.
    expect(diffDays(d('2026-03-07'), d('2026-03-09'))).toBe(2);
    const start = startOfDayInstant(d('2026-03-08'), 'America/New_York');
    expect(calendarDateInTimezone(start, 'America/New_York')).toBe('2026-03-08');
    const after = startOfDayInstant(d('2026-03-09'), 'America/New_York');
    expect(calendarDateInTimezone(after, 'America/New_York')).toBe('2026-03-09');
  });
});

// ---------------------------------------------------------------------------

describe('countStudyDays', () => {
  it('đếm trọn khoảng khi không nghỉ ngày nào', () => {
    expect(countStudyDays(BENCHMARK_START, BENCHMARK_TARGET, [])).toBe(90);
  });

  it('trừ đúng các ngày nghỉ cuối tuần', () => {
    // 90 ngày từ Thứ Hai 05/10/2026: 12 tuần trọn + 6 ngày lẻ.
    expect(countStudyDays(BENCHMARK_START, BENCHMARK_TARGET, [6, 7])).toBe(65);
  });

  it('cùng một ngày đầu và cuối', () => {
    expect(countStudyDays(d('2026-10-05'), d('2026-10-05'), [])).toBe(1);
    expect(countStudyDays(d('2026-10-05'), d('2026-10-05'), [1])).toBe(0); // 05/10 là Thứ Hai
  });

  it('khoảng đảo ngược trả về 0', () => {
    expect(countStudyDays(d('2026-10-10'), d('2026-10-05'), [])).toBe(0);
  });

  it('nghỉ cả 7 ngày trả về 0', () => {
    expect(countStudyDays(BENCHMARK_START, BENCHMARK_TARGET, [1, 2, 3, 4, 5, 6, 7])).toBe(0);
  });

  it('cho kết quả giống hệt cách đếm từng ngày một', () => {
    const rest: IsoWeekday[] = [3, 7];
    const naive = eachDay(d('2026-01-01'), d('2026-12-31')).filter(
      (day) => !rest.includes(isoWeekday(day)),
    ).length;
    expect(countStudyDays(d('2026-01-01'), d('2026-12-31'), rest)).toBe(naive);
  });
});

describe('nthStudyDay', () => {
  it('ngày học thứ n khi không nghỉ', () => {
    expect(nthStudyDay(BENCHMARK_START, 1, [])).toBe('2026-10-05');
    expect(nthStudyDay(BENCHMARK_START, 90, [])).toBe('2027-01-02');
  });

  it('bỏ qua ngày nghỉ', () => {
    // Thứ Hai 05/10, nghỉ T7+CN: ngày học thứ 6 là Thứ Hai tuần sau.
    expect(nthStudyDay(BENCHMARK_START, 6, [6, 7])).toBe('2026-10-12');
  });

  it('trả null khi n không hợp lệ hoặc nghỉ cả tuần', () => {
    expect(nthStudyDay(BENCHMARK_START, 0, [])).toBeNull();
    expect(nthStudyDay(BENCHMARK_START, 5, [1, 2, 3, 4, 5, 6, 7])).toBeNull();
  });
});

describe('effectiveCeiling', () => {
  it('mặc định là trần toàn cục', () => {
    expect(effectiveCeiling()).toBe(MAX_NEW_PER_DAY);
  });

  it('người học hạ được trần, nhưng không nâng lên được', () => {
    expect(effectiveCeiling(5)).toBe(5);
    expect(effectiveCeiling(100)).toBe(MAX_NEW_PER_DAY);
    expect(effectiveCeiling(0)).toBe(1);
    expect(effectiveCeiling(-3)).toBe(1);
    expect(effectiveCeiling(Number.NaN)).toBe(MAX_NEW_PER_DAY);
  });
});

describe('computeBufferDays', () => {
  it('khung chuẩn 90 ngày cho đúng 15 ngày đệm như file gốc', () => {
    expect(computeBufferDays(BENCHMARK_START, BENCHMARK_TARGET)).toBe(15);
  });

  it('luôn nằm trong khoảng cấu hình', () => {
    const [low, high] = BUFFER_DAYS_RANGE;
    for (const days of [1, 7, 30, 60, 90, 180, 365, 1000]) {
      const buffer = computeBufferDays(BENCHMARK_START, addDays(BENCHMARK_START, days));
      expect(buffer).toBeGreaterThanOrEqual(low);
      expect(buffer).toBeLessThanOrEqual(high);
    }
  });

  it('kế hoạch ngắn nhận mức đệm tối thiểu', () => {
    expect(computeBufferDays(BENCHMARK_START, addDays(BENCHMARK_START, 29))).toBe(10);
  });
});

// ---------------------------------------------------------------------------

describe('computePlan — benchmark của hệ thống', () => {
  it('1.800 mục / 90 ngày = đúng 20 mục/ngày', () => {
    const plan = planOf();
    expect(plan.newPerDay).toBe(BENCHMARK_NEW_PER_DAY);
    expect(plan.studyDays).toBe(90);
    expect(plan.minDays).toBe(90);
    expect(plan.bufferDays).toBe(15);
  });

  it('hạn chót có đệm khớp file gốc: 17/01/2027', () => {
    expect(planOf().hardDeadline).toBe('2027-01-17');
  });

  it('dự báo rơi đúng ngày mục tiêu', () => {
    expect(planOf().forecastDate).toBe(BENCHMARK_TARGET);
  });

  it('tổng số mục trong lịch khớp chính xác, không thừa không thiếu', () => {
    const plan = planOf();
    expect(plan.days.reduce((sum, day) => sum + day.plannedNew, 0)).toBe(1800);
    expect(plan.days.at(-1)!.cumulative).toBe(1800);
  });

  it('600 mục thật hiện có trong 90 ngày = 7 mục/ngày', () => {
    const plan = planOf({ totalItems: 600 });
    expect(plan.newPerDay).toBe(7);
    expect(plan.days.reduce((s, day) => s + day.plannedNew, 0)).toBe(600);
  });
});

describe('computePlan — trần mỗi ngày là giới hạn cứng', () => {
  it('chặn khi khung thời gian ngắn hơn mức tối thiểu', () => {
    const blocked = blockedOf({ targetDate: addDays(BENCHMARK_START, 59) });
    expect(blocked.reason).toBe('timeframe-too-short');
    expect(blocked.studyDays).toBe(60);
    expect(blocked.minDays).toBe(90);
  });

  it('gợi ý đúng ngày mục tiêu sớm nhất khả thi', () => {
    const blocked = blockedOf({ targetDate: addDays(BENCHMARK_START, 59) });
    expect(blocked.earliestFeasibleTarget).toBe('2027-01-02'); // ngày học thứ 90
    // Và ngày đó thực sự tạo ra được kế hoạch hợp lệ.
    const retry = computePlan({
      totalItems: 1800,
      startDate: BENCHMARK_START,
      targetDate: blocked.earliestFeasibleTarget!,
      restWeekdays: [],
    });
    expect(retry.ok).toBe(true);
  });

  it('thông báo nêu rõ con số, bằng tiếng Việt', () => {
    const { message } = blockedOf({ targetDate: addDays(BENCHMARK_START, 59) });
    expect(message).toContain('1800 mục');
    expect(message).toContain('20 mục/ngày');
    expect(message).toContain('90 ngày học');
    expect(message).toContain('02/01/2027');
  });

  it('không bao giờ vượt trần, dù khung cực ngắn vẫn bị chặn', () => {
    const blocked = blockedOf({ targetDate: addDays(BENCHMARK_START, 1) });
    expect(blocked.reason).toBe('timeframe-too-short');
  });

  it('tôn trọng trần thấp hơn do người học tự đặt', () => {
    // 10 mục/ngày thì 1800 mục cần 180 ngày, nên 90 ngày bị chặn.
    const blocked = blockedOf({ maxNewPerDay: 10 });
    expect(blocked.minDays).toBe(180);
    const plan = planOf({ maxNewPerDay: 10, targetDate: addDays(BENCHMARK_START, 200) });
    expect(plan.newPerDay).toBeLessThanOrEqual(10);
  });
});

describe('computePlan — ngày nghỉ trong tuần', () => {
  it('nghỉ cuối tuần làm tăng số mục mỗi ngày', () => {
    const plan = planOf({ totalItems: 600, restWeekdays: [6, 7] });
    expect(plan.studyDays).toBe(65);
    expect(plan.newPerDay).toBe(Math.ceil(600 / 65));
    expect(plan.days.reduce((s, day) => s + day.plannedNew, 0)).toBe(600);
  });

  it('ngày nghỉ được đánh dấu và không mang mục nào', () => {
    const plan = planOf({ totalItems: 600, restWeekdays: [6, 7] });
    const restDays = plan.days.filter((day) => day.isRestDay);
    expect(restDays.length).toBe(90 - 65);
    expect(restDays.every((day) => day.plannedNew === 0)).toBe(true);
    expect(restDays.every((day) => [6, 7].includes(isoWeekday(day.date)))).toBe(true);
  });

  it('nghỉ cả 7 ngày bị chặn với lý do rõ ràng', () => {
    const blocked = blockedOf({ restWeekdays: [1, 2, 3, 4, 5, 6, 7] });
    expect(blocked.reason).toBe('no-study-days');
    expect(blocked.message).toContain('nghỉ cả 7 ngày');
  });

  it('nghỉ cuối tuần đẩy ngày khả thi sớm nhất ra xa', () => {
    const blocked = blockedOf({ restWeekdays: [6, 7] });
    expect(blocked.reason).toBe('timeframe-too-short');
    // 90 ngày học khi nghỉ T7/CN cần khoảng 18 tuần.
    expect(diffDays(BENCHMARK_START, blocked.earliestFeasibleTarget!)).toBeGreaterThan(120);
  });
});

describe('computePlan — edge case', () => {
  it('không có mục nào', () => {
    const blocked = blockedOf({ totalItems: 0 });
    expect(blocked.reason).toBe('no-items');
    expect(blocked.message).toContain('chưa có mục nào');
  });

  it('số mục âm hoặc không phải số cũng bị chặn', () => {
    expect(blockedOf({ totalItems: -5 }).reason).toBe('no-items');
    expect(blockedOf({ totalItems: Number.NaN }).reason).toBe('no-items');
  });

  it('ngày mục tiêu sớm hơn ngày bắt đầu', () => {
    const blocked = blockedOf({ targetDate: addDays(BENCHMARK_START, -1) });
    expect(blocked.reason).toBe('invalid-range');
    expect(blocked.message).toContain('sớm hơn ngày bắt đầu');
  });

  it('bắt đầu và kết thúc cùng một ngày: đủ chỗ cho tối đa 20 mục', () => {
    const plan = planOf({ totalItems: 20, targetDate: BENCHMARK_START });
    expect(plan.studyDays).toBe(1);
    expect(plan.newPerDay).toBe(20);
    expect(plan.days).toHaveLength(1);

    const blocked = blockedOf({ totalItems: 21, targetDate: BENCHMARK_START });
    expect(blocked.reason).toBe('timeframe-too-short');
  });

  it('chia không hết: ngày cuối nhẹ hơn, tổng vẫn khớp', () => {
    const plan = planOf({ totalItems: 95, targetDate: addDays(BENCHMARK_START, 9) });
    expect(plan.studyDays).toBe(10);
    expect(plan.newPerDay).toBe(10); // ceil(95/10)
    const scheduled = plan.days.filter((day) => day.plannedNew > 0);
    expect(scheduled).toHaveLength(10);
    expect(scheduled.at(-1)!.plannedNew).toBe(5); // 9 ngày x 10 + 5
    expect(plan.days.reduce((s, day) => s + day.plannedNew, 0)).toBe(95);
  });

  it('khung dài hơn mức cần: dự báo xong sớm, ngày thừa trống', () => {
    const plan = planOf({ totalItems: 100, targetDate: addDays(BENCHMARK_START, 199) });
    expect(plan.newPerDay).toBe(1); // ceil(100/200) = 1
    expect(plan.forecastDate).toBe(addDays(BENCHMARK_START, 99));
    expect(compareDates(plan.forecastDate, plan.days.at(-1)!.date)).toBeLessThan(0);
  });

  it('mục/ngày không bao giờ xuống dưới 1', () => {
    const plan = planOf({ totalItems: 5, targetDate: addDays(BENCHMARK_START, 364) });
    expect(plan.newPerDay).toBe(1);
  });

  it('ngày bắt đầu trong quá khứ vẫn tính được kế hoạch', () => {
    const plan = planOf({
      totalItems: 600,
      startDate: d('2020-01-01'),
      targetDate: d('2020-03-31'),
    });
    expect(plan.studyDays).toBe(91);
    expect(plan.newPerDay).toBe(Math.ceil(600 / 91));
  });

  it('lũy kế tăng đơn điệu và kết thúc bằng tổng số mục', () => {
    const plan = planOf({ totalItems: 600, restWeekdays: [7] });
    let previous = 0;
    for (const day of plan.days) {
      expect(day.cumulative).toBeGreaterThanOrEqual(previous);
      previous = day.cumulative;
    }
    expect(previous).toBe(600);
  });

  it('dayIndex chỉ tăng trên ngày học', () => {
    const plan = planOf({ totalItems: 100, restWeekdays: [6, 7] });
    const studyIndexes = plan.days.filter((day) => !day.isRestDay).map((day) => day.dayIndex);
    expect(studyIndexes).toEqual(studyIndexes.map((_, i) => i + 1));
  });
});

describe('computePlan — tính ổn định', () => {
  it('cùng đầu vào luôn cho cùng kết quả', () => {
    const input: PlanInput = {
      totalItems: 1234,
      startDate: d('2026-10-05'),
      targetDate: d('2027-03-01'),
      restWeekdays: [7],
    };
    expect(computePlan(input)).toEqual(computePlan(input));
  });

  it('mọi kế hoạch hợp lệ đều phủ hết số mục và không vượt trần', () => {
    for (const totalItems of [1, 17, 95, 600, 601, 1799, 1800]) {
      for (const span of [95, 180, 400]) {
        for (const restWeekdays of [[], [7], [6, 7]] as IsoWeekday[][]) {
          const outcome = computePlan({
            totalItems,
            startDate: BENCHMARK_START,
            targetDate: addDays(BENCHMARK_START, span),
            restWeekdays,
          });
          if (!outcome.ok) continue;
          const { plan } = outcome;
          expect(plan.newPerDay).toBeLessThanOrEqual(MAX_NEW_PER_DAY);
          expect(plan.days.reduce((s, day) => s + day.plannedNew, 0)).toBe(totalItems);
        }
      }
    }
  });
});
