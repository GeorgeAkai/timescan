"use client";

import { useState } from "react";
import type { ParsedRow } from "@/lib/types";
import { sumRowMinutes } from "@/lib/timeParser";
import { createRecord } from "@/lib/storage";

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

  const handleSave = () => {
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
      createRecord({
        name: name.trim(),
        date,
        notes,
        rows,
        totalMinutes: sumRowMinutes(rows),
      });
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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Employee name"
            className="rounded-md border border-border bg-transparent px-3 py-2 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-border bg-transparent px-3 py-2 font-normal"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-md border border-border bg-transparent px-3 py-2 font-normal"
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-colors enabled:hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:self-start sm:py-2.5"
      >
        {saving ? "Saving…" : "Save timecard"}
      </button>
    </div>
  );
}
