# TimeScan

Scan a photo of a timecard, review the detected clock in/out punches, and save the total hours worked along with the employee name and date.

## How it works

1. **Scan** (`/`) — drop in or select a photo of a timecard. [Tesseract.js](https://github.com/naptha/tesseract.js) runs OCR in the browser to extract text, which is parsed line-by-line for punch times (`src/lib/timeParser.ts`). Each line's times are paired sequentially (clock-in/out, clock-in/out) to compute worked minutes, excluding gaps like lunch breaks.
2. **Review & edit** — the detected rows are shown in an editable table; labels and punch times can be corrected before saving, since OCR and the AM/PM heuristic aren't perfect.
3. **Save** — enter a name and date (and optional notes), then save. Records are persisted server-side to `data/records.json` via API routes under `src/app/api/records`.
4. **History** (`/history`) — view and delete previously saved timecards.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- OCR happens entirely client-side; no image data is sent to a server.
- Saved records live in `data/records.json` (git-ignored) — back this up if you need the history to persist across machines.
