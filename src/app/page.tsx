"use client";

import { useState } from "react";
import Link from "next/link";
import UploadScanner from "@/components/UploadScanner";
import TimeEntriesEditor from "@/components/TimeEntriesEditor";
import SaveForm from "@/components/SaveForm";
import { parseTimecardText } from "@/lib/timeParser";
import type { ParsedRow } from "@/lib/types";

function StepHeading({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-sm font-medium text-foreground">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {step}
      </span>
      {children}
    </h2>
  );
}

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
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">TimeScan</h1>
        <p className="mt-2 text-sm text-muted">
          Scan a timecard photo, review the detected punch times, and save the total.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <StepHeading step={1}>Scan timecard</StepHeading>
        <UploadScanner onExtract={handleExtract} />
      </section>

      <section className="flex flex-col gap-3">
        <StepHeading step={2}>Review &amp; edit entries</StepHeading>
        {rawText !== null && rows.length === 0 && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            No punch times were recognized in the scan. Check the raw text below —
            if it looks garbled, try rescanning with better lighting/focus, or add
            rows manually.
          </p>
        )}
        <TimeEntriesEditor rows={rows} onChange={setRows} />
        {rawText !== null && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted transition-colors hover:text-primary">
              Show raw OCR text
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-muted p-3 text-xs">
              {rawText || "(no text detected)"}
            </pre>
          </details>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <StepHeading step={3}>Save</StepHeading>
        <SaveForm rows={rows} onSaved={handleSaved} />
        {savedMessage && (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
            Saved! View it on the{" "}
            <Link href="/history" className="font-medium text-primary underline">
              History
            </Link>{" "}
            page.
          </p>
        )}
      </section>
    </div>
  );
}
