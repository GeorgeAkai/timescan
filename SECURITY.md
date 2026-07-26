# Security notes

Scope of this review: the whole app as deployed. TimeScan has a small attack
surface. There is no database, no user accounts, no cookies or sessions, and
since records moved to `localStorage` there is no server-side write path at all.
That leaves exactly one server endpoint, `POST /api/scan`, and it is the thing
worth worrying about, because every call to it spends money.

## What was fixed

### 1. `/api/scan` could be driven by anyone (highest severity)

The endpoint was unauthenticated with no size limit and no rate limit. Anyone
who learned the URL could POST images in a loop and drain the OpenRouter
balance. This is a financial denial-of-service, not a data breach, but it was
the most exploitable issue in the app.

Now, in order, before the body is even read:

- **Same-origin check.** Requests carrying a cross-site `Sec-Fetch-Site`, or an
  `Origin` whose host is not ours, get a `403`.
- **Declared size check.** `Content-Length` above ~9 MB gets a `413`.
- **Rate limit.** 10 requests per minute per client IP, answered with `429` and
  a `Retry-After`.
- **Payload cap.** Base64 longer than ~8 M characters (about 6 MB of image) gets
  a `413`.
- **Encoding check.** The image must be clean standard base64. Anything else,
  including a `data:` prefix, gets a `400`.

Read the limits in the same order in [src/lib/limits.ts](src/lib/limits.ts) and
[src/lib/rateLimit.ts](src/lib/rateLimit.ts).

### 2. Upstream error text was echoed to the client

The catch-all returned `err.message` from the OpenAI SDK verbatim. Those
messages can carry request URLs, provider routing details, and header echoes.
Recognised cases (auth, credit, rate limit, bad JSON) still return a specific,
useful message; everything else is logged server-side and the caller gets a
generic failure.

### 3. Model output was trusted

The vision model is a third party, and its reply is rendered, summed, and
written to storage. A prompt-injected image could previously have returned
thousands of rows or megabyte-long strings. Output is now clamped to 60 rows,
12 times per row, 24-character labels, and 8-character times before it leaves
the route. Note this is a robustness bound, not an XSS fix: React escapes text
by default, so the strings were never an injection vector.

### 4. Stored records were unbounded and unvalidated

`localStorage` is editable by hand and by anything else on the origin, so
records are re-validated and re-clamped every time they are read, not only when
written. Records are capped at 500 per device, oldest dropped first.

### 5. No security headers

Added via [next.config.ts](next.config.ts): a Content Security Policy,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy` denying camera/microphone/geolocation,
`Cross-Origin-Opener-Policy`, and HSTS. `X-Powered-By` is off, and `/api/*` is
marked `no-store`.

### 6. Dependency CVEs

`npm audit` reported four high-severity issues. Resolved by upgrading Next to
16.2.12 and pinning `sharp` to 0.35.x (the patched libvips line) and `postcss`
to 8.5.23 through `overrides`. **Production dependencies now report zero
vulnerabilities** (`npm audit --omit=dev`).

Image optimization is also disabled, because `next/image` is unused and leaving
the optimizer on exposes `/_next/image`, which decodes images through
sharp/libvips.

## Known gaps

**`/api/scan` still has no authentication.** The same-origin check stops a
drive-by POST from another website, because browsers set `Sec-Fetch-Site` and
scripts cannot forge it. It does *not* stop `curl`, which simply sends no
`Origin` header. Anyone who knows the URL can still call the endpoint until the
rate limit bites.

**The rate limit is per-instance.** Counters live in process memory, so on a
serverless host the real ceiling is (instances x 10) per minute and a cold start
resets it. Treat it as a speed bump, not a billing control.

**The CSP allows `'unsafe-inline'` for scripts.** The App Router streams its
hydration payload through inline `<script>` tags, and the theme initialiser must
run before first paint. The alternative is nonces, which force every page to
render dynamically and give up static output and CDN caching. Given the app has
one inline script (a compile-time constant) and no HTML injection sink, that
trade was not worth making. If an HTML sink is ever added, switch to the
nonce recipe in the Next.js CSP guide using `proxy.ts`.

**One dev-only advisory remains.** `brace-expansion` reaches the tree through
ESLint. It is a lint-time denial of service, never shipped to production.
Overriding it to 5.x breaks `minimatch` (the export shape changed), so it is
left in place deliberately. `npm audit --omit=dev` is the number that matters.

**Saved timecards are unencrypted PII.** Employee names and hours sit in
`localStorage` in plain text, readable by anything running on the origin and by
anyone with the unlocked device.

**Configuration errors name their environment variables.** A misconfigured
deployment tells the caller which variable is missing. That is deliberate, since
it makes setup obvious, but it does disclose configuration to anonymous callers.

## Recommended next steps

Roughly in order of value:

1. **Put authentication in front of the app.** The single highest-value change.
   Vercel's built-in password protection or Deployment Protection needs no code.
   For per-user accounts, Auth.js is the usual choice. Everything below matters
   less once the app is not public.
2. **Set a hard spend cap at OpenRouter.** Independent of any application code,
   this is the only control that cannot be bypassed by a bug in the app. Use a
   dedicated key with a low credit ceiling.
3. **Move rate limiting to a shared store** (Vercel KV, Upstash, Redis) so the
   limit is global rather than per-instance.
4. **Enable the platform WAF** (Vercel Firewall or equivalent) for IP reputation
   and burst rules ahead of the function.
5. **Add a `SameSite=Strict` signed cookie issued by the page and required by
   the route** if you want to block non-browser callers without full auth. It is
   weaker than authentication, but it does stop naive `curl` replay.
6. **Consider not storing employee names**, or add a "clear all history" control,
   if devices are shared.

## Checked and found clean

- **XSS.** React escapes all interpolated text. The only
  `dangerouslySetInnerHTML` is the theme initialiser, built from a compile-time
  constant with no user input. No `innerHTML`, `eval`, `new Function`,
  `document.write`, or `srcdoc` anywhere in `src/`.
- **SSRF.** The only outbound URL is the hard-coded OpenRouter base URL. No
  user-controlled fetch target.
- **SQL/NoSQL injection.** No database.
- **Path traversal.** No filesystem writes remain; server-side record storage
  was removed.
- **CSRF.** No cookies, no sessions, no server-side state to forge against.
- **Open redirect.** No redirects driven by user input.
