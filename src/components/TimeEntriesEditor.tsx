"use client";

import { Fragment, useState } from "react";
import {
  formatMinutes,
  minutesFromColumnAlignedTimeStrings,
  sumRowMinutes,
} from "@/lib/timeParser";
import type { ParsedRow } from "@/lib/types";

interface TimeEntriesEditorProps {
  rows: ParsedRow[];
  onChange: (rows: ParsedRow[]) => void;
}

export default function TimeEntriesEditor({ rows, onChange }: TimeEntriesEditorProps) {
  // The number of IN/OUT column pairs is sized to whatever the data needs
  // (min 2, matching a typical timecard), plus any extra empty columns the
  // user has asked for via "+ Add shift column" — mirroring cards that print
  // a fixed IN/OUT/IN/OUT/IN/OUT grid per day.
  const [extraPairs, setExtraPairs] = useState(0);
  const dataPairs = rows.reduce(
    (max, row) => Math.max(max, Math.ceil(row.times.length / 2)),
    0
  );
  const pairCount = Math.max(2, dataPairs) + extraPairs;

  const updateCell = (rowId: string, index: number, value: string) => {
    onChange(
      rows.map((row) => {
        if (row.id !== rowId) return row;
        const times = [...row.times];
        while (times.length <= index) times.push("");
        times[index] = value;
        return { ...row, times, minutes: minutesFromColumnAlignedTimeStrings(times) };
      })
    );
  };

  const updateLabel = (rowId: string, label: string) => {
    onChange(rows.map((row) => (row.id === rowId ? { ...row, label } : row)));
  };

  const removeRow = (id: string) => {
    onChange(rows.filter((row) => row.id !== id));
  };

  const addRow = () => {
    onChange([
      ...rows,
      { id: crypto.randomUUID(), label: `${rows.length + 1}`, times: [], minutes: 0 },
    ]);
  };

  const total = sumRowMinutes(rows);
  const pairIndices = Array.from({ length: pairCount }, (_, i) => i);

  const emptyState = (
    <p className="rounded-xl border border-dashed border-border bg-surface px-3 py-6 text-center text-sm text-muted">
      No entries yet — scan a timecard or add a row manually.
    </p>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Desktop / tablet: dense spreadsheet-style table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface sm:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-primary">
            <tr>
              <th className="px-3 py-2 font-medium">Day</th>
              {pairIndices.map((i) => (
                <Fragment key={i}>
                  <th className="px-2 py-2 font-medium">In</th>
                  <th className="px-2 py-2 font-medium">Out</th>
                </Fragment>
              ))}
              <th className="px-3 py-2 font-medium">Total</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={pairCount * 2 + 3} className="px-3 py-6 text-center text-muted">
                  No entries yet — scan a timecard or add a row manually.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <input
                    value={row.label}
                    onChange={(e) => updateLabel(row.id, e.target.value)}
                    className="w-14 rounded-md border border-border bg-transparent px-2 py-1 text-center"
                  />
                </td>
                {pairIndices.map((i) => (
                  <Fragment key={i}>
                    <td className="px-1 py-2">
                      <input
                        value={row.times[2 * i] ?? ""}
                        onChange={(e) => updateCell(row.id, 2 * i, e.target.value)}
                        placeholder="8:00 AM"
                        className="w-24 rounded-md border border-border bg-transparent px-2 py-1"
                      />
                    </td>
                    <td className="px-1 py-2">
                      <input
                        value={row.times[2 * i + 1] ?? ""}
                        onChange={(e) => updateCell(row.id, 2 * i + 1, e.target.value)}
                        placeholder="5:00 PM"
                        className="w-24 rounded-md border border-border bg-transparent px-2 py-1"
                      />
                    </td>
                  </Fragment>
                ))}
                <td className="whitespace-nowrap px-3 py-2 font-mono">
                  {formatMinutes(row.minutes)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => removeRow(row.id)}
                    className="text-xs text-red-600 hover:underline dark:text-red-400"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one tap-friendly card per day, no horizontal scrolling */}
      <div className="flex flex-col gap-3 sm:hidden">
        {rows.length === 0 && emptyState}
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <span className="text-muted">Day</span>
                <input
                  value={row.label}
                  onChange={(e) => updateLabel(row.id, e.target.value)}
                  className="w-16 rounded-md border border-border bg-transparent px-2 py-2 text-center"
                />
              </label>
              <div className="flex items-center gap-3">
                <span className="font-mono text-base font-semibold text-primary">
                  {formatMinutes(row.minutes)}
                </span>
                <button
                  onClick={() => removeRow(row.id)}
                  aria-label={`Remove day ${row.label}`}
                  className="rounded-md p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M3 6h18M8 6V4h8v2m-1 0v14a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {pairIndices.map((i) => (
                <Fragment key={i}>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    In {pairCount > 1 ? i + 1 : ""}
                    <input
                      value={row.times[2 * i] ?? ""}
                      onChange={(e) => updateCell(row.id, 2 * i, e.target.value)}
                      placeholder="8:00 AM"
                      inputMode="text"
                      className="w-full rounded-md border border-border bg-transparent px-2 py-2 font-normal text-foreground"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    Out {pairCount > 1 ? i + 1 : ""}
                    <input
                      value={row.times[2 * i + 1] ?? ""}
                      onChange={(e) => updateCell(row.id, 2 * i + 1, e.target.value)}
                      placeholder="5:00 PM"
                      inputMode="text"
                      className="w-full rounded-md border border-border bg-transparent px-2 py-2 font-normal text-foreground"
                    />
                  </label>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={addRow}
            className="rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-muted"
          >
            + Add day
          </button>
          <button
            onClick={() => setExtraPairs((p) => p + 1)}
            className="rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-muted"
          >
            + Add shift column
          </button>
          {extraPairs > 0 && (
            <button
              onClick={() => setExtraPairs((p) => Math.max(0, p - 1))}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface-muted"
            >
              − Remove shift column
            </button>
          )}
        </div>
        <p className="rounded-lg bg-surface-muted px-4 py-2.5 text-center text-base font-semibold text-primary sm:text-left">
          Total: <span className="font-mono">{formatMinutes(total)}</span>
        </p>
      </div>
    </div>
  );
}
