import type { ParsedRow } from "./types";

// The separator accepts [:.;,] because small/dot-matrix fonts (common on
// physical time-clock cards) are frequently OCR'd with the colon misread as
// a period, semicolon, or comma. But "." and "," are also how decimal totals
// and currency are written (e.g. a "TOTAL HRS" column reading "8.00", or
// "$25.00"), so outside of a real ":" a match is only trusted when an AM/PM
// marker confirms it's actually a clock time - see isTrustedTimeMatch below.
const TIME_TOKEN =
  /\b(\d{1,2})([:.;,])(\d{2})\s*([AaPp]\.?\s?[Mm]\.?)?\b/g;
const TIME_TOKEN_SINGLE =
  /(\d{1,2})([:.;,])(\d{2})\s*([AaPp]\.?\s?[Mm]\.?)?/;

function isTrustedTimeMatch(separator: string, meridiem: string | undefined): boolean {
  return separator === ":" || Boolean(meridiem);
}

// A bare row number printed at the start of a line, e.g. digital timecards
// (uPunch and similar) that number each day 1–31 in its own column. Must be
// followed by whitespace (not a colon) so it's never confused with the hour
// of a time token like "8:00".
const ROW_INDEX_LABEL = /^([1-9]|[12]\d|3[01])(?=\s)/;

// Matches, in preference order: a glued "day-of-month + weekday code" label
// as printed by physical time-clock cards (e.g. "7MO", "10TH", "12SA"), a
// spelled-out weekday, or a slash/dash date.
const LABEL_TOKEN =
  /\b\d{1,2}[A-Za-z]{2,3}\b|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Mo|Tu|We|Th|Fr|Sa|Su)[a-z]*\.?\b|\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/i;

/**
 * Resolves a possibly-ambiguous 12-hour punch (no AM/PM marker) into minutes
 * since midnight. Rather than guessing AM/PM from position alone - which
 * breaks for cards that put each shift on its own line - this anchors off
 * the previous punch in the same row and picks whichever of the AM/PM
 * readings keeps the sequence moving forward in time, since punches within
 * a row are always in chronological order.
 */
export function resolveHourMinute(
  hour: number,
  minute: number,
  meridiem: string | undefined,
  previousMinutes: number | null
): number | null {
  if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59 || hour > 23) {
    return null;
  }

  const marker = meridiem?.toLowerCase().replace(/[.\s]/g, "");
  if (marker === "am") return (hour % 12) * 60 + minute;
  if (marker === "pm") return (hour % 12) * 60 + minute + 12 * 60;
  if (hour > 12) return hour * 60 + minute; // already unambiguous 24h time

  const amCandidate = (hour % 12) * 60 + minute;
  const pmCandidate = amCandidate + 12 * 60;

  if (previousMinutes === null) {
    // No prior punch to anchor against: the first punch in a row is assumed
    // to be a morning clock-in (the overwhelmingly common case) unless it's
    // literally "12:xx", which is read as noon. This is only a default -
    // afternoon/evening shift rows may need manual correction in the editor,
    // which an explicit "PM" always overrides.
    return hour === 12 ? pmCandidate : amCandidate;
  }
  if (amCandidate >= previousMinutes) return amCandidate;
  if (pmCandidate >= previousMinutes) return pmCandidate;
  // Both readings are earlier than the previous punch - pick the later one.
  return Math.max(amCandidate, pmCandidate);
}

/** Sums sequential (in,out) pairs from a list of minute-since-midnight values. */
export function sumPairedMinutes(times: number[]): number {
  let total = 0;
  for (let i = 0; i + 1 < times.length; i += 2) {
    const diff = times[i + 1] - times[i];
    if (diff > 0) total += diff;
  }
  return total;
}

/** Resolves a row's punch strings into minutes-since-midnight, anchored off an optional carried-over previous punch. */
function resolveRowPunches(
  timeStrings: string[],
  startingPrevious: number | null
): { punches: number[]; last: number | null } {
  const punches: number[] = [];
  let previous = startingPrevious;
  timeStrings.forEach((raw) => {
    const match = TIME_TOKEN_SINGLE.exec(raw);
    if (!match || !isTrustedTimeMatch(match[2], match[4])) return;
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[3], 10);
    const resolved = resolveHourMinute(hour, minute, match[4], previous);
    if (resolved !== null) {
      punches.push(resolved);
      previous = resolved;
    }
  });
  return { punches, last: previous };
}

/**
 * Resolves a column-aligned punch list (used by the grid editor, where index
 * 2i/2i+1 are always the same IN/OUT column pair, even if a cell is blank)
 * into total worked minutes. Unlike the flat/sequential OCR path, a blank or
 * unparsed cell doesn't shift its neighbors - only a pair where both sides
 * are present contributes to the total.
 */
export function minutesFromColumnAlignedTimeStrings(timeStrings: string[]): number {
  const resolved: (number | null)[] = [];
  let previous: number | null = null;
  timeStrings.forEach((raw) => {
    const match = TIME_TOKEN_SINGLE.exec(raw);
    if (!match || !isTrustedTimeMatch(match[2], match[4])) {
      resolved.push(null);
      return;
    }
    const value = resolveHourMinute(
      parseInt(match[1], 10),
      parseInt(match[3], 10),
      match[4],
      previous
    );
    resolved.push(value);
    if (value !== null) previous = value;
  });

  let total = 0;
  for (let i = 0; i + 1 < resolved.length; i += 2) {
    const inMinutes = resolved[i];
    const outMinutes = resolved[i + 1];
    if (inMinutes !== null && outMinutes !== null && outMinutes > inMinutes) {
      total += outMinutes - inMinutes;
    }
  }
  return total;
}

/** Extracts candidate timecard rows (label + punch times) from raw OCR text. */
export function parseTimecardText(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: ParsedRow[] = [];

  lines.forEach((line, lineIdx) => {
    const times: string[] = [];
    let m: RegExpExecArray | null;
    TIME_TOKEN.lastIndex = 0;
    while ((m = TIME_TOKEN.exec(line)) !== null) {
      const [, hourStr, separator, minuteStr, rawMeridiem] = m;
      if (!isTrustedTimeMatch(separator, rawMeridiem)) continue;
      // Normalize to "H:MM AM/PM" so the separator is never a comma - the
      // editor UI joins/splits this list on commas.
      const meridiem = rawMeridiem ? ` ${rawMeridiem.replace(/[.\s]/g, "").toUpperCase()}` : "";
      times.push(`${hourStr}:${minuteStr}${meridiem}`);
    }
    if (times.length === 0) return;

    const rowIndexMatch = ROW_INDEX_LABEL.exec(line);
    const labelMatch = LABEL_TOKEN.exec(line);
    const label = rowIndexMatch
      ? rowIndexMatch[0]
      : labelMatch
        ? labelMatch[0]
        : `Row ${rows.length + 1}`;

    rows.push({ id: `${lineIdx}-${crypto.randomUUID()}`, label, times, minutes: 0 });
  });

  // Some time-clock cards print each shift on its own line, repeating the
  // same day label (e.g. "10TH 6:55 11:05" then "10TH 3:36 11:30"). Chaining
  // the AM/PM resolution across consecutive rows that share a label lets an
  // ambiguous afternoon punch like "3:36" resolve relative to the morning
  // row's last punch instead of guessing AM in isolation.
  let previous: number | null = null;
  let previousLabel: string | null = null;
  rows.forEach((row) => {
    if (row.label !== previousLabel) previous = null;
    const { punches, last } = resolveRowPunches(row.times, previous);
    row.minutes = sumPairedMinutes(punches);
    previous = last;
    previousLabel = row.label;
  });

  return rows;
}

export function sumRowMinutes(rows: ParsedRow[]): number {
  return rows.reduce((sum, r) => sum + (Number.isFinite(r.minutes) ? r.minutes : 0), 0);
}

export function formatMinutes(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(totalMinutes));
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${sign}${hours}h ${minutes.toString().padStart(2, "0")}m`;
}
