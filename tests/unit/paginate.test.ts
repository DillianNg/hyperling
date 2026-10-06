import { describe, expect, it } from 'vitest';
import { fetchAllRows } from '../../src/lib/data/paginate.js';

/**
 * The 1000-row response cap, pinned down.
 *
 * Supabase returns at most 1000 rows per request and does not say it truncated,
 * so a short read is indistinguishable from a complete one. That cost the
 * onboarding screen its B2 option: 1800 sentences came back as 1000, and B2 —
 * fully written — was reported as having no content yet.
 */

/** Stands in for PostgREST: serves `total` rows, never more than 1000 per call. */
function server(total: number, cap = 1000) {
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to, from + cap - 1, total - 1);
    const data = [];
    for (let i = from; i <= end; i += 1) data.push({ id: i });
    return { data, error: null };
  };
  return { page, calls };
}

describe('fetchAllRows', () => {
  it('lấy đủ 1800 dòng dù mỗi lần server chỉ trả tối đa 1000', async () => {
    const { page, calls } = server(1800);
    const all = await fetchAllRows<{ id: number }>(page);

    expect(all).toHaveLength(1800);
    expect(all[0]!.id).toBe(0);
    expect(all.at(-1)!.id).toBe(1799);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('dừng ngay sau một trang không đầy, không gọi thừa', async () => {
    const { page, calls } = server(450);
    expect(await fetchAllRows(page)).toHaveLength(450);
    expect(calls).toHaveLength(1);
  });

  it('bảng rỗng trả về mảng rỗng sau đúng một lần gọi', async () => {
    const { page, calls } = server(0);
    expect(await fetchAllRows(page)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('đúng ở ranh giới: 1000 dòng chẵn cần hai lần gọi mới biết đã hết', async () => {
    const { page, calls } = server(1000);
    expect(await fetchAllRows(page)).toHaveLength(1000);
    // A full page is indistinguishable from a truncated one, so one more call
    // is the only way to learn the table ended exactly there.
    expect(calls).toHaveLength(2);
  });

  it('trả về phần đã lấy được khi một trang lỗi, không ném và không treo', async () => {
    let n = 0;
    const all = await fetchAllRows<{ id: number }>(async (from, to) => {
      n += 1;
      if (n > 1) return { data: null, error: { message: 'mạng hỏng' } };
      const data = [];
      for (let i = from; i <= to; i += 1) data.push({ id: i });
      return { data, error: null };
    });

    expect(all).toHaveLength(1000);
    expect(n).toBe(2);
  });

  it('không lặp vô hạn nếu server luôn trả trang đầy', async () => {
    let n = 0;
    const all = await fetchAllRows(async (from, to) => {
      n += 1;
      const data = [];
      for (let i = from; i <= to; i += 1) data.push({ id: i });
      return { data, error: null };
    });

    expect(n).toBe(500);
    expect(all).toHaveLength(500_000);
  }, 30_000);
});
