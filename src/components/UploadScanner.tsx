"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { prepareImageForVision } from "@/lib/imageResize";
import { minutesFromColumnAlignedTimeStrings } from "@/lib/timeParser";
import type { ParsedRow } from "@/lib/types";

interface UploadScannerProps {
  onScanned: (rows: ParsedRow[]) => void;
}

export default function UploadScanner({ onScanned }: UploadScannerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [enhancedPreviewUrl, setEnhancedPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);

  const setFile = useCallback((file: File) => {
    fileRef.current = file;
    setPreviewUrl(URL.createObjectURL(file));
    setEnhancedPreviewUrl(null);
    setStatus("idle");
    setError(null);
  }, []);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (file) setFile(file);
    },
    [setFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
  });

  const scan = useCallback(async () => {
    const file = fileRef.current;
    if (!file) return;
    setStatus("scanning");
    setError(null);

    try {
      // Downscale the colour photo and hand it to the vision model, which
      // reads the dot-matrix punch stamps directly - no client-side OCR.
      const { base64, mediaType, dataUrl } = await prepareImageForVision(file);
      setEnhancedPreviewUrl(dataUrl);

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to read the timecard");
      }

      const rows: ParsedRow[] = (data.rows ?? []).map(
        (r: { label?: string; times?: string[] }) => {
          const times = Array.isArray(r.times) ? r.times : [];
          return {
            id: crypto.randomUUID(),
            label: typeof r.label === "string" && r.label ? r.label : "",
            times,
            minutes: minutesFromColumnAlignedTimeStrings(times),
          };
        }
      );
      setStatus("done");
      onScanned(rows);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to scan image");
    }
  }, [onScanned]);

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragActive
            ? "border-primary bg-surface-muted"
            : "border-border bg-surface hover:border-primary/60 hover:bg-surface-muted"
        }`}
      >
        <input {...getInputProps()} />
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Timecard preview"
            className="max-h-64 max-w-full rounded-md object-contain"
          />
        ) : (
          <p className="text-sm text-muted">
            Drag &amp; drop a timecard photo here, or click to select a file
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          onClick={scan}
          disabled={!previewUrl || status === "scanning"}
          className="order-1 w-full rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-colors enabled:hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 sm:order-none sm:w-auto sm:py-2.5"
        >
          {status === "scanning" ? "Scanning…" : "Scan timecard"}
        </button>
        {/* The capture attribute opens the native camera app, which shoots at
            the phone's full sensor resolution - sharper than an in-app live
            stream, and the only high-res path on iOS, which lacks ImageCapture.
            Mobile only; desktop uses the dropzone above. */}
        <button
          type="button"
          onClick={() => captureInputRef.current?.click()}
          className="w-full rounded-full border border-border bg-surface px-5 py-3 text-sm font-medium transition-colors hover:bg-surface-muted sm:hidden"
        >
         Use Camera 
        </button>
        <input
          ref={captureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {enhancedPreviewUrl && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted transition-colors hover:text-primary">
            Show image sent to the scanner
          </summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enhancedPreviewUrl}
            alt="Timecard image sent to the scanner"
            className="mt-2 max-h-96 max-w-full rounded-md border border-border object-contain"
          />
        </details>
      )}
    </div>
  );
}
