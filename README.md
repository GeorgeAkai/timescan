# TimeScan

Scan a photo of a timecard, review the detected clock in/out punches, and save the total hours worked along with the employee name and date.

## How it works

1. **Scan** (`/`) — drop in or select a photo of a timecard. The browser downscales the photo (`src/lib/imageResize.ts`) and posts it to `/api/scan`, which asks a vision model via [OpenRouter](https://openrouter.ai) to read the IN/OUT punch columns and return them as structured JSON. Each row's times are paired sequentially (clock-in/out, clock-in/out) to compute worked minutes, excluding gaps like lunch breaks (`src/lib/timeParser.ts`).
2. **Review & edit** — the detected rows are shown in an editable table; labels and punch times can be corrected before saving, since faint or angled stamps aren't always read perfectly.
3. **Save** — enter a name and date (and optional notes), then save. Records are persisted server-side to `data/records.json` via API routes under `src/app/api/records`.
4. **History** (`/history`) — view and delete previously saved timecards.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in OPENROUTER_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable              | Required | Purpose                                                                                |
| --------------------- | -------- | -------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`  | yes      | API key from [openrouter.ai/keys](https://openrouter.ai/keys).                           |
| `OPENROUTER_MODEL`    | yes      | Model id from [openrouter.ai/models](https://openrouter.ai/models). Must accept images.  |
| `OPENROUTER_MAX_TOKENS` | no     | Response token ceiling, default `4096`. See the credit note below.                       |
| `OPENROUTER_SITE_URL` | no       | Sent as `HTTP-Referer` for OpenRouter attribution.                                       |
| `OPENROUTER_APP_NAME` | no       | Sent as `X-Title` for OpenRouter attribution. Defaults to `TimeScan`.                    |

`/api/scan` returns a `503` with a readable message if either required variable is missing, so misconfiguration is obvious rather than silent.

OpenRouter reserves the full `max_tokens` against your credit balance *before* running the request, so a low-credit account can get a `402` even though the read itself is cheap. If that happens, either add credit or set `OPENROUTER_MAX_TOKENS` to something your balance covers (a card's JSON is well under 1000 tokens).

Pick a model that supports **both image input and structured outputs** (`response_format: json_schema`) for the most reliable reads. Models without structured-output support often still work — the route strips markdown fences and recovers the JSON object — but they fail more often.

## Notes

- The photo is sent to OpenRouter (and on to the model provider you select) for reading. Nothing is stored server-side except the records you explicitly save.
- Saved records live in `data/records.json` (git-ignored) — back this up if you need the history to persist across machines.
