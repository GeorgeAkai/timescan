"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { createWorker, PSM } from "tesseract.js";
import { preprocessForOcr } from "@/lib/imagePreprocess";

interface UploadScannerProps {
  onExtract: (text: string) => void;
}

export default function UploadScanner({ onExtract }: UploadScannerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [enhancedPreviewUrl, setEnhancedPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);

  const setFile = useCallback((file: File) => {
    fileRef.current = file;
    setPreviewUrl(URL.createObjectURL(file));
    setEnhancedPreviewUrl(null);
    setStatus("idle");
    setProgress(0);
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

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const openCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // The <video> element only mounts once cameraOpen is true, so attach
      // the stream on the next tick when the ref is available.
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch (err) {
      setCameraError(
        err instanceof Error ? err.message : "Could not access the camera"
      );
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setFile(new File([blob], `timecard-${Date.now()}.jpg`, { type: "image/jpeg" }));
      stopCamera();
    }, "image/jpeg", 0.92);
  }, [setFile, stopCamera]);

  const scan = useCallback(async () => {
    const file = fileRef.current;
    if (!file) return;
    setStatus("scanning");
    setProgress(0);
    setError(null);

    try {
      const canvas = await preprocessForOcr(file);
      setEnhancedPreviewUrl(canvas.toDataURL("image/png"));

      const worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });
      // Timecards are scattered rows of short number groups rather than
      // prose paragraphs, so sparse-text mode reads them more reliably than
      // the default "auto" page segmentation.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const {
        data: { text },
      } = await worker.recognize(canvas);
      await worker.terminate();
      setStatus("done");
      onExtract(text);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to scan image");
    }
  }, [onExtract]);

  if (cameraOpen) {
    return (
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-xl border border-zinc-300 dark:border-zinc-700">
          <video ref={videoRef} autoPlay playsInline muted className="w-full" />
        </div>
        <div className="flex gap-3">
          <button
            onClick={capturePhoto}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Capture photo
          </button>
          <button
            onClick={stopCamera}
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragActive
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
        }`}
      >
        <input {...getInputProps()} />
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Timecard preview"
            className="max-h-64 rounded-md object-contain"
          />
        ) : (
          <p className="text-sm text-zinc-500">
            Drag & drop a timecard photo here, or click to select a file
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openCamera}
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Use camera
        </button>
        {/* Fallback for browsers where getUserMedia is unavailable (e.g. some
            in-app browsers): the capture attribute opens the native camera
            app directly on mobile. */}
        <button
          type="button"
          onClick={() => captureInputRef.current?.click()}
          className="text-sm text-zinc-500 underline sm:hidden"
        >
          Take photo instead
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

        <button
          onClick={scan}
          disabled={!previewUrl || status === "scanning"}
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors enabled:hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40 dark:enabled:hover:bg-[#ccc]"
        >
          {status === "scanning" ? `Scanning… ${progress}%` : "Scan timecard"}
        </button>
      </div>

      {cameraError && (
        <p className="text-sm text-red-600 dark:text-red-400">{cameraError}</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {enhancedPreviewUrl && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500">
            Show enhanced image used for OCR
          </summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enhancedPreviewUrl}
            alt="Contrast-enhanced timecard used for OCR"
            className="mt-2 max-h-96 rounded-md border border-zinc-200 object-contain dark:border-zinc-800"
          />
        </details>
      )}
    </div>
  );
}
