// Records live in the browser's localStorage, on the user's own device.
//
// This used to write data/records.json on the server, which works in local dev
// but fails on serverless hosting (Vercel and friends give you a read-only
// filesystem, and any writable scratch space is per-instance and ephemeral).
// Keeping records client-side removes the failure and means timecards — which
// carry employee names and hours — never leave the device.

import type { ParsedRow, TimecardRecord } from "./types";

const STORAGE_KEY = "timescan.records.v1";

/** localStorage is unavailable during SSR/prerender, and in some privacy modes. */
function getStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Safari throws on access when cookies/storage are blocked entirely.
    return null;
  }
}

// crypto.randomUUID needs a secure context, which an http:// LAN address used
// for phone testing is not.
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is TimecardRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Partial<TimecardRecord>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.date === "string" &&
    Array.isArray(r.rows) &&
    typeof r.totalMinutes === "number"
  );
}

export function listRecords(): TimecardRecord[] {
  const store = getStore();
  if (!store) return EMPTY;

  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return EMPTY;

  try {
    const parsed: unknown = JSON.parse(raw);
    // Drop anything malformed rather than crashing the history page on data
    // written by an older version or by hand.
    return Array.isArray(parsed) ? parsed.filter(isRecord) : EMPTY;
  } catch {
    return EMPTY;
  }
}

// --- useSyncExternalStore plumbing -----------------------------------------
// The history page subscribes rather than reading in an effect, so it stays
// correct through hydration and picks up writes made in another tab.

const EMPTY: TimecardRecord[] = [];
const listeners = new Set<() => void>();
let snapshot: TimecardRecord[] | null = null;

function emitChange(): void {
  // Invalidate first: getSnapshot must return a new reference only when the
  // data actually changed, or React re-renders forever.
  snapshot = null;
  for (const listener of listeners) listener();
}

export function subscribeToRecords(onChange: () => void): () => void {
  listeners.add(onChange);
  // Fires when another tab writes to localStorage; never for our own writes.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) emitChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getRecordsSnapshot(): TimecardRecord[] {
  if (snapshot === null) snapshot = listRecords();
  return snapshot;
}

/** localStorage doesn't exist while prerendering, so the server sees no records. */
export function getServerRecordsSnapshot(): TimecardRecord[] {
  return EMPTY;
}

function writeAll(records: TimecardRecord[]): void {
  const store = getStore();
  if (!store) {
    throw new Error(
      "This browser isn't allowing local storage, so the timecard can't be saved. Check your privacy settings."
    );
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(records));
    // The storage event only fires in *other* tabs, so tell this one directly.
    emitChange();
  } catch {
    // Records are small (no images), so this realistically only happens when
    // the origin's whole quota is already full.
    throw new Error(
      "There's no room left in this browser's storage. Delete some saved timecards from the History page and try again."
    );
  }
}

export interface NewRecordInput {
  name: string;
  date: string;
  notes: string;
  rows: ParsedRow[];
  totalMinutes: number;
}

/** Saves a new record, newest first, and returns it. */
export function createRecord(input: NewRecordInput): TimecardRecord {
  const record: TimecardRecord = {
    id: newId(),
    name: input.name,
    date: input.date,
    notes: input.notes,
    rows: input.rows,
    totalMinutes: input.totalMinutes,
    createdAt: new Date().toISOString(),
  };

  writeAll([record, ...listRecords()]);
  return record;
}

export function deleteRecord(id: string): boolean {
  const records = listRecords();
  const next = records.filter((r) => r.id !== id);
  if (next.length === records.length) return false;
  writeAll(next);
  return true;
}
