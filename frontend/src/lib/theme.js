/** Theme persistence + application. Kept framework-agnostic. */

export const THEME_KEY = "golgol-theme";

/** Resolve the theme to use on load: saved choice → OS preference → light. */
export function getInitialTheme() {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Reflect a theme on <html> and update the browser UI colour. */
export function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#131318" : "#ffffff");
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}
