/**
 * Date-range filters arrive from an HTML <input type="date"> as a bare
 * 'YYYY-MM-DD'. Compared naively against a timestamptz column
 * (`col <= $to`) Postgres widens the string to MIDNIGHT of that day, so
 * everything recorded later the same day is silently excluded — that was the
 * "today's dispatches don't appear when I filter by today" bug, latent since
 * migration 20260725100001 widened dispatch_records.dispatch_date from DATE
 * to timestamptz. Always bound a range as
 *   [ 00:00 local on from_date , 00:00 local on to_date+1 )
 * i.e. inclusive lower bound, EXCLUSIVE upper bound one day later.
 *
 * The DB has no TZ set (postgres:16-alpine defaults to UTC) but the
 * warehouse and the UI are both IST, so the day boundary is pinned to
 * Asia/Kolkata — otherwise a dispatch between 00:00-05:30 IST would display
 * on one date but filter into the previous one, a subtler version of the
 * same complaint.
 *
 * `column` is interpolated, never parameterised: every call site passes a
 * hard-coded literal from source. Only the date VALUE is a bound parameter.
 */
export const APP_TIME_ZONE = 'Asia/Kolkata';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Guard for routes with no Zod query validation (e.g. reports). */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value);
}

/** Inclusive lower bound: 00:00:00 Asia/Kolkata on $param. */
export function dateFromCondition(column: string, param: number): string {
  return `${column} >= ($${param}::date::timestamp AT TIME ZONE '${APP_TIME_ZONE}')`;
}

/**
 * Exclusive upper bound: 00:00:00 Asia/Kolkata on the day AFTER $param —
 * so the whole of $param's day is included.
 */
export function dateToCondition(column: string, param: number): string {
  return `${column} < (($${param}::date + 1)::timestamp AT TIME ZONE '${APP_TIME_ZONE}')`;
}
