import type { MetadataRoute } from "next";

// Lets the browser's "Add to Home Screen" / "Install app" flow pick up the
// TimeScan mark and launch without browser chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TimeScan",
    short_name: "TimeScan",
    description: "Scan timecards and automatically calculate total time worked.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f9fe",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android launchers crop icons to their own shape; this one keeps the
      // wordmark inside the safe zone so nothing gets clipped.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
