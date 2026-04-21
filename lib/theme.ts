/**
 * Unified theme management utilities.
 */

export type ThemeMode = "light" | "dark" | "system";

/**
 * Get the stored theme from localStorage.
 */
export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem("theme") as ThemeMode) || "light";
}

/**
 * Save theme to localStorage.
 */
export function saveTheme(theme: ThemeMode): void {
  localStorage.setItem("theme", theme);
}

/**
 * Check if the system prefers dark mode.
 */
export function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Resolve the effective dark/light state given a theme mode.
 */
export function isDarkMode(theme: ThemeMode): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return systemPrefersDark();
}

/**
 * Apply a theme to the document element.
 */
export function applyTheme(theme: ThemeMode): void {
  const html = document.documentElement;
  const dark = isDarkMode(theme);
  if (dark) {
    html.classList.add("dark");
    html.classList.remove("light");
  } else {
    html.classList.add("light");
    html.classList.remove("dark");
  }
}

/**
 * Set the theme: save it, apply it, and notify other components.
 */
export function setTheme(theme: ThemeMode): void {
  saveTheme(theme);
  applyTheme(theme);
  // Notify other components listening for theme changes
  window.dispatchEvent(new Event("storage"));
}

/**
 * Toggle between light and dark (ignores system mode).
 */
export function toggleTheme(): ThemeMode {
  const current = getStoredTheme();
  const newTheme: ThemeMode = current === "dark" ? "light" : "dark";
  setTheme(newTheme);
  return newTheme;
}

/**
 * Sync the current theme state. Returns the effective dark state.
 * Call this from useEffect to initialize theme on mount.
 */
export function syncTheme(): boolean {
  const theme = getStoredTheme();
  applyTheme(theme);
  return isDarkMode(theme);
}
