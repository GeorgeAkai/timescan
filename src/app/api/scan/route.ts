import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// The Anthropic SDK needs the Node.js runtime (not Edge), and reading a
// timecard can take longer than the default serverless budget.
export const runtime = "nodejs";
export const maxDuration = 60;

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
- Read faint or partial stamps as best you can; it is better to include your best reading than to drop a legible punch. If a digit is genuinely unreadable, omit that row rather than guessing wildly.`;

function isConfigError(): boolean {
  return !process.env.ANTHROPIC_API_KEY;
}

export async function POST(request: Request) {
  if (isConfigError()) {
    return NextResponse.json(
      {
        error:
          "The scanner isn't configured: set the ANTHROPIC_API_KEY environment variable (in Vercel → Project → Settings → Environment Variables) and redeploy.",
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

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: SCAN_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: media, data: image },
            },
            {
              type: "text",
              text: "Extract every day's IN/OUT punch times from this timecard.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The image could not be processed. Try a clearer photo of the timecard." },
        { status: 422 }
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ rows: [] });
    }

    const parsed = JSON.parse(textBlock.text) as {
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
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "The ANTHROPIC_API_KEY is invalid or expired. Update it and redeploy." },
        { status: 503 }
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "The scanner is busy right now (rate limited). Please try again in a moment." },
        { status: 429 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to read the timecard";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
