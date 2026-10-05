/**
 * Calendar dates, deliberately separate from instants.
 *
 * A learning plan is made of *days on a calendar*, not of moments in time. If
 * dates were `Date` objects, every arithmetic operation would silently depend on
 * the machine's zone and on DST: adding 24 hours across a DST boundary lands on
 * the wrong day. Here a date is the string `YYYY-MM-DD` and arithmetic runs on
 * day numbers, so the result is the same everywhere.
 *
 * Instants still exist — FSRS due times are real timestamps — but they are
 * converted to a calendar date *in the learner's zone* exactly once, here.
 */

declare const calendarDateBrand: unique symbol;

/** A date on a calendar, formatted `YYYY-MM-DD`. Build one via `toCalendarDate`. */
export type CalendarDate = string & { readonly [calendarDateBrand]: true };

/** ISO weekday: 1 = Monday ... 7 = Sunday. Matches `enrollments.rest_weekdays`. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isCalendarDate(value: string): value is CalendarDate {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Reject impossible days such as 2026-02-30, which Date would roll over.
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

export function toCalendarDate(value: string): CalendarDate {
  if (!isCalendarDate(value)) {
    throw new Error(`Ngày không hợp lệ: "${value}". Phải theo dạng YYYY-MM-DD.`);
  }
  return value;
}

/** Parse without throwing. Returns null for anything malformed. */
export function parseCalendarDate(value: string | null | undefined): CalendarDate | null {
  if (typeof value !== 'string') return null;
  return isCalendarDate(value) ? value : null;
}

/** Days since the Unix epoch. The integer every other operation works on. */
function toDayNumber(date: CalendarDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

function fromDayNumber(dayNumber: number): CalendarDate {
  const utc = new Date(dayNumber * MS_PER_DAY);
  const y = String(utc.getUTCFullYear()).padStart(4, '0');
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}` as CalendarDate;
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromDayNumber(toDayNumber(date) + Math.trunc(days));
}

/** `to - from`, in whole days. Negative when `to` precedes `from`. */
export function diffDays(from: CalendarDate, to: CalendarDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  // Lexicographic comparison is correct for zero-padded YYYY-MM-DD.
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: CalendarDate, b: CalendarDate): CalendarDate {
  return compareDates(a, b) <= 0 ? a : b;
}

export function maxDate(a: CalendarDate, b: CalendarDate): CalendarDate {
  return compareDates(a, b) >= 0 ? a : b;
}

export function isoWeekday(date: CalendarDate): IsoWeekday {
  // Day 0 of the epoch (1970-01-01) was a Thursday = ISO 4.
  const shifted = ((toDayNumber(date) + 3) % 7 + 7) % 7;
  return (shifted + 1) as IsoWeekday;
}

/** Inclusive range. Returns [] when `to` precedes `from`. */
export function eachDay(from: CalendarDate, to: CalendarDate): CalendarDate[] {
  const span = diffDays(from, to);
  if (span < 0) return [];
  const days: CalendarDate[] = [];
  for (let i = 0; i <= span; i += 1) days.push(addDays(from, i));
  return days;
}

/**
 * The learner's "today" for a given instant. Everything is stored UTC, and this
 * is the single place where a timestamp becomes a day on someone's calendar.
 * An unknown zone falls back to UTC rather than throwing, so a corrupt profile
 * value cannot break the dashboard.
 */
export function calendarDateInTimezone(instant: Date, timeZone: string): CalendarDate {
  try {
    // `en-CA` formats as YYYY-MM-DD, which is exactly the shape we want.
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
    return toCalendarDate(formatted);
  } catch {
    return toCalendarDate(instant.toISOString().slice(0, 10));
  }
}

/**
 * The instant at which a calendar day starts in a given zone. Used to turn
 * "cards due today" into a timestamp range for the database.
 *
 * Works by guessing UTC midnight and correcting by the zone's offset at that
 * moment, which keeps DST transitions correct without a timezone library.
 */
export function startOfDayInstant(date: CalendarDate, timeZone: string): Date {
  const guess = new Date(`${date}T00:00:00Z`);
  const offsetMs = zoneOffsetMs(guess, timeZone);
  const corrected = new Date(guess.getTime() - offsetMs);
  // One more pass: near a DST boundary the offset at the corrected instant can
  // differ from the offset at the guess.
  const refinedOffset = zoneOffsetMs(corrected, timeZone);
  return refinedOffset === offsetMs ? corrected : new Date(guess.getTime() - refinedOffset);
}

/** The instant immediately after the given calendar day ends, in that zone. */
export function endOfDayInstant(date: CalendarDate, timeZone: string): Date {
  return startOfDayInstant(addDays(date, 1), timeZone);
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant);

    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    return asUtc - instant.getTime();
  } catch {
    return 0;
  }
}
