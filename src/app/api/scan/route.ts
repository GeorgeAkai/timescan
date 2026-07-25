import { NextResponse } from "next/server";
import OpenAI from "openai";

// The OpenAI SDK needs the Node.js runtime (not Edge), and reading a
// timecard can take longer than the default serverless budget.
export const runtime = "nodejs";
export const maxDuration = 60;

// OpenRouter speaks the OpenAI chat-completions protocol, so the stock OpenAI
// SDK works against it once the base URL is pointed here.
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Shape returned to the client. Times are 24-hour "HH:MM", laid out as
// [in1, out1, in2, out2, ...] so a blank punch is an empty string that keeps
// the IN/OUT columns aligned — matching the grid editor's column model.
const SCAN_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          times: { type: "array", items: { type: "string" } },
        },
        required: ["label", "times"],
        additionalProperties: false,
      },
    },
  },
  required: ["rows"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You read employee time-clock cards and timesheets from a photo and return the punch times as structured data.

These are usually physical punch cards (uPunch / TrackMyPunch and similar) where each numbered row is one day and the times are stamped in a faint dot-matrix font, sometimes over a printed green grid, sometimes at a slight angle. Some cards are handwritten instead.

Rules:
- Each row of the IN/OUT punch grid becomes one row object. "label" is the row's day number or date exactly as printed (e.g. "8", "14", "1/12").
- "times" lists that row's punches left to right as [IN, OUT, IN, OUT, ...] in 24-hour "HH:MM" form, exactly as stamped. A card that stamps "13:54" is 1:54 PM — keep it as "13:54". Do not convert to AM/PM and do not invent seconds.
- If a row has an IN with no matching OUT (or vice-versa), put an empty string "" in the missing slot so IN/OUT stay column-aligned.
- Only read the machine IN/OUT punch columns. IGNORE: column headers (IN, OUT, REG, OT), the employee name, pay-period boxes, and especially the handwritten daily-hours / totals column on the right (values like "8", "7", "8.25", "10.5") — those are hour totals, not clock times.
- Skip any row that has no punches at all — do not emit empty rows.
- Read faint or partial stamps as best you can; it is better to include your best reading than to drop a legible punch. If a digit is genuinely unreadable, omit that row rather than guessing wildly.

Respond with JSON matching the required schema and nothing else — no prose, no markdown fences.`;

// Not every OpenRouter model honours json_schema response_format, and some
// wrap their JSON in markdown fences anyway. Recover the object rather than
// failing the whole scan on a stray fence.
function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // ignore and fall through to fence/brace extraction
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // ignore and fall through to brace extraction
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new SyntaxError("Model response was not JSON");
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  const parsedMaxTokens = Number(process.env.OPENROUTER_MAX_TOKENS);
  const maxTokens =
    Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0 ? parsedMaxTokens : 4096;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "The scanner isn't configured: set the OPENROUTER_API_KEY environment variable (in Vercel → Project → Settings → Environment Variables) and redeploy.",
      },
      { status: 503 }
    );
  }
  if (!model) {
    return NextResponse.json(
      {
        error:
          "The scanner isn't configured: set OPENROUTER_MODEL to a vision-capable OpenRouter model id (e.g. \"anthropic/claude-sonnet-4.5\") and redeploy.",
      },
      { status: 503 }
    );
  }

  let image: unknown;
  let mediaType: unknown;
  try {
    const body = await request.json();
    image = body?.image;
    mediaType = body?.mediaType;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof image !== "string" || image.length === 0) {
    return NextResponse.json({ error: "An image is required" }, { status: 400 });
  }
  const media =
    mediaType === "image/png" || mediaType === "image/webp" || mediaType === "image/gif"
      ? mediaType
      : "image/jpeg";

  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    // Optional attribution headers OpenRouter shows on its activity page.
    defaultHeaders: {
      ...(process.env.OPENROUTER_SITE_URL
        ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL }
        : {}),
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "TimeScan",
    },
  });

  try {
    const response = await client.chat.completions.create({
      model,
      // A full card is well under 1k tokens of JSON; the headroom is for
      // models that emit reasoning tokens first. OpenRouter reserves the full
      // amount against your credit balance up front, so accounts with a small
      // balance may need to lower this.
      max_tokens: maxTokens,
      response_format: {
        type: "json_schema",
        json_schema: { name: "timecard_scan", strict: true, schema: SCAN_SCHEMA },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${media};base64,${image}` },
            },
            {
              type: "text",
              text: "Extract every day's IN/OUT punch times from this timecard.",
            },
          ],
        },
      ],
    });

    const choice = response.choices[0];
    if (choice?.message?.refusal || choice?.finish_reason === "content_filter") {
      return NextResponse.json(
        { error: "The image could not be processed. Try a clearer photo of the timecard." },
        { status: 422 }
      );
    }
    if (choice?.finish_reason === "length") {
      return NextResponse.json(
        { error: "The timecard was too long to read in one pass. Try scanning fewer rows at a time." },
        { status: 502 }
      );
    }

    const text = choice?.message?.content;
    if (typeof text !== "string" || text.trim() === "") {
      return NextResponse.json({ rows: [] });
    }

    const parsed = parseModelJson(text) as {
      rows?: { label?: unknown; times?: unknown }[];
    };
    const rows = (parsed.rows ?? [])
      .map((r) => ({
        label: typeof r.label === "string" ? r.label : "",
        times: Array.isArray(r.times) ? r.times.map((t) => (typeof t === "string" ? t : "")) : [],
      }))
      .filter((r) => r.times.some((t) => t.trim() !== ""));

    return NextResponse.json({ rows });
  } catch (err) {
    if (err instanceof OpenAI.AuthenticationError) {
      return NextResponse.json(
        { error: "The OPENROUTER_API_KEY is invalid or expired. Update it and redeploy." },
        { status: 503 }
      );
    }
    // OpenRouter reserves max_tokens against your balance before running, so a
    // low-credit account gets a 402 even though the read itself is cheap.
    if (err instanceof OpenAI.APIError && err.status === 402) {
      return NextResponse.json(
        {
          error:
            "Your OpenRouter account doesn't have enough credit for this request. Add credit at https://openrouter.ai/settings/credits, or lower OPENROUTER_MAX_TOKENS (currently " +
            maxTokens +
            ").",
        },
        { status: 402 }
      );
    }
    if (err instanceof OpenAI.RateLimitError) {
      return NextResponse.json(
        { error: "The scanner is busy right now (rate limited). Please try again in a moment." },
        { status: 429 }
      );
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: `The model (${model}) did not return readable JSON. Try a model that supports structured outputs and image input.`,
        },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to read the timecard";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
