import { describe, expect, it } from 'vitest';
import { MAX_REVIEWS_PER_SESSION } from '../../src/config/app.config.js';
import {
  buildSession,
  sessionProgress,
  type BuildSessionInput,
  type SessionItemRef,
} from '../../src/core/session/build-session.js';
import {
  answerCloseness,
  buildCloze,
  buildExercise,
  buildMultipleChoice,
  canBuildMultipleChoice,
  checkTypedAnswer,
  normalizeForComparison,
  pickExerciseKind,
  seedFrom,
  shuffleWithSeed,
  type ExerciseItem,
} from '../../src/core/session/exercises.js';

const ALL_STAGES = { review: true, learn: true, consolidate: true };

function refs(count: number, offset = 0): SessionItemRef[] {
  return Array.from({ length: count }, (_, i) => ({
    itemId: `item-${offset + i + 1}`,
    stableKey: `S${String(offset + i + 1).padStart(4, '0')}`,
    orderIndex: offset + i + 1,
  }));
}

function session(overrides: Partial<BuildSessionInput> = {}) {
  return buildSession({
    dueCards: [],
    unseenItems: refs(100),
    plannedNew: 20,
    completedNewToday: 0,
    stageFlags: ALL_STAGES,
    ...overrides,
  });
}

describe('buildSession', () => {
  it('lấy đúng số mục mới theo kế hoạch trong ngày', () => {
    const plan = session({ plannedNew: 20 });
    expect(plan.learn).toHaveLength(20);
    expect(plan.learn[0]!.stableKey).toBe('S0001');
    expect(plan.learn.at(-1)!.stableKey).toBe('S0020');
  });

  it('mục mới lấy đúng theo thứ tự dạy', () => {
    const plan = session({ plannedNew: 5 });
    expect(plan.learn.map((i) => i.orderIndex)).toEqual([1, 2, 3, 4, 5]);
  });

  it('phiên học dở dang tiếp tục chỗ cũ, không học lại từ đầu', () => {
    const plan = session({ plannedNew: 20, completedNewToday: 12, unseenItems: refs(100, 12) });
    expect(plan.learn).toHaveLength(8);
    expect(plan.learn[0]!.stableKey).toBe('S0013');
  });

  it('học đủ số mục trong ngày thì không còn mục mới nào', () => {
    const plan = session({ plannedNew: 20, completedNewToday: 20 });
    expect(plan.learn).toEqual([]);
  });

  it('củng cố lặp lại đúng những mục vừa học, không phải mẫu ngẫu nhiên', () => {
    const plan = session({ plannedNew: 7 });
    expect(plan.consolidate).toEqual(plan.learn);
  });

  it('hết mục chưa học thì chỉ lấy được những gì còn lại', () => {
    const plan = session({ plannedNew: 20, unseenItems: refs(3) });
    expect(plan.learn).toHaveLength(3);
  });

  it('thẻ đến hạn được xếp trước, giữ nguyên thứ tự ưu tiên', () => {
    const due = refs(5, 500);
    const plan = session({ dueCards: due });
    expect(plan.review).toEqual(due);
  });

  it('giới hạn hàng đợi ôn để nghỉ dài không tạo đống việc không làm nổi', () => {
    const plan = session({ dueCards: refs(400, 1000) });
    expect(plan.review).toHaveLength(MAX_REVIEWS_PER_SESSION);
    expect(plan.deferredReviews).toBe(400 - MAX_REVIEWS_PER_SESSION);
  });

  it('phần ôn bị hoãn vẫn được báo, không giấu đi', () => {
    const plan = session({ dueCards: refs(130, 1000), maxReviews: 50 });
    expect(plan.deferredReviews).toBe(80);
  });

  it('tắt giai đoạn nào thì giai đoạn đó rỗng', () => {
    const due = refs(10, 900);

    const noReview = session({ dueCards: due, stageFlags: { ...ALL_STAGES, review: false } });
    expect(noReview.review).toEqual([]);
    expect(noReview.deferredReviews).toBe(0);
    expect(noReview.learn).toHaveLength(20);

    const noLearn = session({ dueCards: due, stageFlags: { ...ALL_STAGES, learn: false } });
    expect(noLearn.learn).toEqual([]);
    expect(noLearn.consolidate).toEqual([]); // không học mới thì không có gì để củng cố
    expect(noLearn.review).toHaveLength(10);

    const noConsolidate = session({ stageFlags: { ...ALL_STAGES, consolidate: false } });
    expect(noConsolidate.consolidate).toEqual([]);
  });

  it('không có gì để ôn lẫn học thì phiên rỗng', () => {
    const plan = session({ dueCards: [], unseenItems: [], plannedNew: 20 });
    expect(plan.isEmpty).toBe(true);
    expect(plan.totalSteps).toBe(0);
  });

  it('tổng số bước bằng tổng ba giai đoạn', () => {
    const plan = session({ dueCards: refs(8, 800), plannedNew: 5 });
    expect(plan.totalSteps).toBe(8 + 5 + 5);
  });
});

describe('sessionProgress', () => {
  const plan = buildSession({
    dueCards: refs(3, 900),
    unseenItems: refs(4),
    plannedNew: 4,
    completedNewToday: 0,
    stageFlags: ALL_STAGES,
  });

  it('bắt đầu ở giai đoạn ôn tập', () => {
    expect(sessionProgress(plan, 0)).toMatchObject({
      stage: 'review',
      indexInStage: 1,
      stageTotal: 3,
      overallIndex: 1,
      overallTotal: 11,
      percent: 0,
    });
  });

  it('chuyển sang học mới khi hết phần ôn', () => {
    expect(sessionProgress(plan, 3)).toMatchObject({ stage: 'learn', indexInStage: 1, stageTotal: 4 });
  });

  it('chuyển sang củng cố khi hết phần học mới', () => {
    expect(sessionProgress(plan, 7)).toMatchObject({ stage: 'consolidate', indexInStage: 1 });
  });

  it('xong phiên thì đạt 100%', () => {
    expect(sessionProgress(plan, 11).percent).toBe(100);
    expect(sessionProgress(plan, 999).percent).toBe(100);
  });

  it('bỏ qua giai đoạn rỗng', () => {
    const onlyLearn = buildSession({
      dueCards: [],
      unseenItems: refs(3),
      plannedNew: 3,
      completedNewToday: 0,
      stageFlags: { review: true, learn: true, consolidate: false },
    });
    expect(sessionProgress(onlyLearn, 0).stage).toBe('learn');
  });
});

// ---------------------------------------------------------------------------

const ITEM: ExerciseItem = {
  itemId: 'item-1',
  stableKey: 'S0001',
  prompt: 'Guten Morgen!',
  answer: 'Chào buổi sáng!',
};

const POOL: ExerciseItem[] = [
  ITEM,
  { itemId: 'item-2', stableKey: 'S0002', prompt: 'Guten Tag', answer: 'Chào ông/bà' },
  { itemId: 'item-3', stableKey: 'S0003', prompt: 'Gute Nacht', answer: 'Chúc ngủ ngon' },
  { itemId: 'item-4', stableKey: 'S0004', prompt: 'Danke', answer: 'Cảm ơn' },
  { itemId: 'item-5', stableKey: 'S0005', prompt: 'Bitte', answer: 'Không có gì' },
];

describe('chọn dạng bài kiểm tra', () => {
  it('lần đầu gặp luôn là nhận biết, không bắt gõ lại', () => {
    expect(pickExerciseKind({ itemId: 'x', reps: 0, isConsolidation: false })).toBe('mcq');
  });

  it('lần thứ hai chuyển sang điền chỗ trống', () => {
    expect(pickExerciseKind({ itemId: 'x', reps: 1, isConsolidation: false })).toBe('cloze');
  });

  it('củng cố cuối ngày giữ nhẹ nhàng', () => {
    expect(pickExerciseKind({ itemId: 'x', reps: 5, isConsolidation: true })).toBe('mcq');
  });

  it('cùng một mục luôn ra cùng một dạng bài, kể cả khi tải lại trang', () => {
    const first = pickExerciseKind({ itemId: 'item-42', reps: 4, isConsolidation: false });
    const second = pickExerciseKind({ itemId: 'item-42', reps: 4, isConsolidation: false });
    expect(first).toBe(second);
  });
});

describe('trắc nghiệm', () => {
  it('có đáp án đúng nằm trong các lựa chọn', () => {
    const exercise = buildMultipleChoice(ITEM, POOL);
    expect(exercise.options).toContain(ITEM.answer);
    expect(exercise.options[exercise.correctIndex]).toBe(ITEM.answer);
  });

  it('tối đa 4 lựa chọn, không trùng nhau', () => {
    const exercise = buildMultipleChoice(ITEM, POOL);
    expect(exercise.options.length).toBeLessThanOrEqual(4);
    expect(new Set(exercise.options).size).toBe(exercise.options.length);
  });

  it('mồi nhử lấy từ cùng khóa học nên đều hợp lý', () => {
    const exercise = buildMultipleChoice(ITEM, POOL);
    const poolAnswers = POOL.map((p) => p.answer);
    for (const option of exercise.options) {
      expect(poolAnswers).toContain(option);
    }
  });

  it('không bao giờ lấy chính nó làm mồi nhử', () => {
    const exercise = buildMultipleChoice(ITEM, POOL);
    expect(exercise.options.filter((o) => o === ITEM.answer)).toHaveLength(1);
  });

  it('loại mồi nhử trùng nghĩa, vì hai lựa chọn giống nhau thì không trả lời được', () => {
    const duplicates: ExerciseItem[] = [
      ITEM,
      { itemId: 'a', stableKey: 'S9001', prompt: 'x', answer: 'Cảm ơn' },
      { itemId: 'b', stableKey: 'S9002', prompt: 'y', answer: 'Cảm ơn' },
      { itemId: 'c', stableKey: 'S9003', prompt: 'z', answer: 'Xin lỗi' },
    ];
    const exercise = buildMultipleChoice(ITEM, duplicates);
    expect(new Set(exercise.options).size).toBe(exercise.options.length);
  });

  it('tải lại trang vẫn ra đúng câu hỏi và thứ tự lựa chọn cũ', () => {
    expect(buildMultipleChoice(ITEM, POOL)).toEqual(buildMultipleChoice(ITEM, POOL));
  });

  it('không đủ mồi nhử thì chuyển sang thẻ lật thay vì ra câu hỏi hỏng', () => {
    expect(canBuildMultipleChoice(ITEM, [ITEM])).toBe(false);
    expect(buildExercise('mcq', ITEM, [ITEM]).kind).toBe('flip');
  });
});

describe('điền chỗ trống', () => {
  it('khoét đúng một từ và giữ lại phần còn lại', () => {
    const item: ExerciseItem = { ...ITEM, prompt: 'Ich lerne jeden Tag Deutsch' };
    const exercise = buildCloze(item)!;
    expect(exercise.question).toContain('____');
    expect(exercise.question.split('____')).toHaveLength(2);
    expect(item.prompt).toContain(exercise.expected);
  });

  it('bỏ dấu câu khỏi đáp án cần điền', () => {
    const exercise = buildCloze({ ...ITEM, prompt: 'Guten Morgen!' })!;
    expect(exercise.expected).not.toContain('!');
  });

  it('giữ nguyên ký tự Đức trong đáp án', () => {
    const exercise = buildCloze({ ...ITEM, prompt: 'Ich möchte einen Kaffee' })!;
    expect(/[äöüß]/.test(exercise.expected) || exercise.expected.length > 2).toBe(true);
  });

  it('câu một từ thì không khoét được, chuyển sang thẻ lật', () => {
    expect(buildCloze({ ...ITEM, prompt: 'Danke' })).toBeNull();
    expect(buildExercise('cloze', { ...ITEM, prompt: 'Danke' }, POOL).kind).toBe('flip');
  });

  it('cho kết quả giống nhau mỗi lần gọi', () => {
    const item = { ...ITEM, prompt: 'Wie geht es Ihnen heute' };
    expect(buildCloze(item)).toEqual(buildCloze(item));
  });
});

describe('chấm câu trả lời gõ tay', () => {
  it('bỏ qua khác biệt không quan trọng', () => {
    expect(checkTypedAnswer('guten morgen', 'Guten Morgen!')).toBe(true);
    expect(checkTypedAnswer('  Guten   Morgen  ', 'Guten Morgen')).toBe(true);
    expect(checkTypedAnswer('Guten Morgen.', 'Guten Morgen!')).toBe(true);
  });

  it('KHÔNG bỏ qua dấu tiếng Đức — "schon" khác "schön"', () => {
    expect(checkTypedAnswer('schon', 'schön')).toBe(false);
    expect(checkTypedAnswer('uber', 'über')).toBe(false);
    expect(checkTypedAnswer('Strasse', 'Straße')).toBe(false);
    expect(checkTypedAnswer('schön', 'schön')).toBe(true);
  });

  it('vẫn đúng khi gõ ký tự tổ hợp thay vì ký tự dựng sẵn', () => {
    // "schön" gõ bằng o + dấu móc, phải được chuẩn hoá về cùng một dạng.
    expect(checkTypedAnswer('schön', 'schön')).toBe(true);
  });

  it('từ sai thì sai', () => {
    expect(checkTypedAnswer('Guten Abend', 'Guten Morgen')).toBe(false);
    expect(checkTypedAnswer('', 'Guten Morgen')).toBe(false);
  });

  it('chuẩn hoá giữ nguyên dấu tiếng Việt', () => {
    expect(normalizeForComparison('Chào buổi sáng!')).toBe('chào buổi sáng');
  });
});

describe('độ gần của câu trả lời', () => {
  it('đúng hoàn toàn là 1', () => {
    expect(answerCloseness('Guten Morgen', 'Guten Morgen!')).toBe(1);
  });

  it('sai một ký tự thì vẫn rất gần', () => {
    expect(answerCloseness('Guten Morgan', 'Guten Morgen')).toBeGreaterThan(0.85);
  });

  it('hoàn toàn khác thì rất thấp', () => {
    expect(answerCloseness('xyz', 'Guten Morgen')).toBeLessThan(0.3);
  });

  it('bỏ trống thì bằng 0', () => {
    expect(answerCloseness('', 'Guten Morgen')).toBe(0);
  });
});

describe('xáo trộn có hạt giống', () => {
  it('cùng hạt giống cho cùng thứ tự', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffleWithSeed(values, 42)).toEqual(shuffleWithSeed(values, 42));
  });

  it('hạt giống khác cho thứ tự khác', () => {
    const values = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffleWithSeed(values, 1)).not.toEqual(shuffleWithSeed(values, 2));
  });

  it('không làm mất hay nhân bản phần tử nào', () => {
    const values = Array.from({ length: 50 }, (_, i) => i);
    expect([...shuffleWithSeed(values, 7)].sort((a, b) => a - b)).toEqual(values);
  });

  it('không sửa mảng gốc', () => {
    const values = [1, 2, 3];
    shuffleWithSeed(values, 5);
    expect(values).toEqual([1, 2, 3]);
  });

  it('seedFrom ổn định và phân tán', () => {
    expect(seedFrom('item-1')).toBe(seedFrom('item-1'));
    expect(seedFrom('item-1')).not.toBe(seedFrom('item-2'));
  });
});

describe('tồn đọng ôn tập khi chỉ nhận được một phần thẻ đến hạn', () => {
  /**
   * The session fetches at most MAX_REVIEWS_PER_SESSION due cards — a learner
   * back from a long absence can have more due than one request may return — so
   * the backlog figure comes from a database count, not from the array length.
   * Without that, the screen would claim "0 more due" while thousands waited.
   */
  const refs = (n: number, offset = 0): SessionItemRef[] =>
    Array.from({ length: n }, (_, i) => ({
      itemId: `i${offset + i}`,
      stableKey: `S${String(offset + i + 1).padStart(4, '0')}`,
      orderIndex: offset + i + 1,
    }));

  const base = {
    unseenItems: [],
    plannedNew: 0,
    completedNewToday: 0,
    stageFlags: { review: true, learn: true, consolidate: true },
  };

  it('báo đúng số thẻ hoãn lại dù chỉ nhận được 120 thẻ', () => {
    const plan = buildSession({ ...base, dueCards: refs(120), totalDueCards: 1800 });

    expect(plan.review).toHaveLength(120);
    expect(plan.deferredReviews).toBe(1680);
  });

  it('không có totalDueCards thì suy từ mảng, như trước đây', () => {
    const plan = buildSession({ ...base, dueCards: refs(200) });
    expect(plan.review).toHaveLength(120);
    expect(plan.deferredReviews).toBe(80);
  });

  it('không bao giờ báo ít hơn số thẻ thực sự nhận được', () => {
    // A count that lags behind the rows (a card fell due between the two
    // queries) must not produce a negative or understated backlog.
    const plan = buildSession({ ...base, dueCards: refs(150), totalDueCards: 10 });
    expect(plan.deferredReviews).toBe(30);
  });

  it('tắt bước ôn thì không báo tồn đọng', () => {
    const plan = buildSession({
      ...base,
      dueCards: refs(120),
      totalDueCards: 1800,
      stageFlags: { review: false, learn: true, consolidate: true },
    });
    expect(plan.review).toEqual([]);
    expect(plan.deferredReviews).toBe(0);
  });
});
