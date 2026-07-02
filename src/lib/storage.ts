import { promises as fs } from "fs";
import path from "path";
import type { TimecardRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "records.json");

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]", "utf-8");
  }
}

export async function listRecords(): Promise<TimecardRecord[]> {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  try {
    return JSON.parse(raw) as TimecardRecord[];
  } catch {
    return [];
  }
}

export async function saveRecord(record: TimecardRecord): Promise<void> {
  const records = await listRecords();
  records.unshift(record);
  await fs.writeFile(DATA_FILE, JSON.stringify(records, null, 2), "utf-8");
}

export async function deleteRecord(id: string): Promise<boolean> {
  const records = await listRecords();
  const next = records.filter((r) => r.id !== id);
  const changed = next.length !== records.length;
  if (changed) {
    await fs.writeFile(DATA_FILE, JSON.stringify(next, null, 2), "utf-8");
  }
  return changed;
}
