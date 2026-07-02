"use client";

import { useState } from "react";
import type { ParsedRow } from "@/lib/types";
import { sumRowMinutes } from "@/lib/timeParser";

interface SaveFormProps {
  rows: ParsedRow[];
  onSaved: () => void;
}

export default function SaveForm({ rows, onSaved }: SaveFormProps) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || !date) {
      setError("Name and date are required.");
      return;
    }
    if (rows.length === 0) {
      setError("Scan a timecard or add at least one row before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          date,
          notes,
          rows,
          totalMinutes: sumRowMinutes(rows),
        }),
      });
      if (!res.ok) throw new Error("Failed to save record");
      setName("");
      setNotes("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save record");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Employee name"
            className="rounded border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700"
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors enabled:hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40 dark:enabled:hover:bg-[#ccc]"
      >
        {saving ? "Saving…" : "Save timecard"}
      </button>
    </div>
  );
}
