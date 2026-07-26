import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy.
//
// script-src keeps 'unsafe-inline' because the App Router streams its hydration
// payload through inline <script> tags, and the theme initialiser in layout.tsx
// must run before first paint. Removing it means nonces, which force every page
// to render dynamically (no static output, no CDN caching), a poor trade for an
// app whose only inline script is a compile-time constant and which has no HTML
// injection sink. If that changes, switch to the nonce recipe in SECURITY.md.
//
// style-src needs 'unsafe-inline' for Tailwind's injected styles.
// img-src needs blob: and data: for the local photo preview.
// connect-src is 'self' only: the browser talks to /api/scan, and the call to
// OpenRouter happens server-side, so no third-party origin belongs here.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  // Deliberately no upgrade-insecure-requests: it rewrites same-origin
  // subresource requests to https, which breaks testing against a plain-http
  // LAN address from a phone. HSTS below already pins https on a real
  // deployment, where every request is https anyway.
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Clickjacking cover for browsers that predate frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app needs none of these; the live-camera path was removed and the
  // remaining capture button is a plain file input.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // next/image is unused, and leaving the optimizer on exposes /_next/image,
  // which decodes images through sharp/libvips. Turning it off removes that
  // request path entirely.
  images: { unoptimized: true },

  // Don't advertise the framework version to scanners.
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // Scan responses are per-request and should never be cached by a CDN
        // or shared proxy.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
