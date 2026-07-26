export interface ParsedRow {
  id: string;
  label: string;
  times: string[];
  minutes: number;
}

export type PaymentStatus = "paid" | "unpaid";

export interface TimecardRecord {
  id: string;
  name: string;
  date: string;
  notes: string;
  rows: ParsedRow[];
  totalMinutes: number;
  createdAt: string;
  /** Records saved before this field existed read back as "unpaid". */
  paymentStatus: PaymentStatus;
}
