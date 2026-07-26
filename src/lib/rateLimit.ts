// Per-caller rate limiting for /api/scan.
//
// IMPORTANT: this is in-process. On a serverless host each instance keeps its
// own counters, so the effective limit is (instances x LIMIT) and a cold start
// resets it. That makes this a speed bump against casual abuse, not a control
// you can rely on for billing protection. For a hard guarantee put a shared
// store (Vercel KV / Upstash / Redis) or the platform firewall in front. See
// SECURITY.md.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

/** Stops the map from growing without bound if many distinct IPs show up. */
const MAX_TRACKED_CLIENTS = 10_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry. Only meaningful when blocked. */
  retryAfterSeconds: number;
}

export function checkRateLimit(clientKey: string): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(clientKey);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_CLIENTS) sweep(now);
    buckets.set(clientKey, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Best-effort caller identity. x-forwarded-for is spoofable in general, but on
 *  Vercel and similar proxies the left-most entry is set by the platform. It is
 *  only ever used as a rate-limit key, never for authorization. */
export function clientKeyFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
