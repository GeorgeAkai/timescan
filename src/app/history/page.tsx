"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMinutes } from "@/lib/timeParser";
import type { TimecardRecord } from "@/lib/types";

export default function HistoryPage() {
  const [records, setRecords] = useState<TimecardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/records")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load records");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setRecords(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load records");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remove = async (id: string) => {
    const prev = records;
    setRecords(records.filter((r) => r.id !== id));
    const res = await fetch(`/api/records/${id}`, { method: "DELETE" });
    if (!res.ok) setRecords(prev);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!loading && records.length === 0 && (
        <p className="text-sm text-zinc-500">
          No saved timecards yet. Go scan one on the{" "}
          <Link href="/" className="underline">
            Scan
          </Link>{" "}
          page.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {records.map((record) => (
          <div
            key={record.id}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{record.name}</p>
                <p className="text-sm text-zinc-500">{record.date}</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-semibold">
                  {formatMinutes(record.totalMinutes)}
                </p>
                <button
                  onClick={() => remove(record.id)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
            {record.notes && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{record.notes}</p>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-500">
                {record.rows.length} entr{record.rows.length === 1 ? "y" : "ies"}
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {record.rows.map((row) => (
                  <li key={row.id} className="flex justify-between gap-3">
                    <span>{row.label}</span>
                    <span className="text-zinc-500">
                      {row.times.filter(Boolean).join(", ") || "—"}
                    </span>
                    <span className="font-mono">{formatMinutes(row.minutes)}</span>
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
