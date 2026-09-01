const STORAGE_KEY = "theme";

export function isLightTheme(): boolean {
  return document.documentElement.classList.contains("light");
}

// Shared by the sidebar toggle and the command palette's "Toggle theme"
// action so both ever only ever flip between the same two explicit classes
// the anti-flash script in layout.tsx already knows about.
export function toggleTheme(): boolean {
  const next = isLightTheme() ? "dark" : "light";
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private browsing / storage blocked — theme just won't persist.
  }
  return next === "light";
}
