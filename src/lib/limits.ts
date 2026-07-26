// Hard bounds on everything that crosses a trust boundary.
//
// Two untrusted inputs reach this app: the image a caller POSTs to /api/scan,
// and the JSON a third-party vision model sends back. Neither is under our
// control, so both get clamped before they touch memory, storage, or the DOM.

/** Largest base64 payload /api/scan will accept (~6 MB of image bytes).
 *  The client already downscales to <=2000px, which lands far below this. */
export const MAX_IMAGE_BASE64_CHARS = 8_000_000;

/** Rejects an oversized body from its Content-Length before it is buffered. */
export const MAX_REQUEST_BYTES = 9_000_000;

/** A timecard has at most 31 days; the ceiling is deliberately generous. */
export const MAX_ROWS = 60;

/** Punches per row. Four is typical (in/out/in/out). */
export const MAX_TIMES_PER_ROW = 12;

/** Row labels are day numbers or short dates. */
export const MAX_LABEL_CHARS = 24;

/** "HH:MM" is 5; the slack absorbs stray whitespace before trimming. */
export const MAX_TIME_CHARS = 8;

/** Fields the user types on the save form. */
export const MAX_NAME_CHARS = 120;
export const MAX_NOTES_CHARS = 2_000;
export const MAX_DATE_CHARS = 32;

/** Saved timecards per device, oldest dropped first. Keeps one origin's
 *  localStorage from being filled without bound. */
export const MAX_STORED_RECORDS = 500;

/** Standard base64. Rejects data: prefixes, whitespace, and anything that
 *  would make the upstream data URL malformed. */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function isLikelyBase64(value: string): boolean {
  // A stray newline or "data:image/png;base64," prefix fails here, which is
  // what we want: the caller should send raw base64 only.
  return value.length % 4 === 0 && BASE64_RE.test(value);
}

/** Trims and hard-truncates untrusted text. */
export function clampText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed;
}
