"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { formatMinutes } from "@/lib/timeParser";
import {
  deleteRecord,
  getRecordsSnapshot,
  getServerRecordsSnapshot,
  setPaymentStatus,
  subscribeToRecords,
} from "@/lib/storage";
import type { PaymentStatus } from "@/lib/types";

// This page is prerendered, so the first paint has no records either way.
// Tracking hydration keeps the "nothing saved yet" message from flashing
// before localStorage has actually been read.
const subscribeToNothing = () => () => {};

const PAYMENT_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: "unpaid", label: "Not yet paid" },
  { value: "paid", label: "Paid" },
];

export default function HistoryPage() {
  const records = useSyncExternalStore(
    subscribeToRecords,
    getRecordsSnapshot,
    getServerRecordsSnapshot
  );
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
  const [error, setError] = useState<string | null>(null);

  const remove = (id: string) => {
    try {
      deleteRecord(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete record");
    }
  };

  const updatePayment = (id: string, status: PaymentStatus) => {
    try {
      setPaymentStatus(id, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update payment status");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">History</h1>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {hydrated && records.length === 0 && (
        <p className="text-sm text-muted">
          No saved timecards yet. Go scan one on the{" "}
          <Link href="/" className="font-medium text-primary underline">
            Scan
          </Link>{" "}
          page.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {records.map((record) => (
          <div
            key={record.id}
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/50 sm:p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{record.name}</p>
                <p className="text-sm text-muted">{record.date}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className="font-mono text-lg font-semibold text-primary">
                  {formatMinutes(record.totalMinutes)}
                </p>
                <button
                  onClick={() => remove(record.id)}
                  className="-mr-2 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </div>
            {record.notes && (
              <p className="text-sm text-muted">{record.notes}</p>
            )}

            <div
              className="inline-flex self-start rounded-full border border-border bg-surface-muted p-0.5"
              role="group"
              aria-label={`Payment status for ${record.name}`}
            >
              {PAYMENT_OPTIONS.map(({ value, label }) => {
                const active = record.paymentStatus === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updatePayment(record.id, value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted hover:text-primary"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer py-1 text-muted transition-colors hover:text-primary">
                {record.rows.length} entr{record.rows.length === 1 ? "y" : "ies"}
              </summary>
              <ul className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
                {record.rows.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3">
                    <span className="shrink-0 font-medium">{row.label}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">
                      {row.times.filter(Boolean).join(", ") || "-"}
                    </span>
                    <span className="shrink-0 font-mono">{formatMinutes(row.minutes)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
