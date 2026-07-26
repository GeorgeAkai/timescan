"use client";

import { useSyncExternalStore } from "react";
import {
  getPreference,
  getServerPreference,
  setPreference,
  subscribe,
  type ThemePreference,
} from "@/lib/theme";

const ORDER: ThemePreference[] = ["system", "light", "dark"];

const LABEL: Record<ThemePreference, string> = {
  system: "Theme: follow device",
  light: "Theme: light",
  dark: "Theme: dark",
};

function Icon({ preference }: { preference: ThemePreference }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (preference === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (preference === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  );
}

export default function ThemeToggle() {
  const preference = useSyncExternalStore(subscribe, getPreference, getServerPreference);

  const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      title={LABEL[preference]}
      aria-label={`${LABEL[preference]}. Switch to ${next}.`}
      className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:border-primary/50 hover:text-primary"
    >
      <Icon preference={preference} />
    </button>
  );
}
