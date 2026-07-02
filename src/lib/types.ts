export interface ParsedRow {
  id: string;
  label: string;
  times: string[];
  minutes: number;
}

export interface TimecardRecord {
  id: string;
  name: string;
  date: string;
  notes: string;
  rows: ParsedRow[];
  totalMinutes: number;
  createdAt: string;
}
