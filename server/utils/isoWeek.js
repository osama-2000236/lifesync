// Pure ISO week helpers (UTC Mon–Sun). Shared by reports + insight engine.
// Scheduling also resolves the user's local calendar day via IANA timezone.

/** True if `timeZone` is a valid IANA zone for Intl. */
const isValidIanaTimeZone = (timeZone) => {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timeZone.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

/**
 * Calendar Y-M-D in `timeZone` for instant `at`, returned as a Date at UTC noon.
 * Noon avoids DST edge flips when feeding ISO week math. Invalid zone → UTC.
 */
const localCalendarDateUtc = (at = new Date(), timeZone = 'UTC') => {
  const instant = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(instant.getTime())) {
    return new Date(Date.UTC(1970, 0, 1, 12, 0, 0));
  }
  const tz = isValidIanaTimeZone(timeZone) ? String(timeZone).trim() : 'UTC';
  // en-CA → YYYY-MM-DD in the target zone (no parsing ambiguity).
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const y = get('year');
  const m = get('month');
  const d = get('day');
  if (!y || !m || !d) {
    return new Date(Date.UTC(
      instant.getUTCFullYear(),
      instant.getUTCMonth(),
      instant.getUTCDate(),
      12, 0, 0,
    ));
  }
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
};

/** ISO week key YYYY-Www from the calendar date of `date` (UTC components). */
const isoWeekKey = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday in current week decides the year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

/** Monday–Sunday (UTC) date-only bounds for a Date in that week. */
const weekBoundsUtc = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() - day + 1);
  const start = new Date(d);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  const toDateOnly = (x) => x.toISOString().slice(0, 10);
  return { period_start: toDateOnly(start), period_end: toDateOnly(end), week_key: isoWeekKey(date) };
};

/**
 * ISO week for the user's local calendar day at instant `at`.
 * e.g. Sunday 22:00Z is already Monday in Asia/Hebron → next ISO week.
 */
const weekBoundsForTimeZone = (at = new Date(), timeZone = 'UTC') => {
  const localDay = localCalendarDateUtc(at, timeZone);
  return { ...weekBoundsUtc(localDay), at_local: localDay, timezone: isValidIanaTimeZone(timeZone) ? String(timeZone).trim() : 'UTC' };
};

/**
 * Inclusive Mon–Sun UTC windows for insight queries.
 * this: [start, endExclusive)  prev: prior Mon–Sun
 */
const isoWeekQueryWindows = (at = new Date()) => {
  const { period_start, period_end, week_key } = weekBoundsUtc(at);
  const start = new Date(`${period_start}T00:00:00.000Z`);
  const endExclusive = new Date(`${period_end}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  return {
    week_key,
    period_start,
    period_end,
    start,
    endExclusive,
    prevStart,
    prevEnd: start,
    // Date objects for AISummary / freeze (end = last instant of Sunday)
    period: { start, end: new Date(endExclusive.getTime() - 1) },
  };
};

module.exports = {
  isoWeekKey,
  weekBoundsUtc,
  weekBoundsForTimeZone,
  isoWeekQueryWindows,
  localCalendarDateUtc,
  isValidIanaTimeZone,
};
