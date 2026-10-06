import { rows } from './rows';

/**
 * Reading every row of a table, past PostgREST's response cap.
 *
 * A plain `select()` against Supabase returns at most `db-max-rows` rows —
 * 1000 on this project — and says nothing about having truncated. That is
 * silent data loss, not an error: counts come out short, "already seen" sets
 * come back incomplete, and nothing in the response distinguishes a full answer
 * from a clipped one.
 *
 * The German course crossed that line the moment it grew to 1800 sentences, and
 * every learner's card_states and review_logs cross it with use. So any query
 * whose result set grows with the content or with time goes through here.
 *
 * Prefer a count over a fetch where a count is what is wanted: `select(col,
 * { count: 'exact', head: true })` is computed by Postgres and transfers no rows
 * at all.
 */

/** Rows per request. Must not exceed the server's cap, or pages overlap silently. */
const PAGE_SIZE = 1000;

/**
 * Guard against an unbounded loop if a page ever returns full but the range
 * stops advancing. 500 pages is 500k rows — far beyond anything this app
 * produces, and still a bounded failure rather than a hung request.
 */
const MAX_PAGES = 500;

export interface PageResult {
  data: unknown;
  error: unknown;
}

/**
 * Fetches every row by paging `range()` until a short page arrives.
 *
 * `page` must build a *fresh* query each call — PostgREST builders are
 * single-use, so reusing one silently returns the first page forever.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult>,
): Promise<T[]> {
  const all: T[] = [];

  for (let index = 0; index < MAX_PAGES; index += 1) {
    const from = index * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);

    // A failed page would otherwise look exactly like the end of the table.
    if (error) return all;

    const batch = rows<T>(data);
    all.push(...batch);
    if (batch.length < PAGE_SIZE) return all;
  }

  return all;
}
