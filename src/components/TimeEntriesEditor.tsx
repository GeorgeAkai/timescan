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

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
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
                <td colSpan={pairCount * 2 + 3} className="px-3 py-6 text-center text-zinc-400">
                  No entries yet — scan a timecard or add a row manually.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-3 py-2">
                  <input
                    value={row.label}
                    onChange={(e) => updateLabel(row.id, e.target.value)}
                    className="w-14 rounded border border-zinc-300 bg-transparent px-2 py-1 text-center dark:border-zinc-700"
                  />
                </td>
                {pairIndices.map((i) => (
                  <Fragment key={i}>
                    <td className="px-1 py-2">
                      <input
                        value={row.times[2 * i] ?? ""}
                        onChange={(e) => updateCell(row.id, 2 * i, e.target.value)}
                        placeholder="8:00 AM"
                        className="w-24 rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                      />
                    </td>
                    <td className="px-1 py-2">
                      <input
                        value={row.times[2 * i + 1] ?? ""}
                        onChange={(e) => updateCell(row.id, 2 * i + 1, e.target.value)}
                        placeholder="5:00 PM"
                        className="w-24 rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <button
            onClick={addRow}
            className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            + Add day
          </button>
          <button
            onClick={() => setExtraPairs((p) => p + 1)}
            className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            + Add shift column
          </button>
          {extraPairs > 0 && (
            <button
              onClick={() => setExtraPairs((p) => Math.max(0, p - 1))}
              className="text-sm text-zinc-500 hover:underline"
            >
              − Remove shift column
            </button>
          )}
        </div>
        <p className="text-base font-semibold">
          Total: <span className="font-mono">{formatMinutes(total)}</span>
        </p>
      </div>
    </div>
  );
}
