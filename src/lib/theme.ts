// Theme preference, stored per device.
//
// The *preference* is one of light / dark / system; the *resolved* theme is
// always light or dark and lives in <html data-theme>. globals.css and
// Tailwind's dark: variant both key off that attribute, so this module is the
// only thing that decides which one is active.

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "timescan.theme";

/** Runs before first paint (inlined into <head>) so the page never flashes the
 *  wrong palette. Kept dependency-free and defensive — it executes before
 *  React and must never throw. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_KEY
)});if(p!=="light"&&p!=="dark"){p=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=p;}catch(e){document.documentElement.dataset.theme="light";}})();`;

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

function apply(preference: ThemePreference): void {
  document.documentElement.dataset.theme = resolve(preference);
}

const listeners = new Set<() => void>();

export function setPreference(preference: ThemePreference): void {
  try {
    if (preference === "system") {
      window.localStorage.removeItem(THEME_KEY);
    } else {
      window.localStorage.setItem(THEME_KEY, preference);
    }
  } catch {
    // Storage blocked — the theme still applies for this session.
  }
  apply(preference);
  for (const listener of listeners) listener();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Follow the OS while the preference is "system", and pick up changes made
  // in another tab.
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (getPreference() === "system") {
      apply("system");
      onChange();
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) {
      apply(getPreference());
      onChange();
    }
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getServerPreference(): ThemePreference {
  return "system";
}
