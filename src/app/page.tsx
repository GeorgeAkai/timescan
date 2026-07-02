"use client";

import { useState } from "react";
import Link from "next/link";
import UploadScanner from "@/components/UploadScanner";
import TimeEntriesEditor from "@/components/TimeEntriesEditor";
import SaveForm from "@/components/SaveForm";
import { parseTimecardText } from "@/lib/timeParser";
import type { ParsedRow } from "@/lib/types";

export default function Home() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [savedMessage, setSavedMessage] = useState(false);
  const [rawText, setRawText] = useState<string | null>(null);

  const handleExtract = (text: string) => {
    setRows(parseTimecardText(text));
    setRawText(text);
    setSavedMessage(false);
  };

  const handleSaved = () => {
    setSavedMessage(true);
    setRows([]);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">TimeScan</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Scan a timecard photo, review the detected punch times, and save the total.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">1. Scan timecard</h2>
        <UploadScanner onExtract={handleExtract} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">2. Review & edit entries</h2>
        {rawText !== null && rows.length === 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            No punch times were recognized in the scan. Check the raw text below —
            if it looks garbled, try rescanning with better lighting/focus, or add
            rows manually.
          </p>
        )}
        <TimeEntriesEditor rows={rows} onChange={setRows} />
        {rawText !== null && (
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-500">
              Show raw OCR text
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              {rawText || "(no text detected)"}
            </pre>
          </details>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">3. Save</h2>
        <SaveForm rows={rows} onSaved={handleSaved} />
        {savedMessage && (
          <p className="text-sm text-green-600 dark:text-green-400">
            Saved! View it on the{" "}
            <Link href="/history" className="underline">
              History
            </Link>{" "}
            page.
          </p>
        )}
      </section>
    </div>
  );
}
