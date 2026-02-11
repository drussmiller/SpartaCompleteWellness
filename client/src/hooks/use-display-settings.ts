import { useState, useEffect, useCallback } from "react";

export type FontSize = "small" | "medium" | "large" | "extra-large";
export type ThemeMode = "light" | "dark";

const FONT_SIZE_KEY = "display-font-size";
const THEME_KEY = "display-theme";

function getStoredFontSize(): FontSize {
  if (typeof window === "undefined") return "medium";
  return (localStorage.getItem(FONT_SIZE_KEY) as FontSize) || "medium";
}

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem(THEME_KEY) as ThemeMode) || "light";
}

function applyFontSize(size: FontSize) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("font-small", "font-medium", "font-large", "font-extra-large");
  root.classList.add(`font-${size}`);
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function initDisplaySettings() {
  if (typeof document === "undefined") return;
  applyFontSize(getStoredFontSize());
  applyTheme(getStoredTheme());
}

export function useDisplaySettings() {
  const [fontSize, setFontSizeState] = useState<FontSize>(getStoredFontSize);
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme);

  useEffect(() => {
    applyFontSize(fontSize);
    applyTheme(theme);
  }, [fontSize, theme]);

  const setFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
    localStorage.setItem(FONT_SIZE_KEY, size);
    applyFontSize(size);
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    localStorage.setItem(THEME_KEY, mode);
    applyTheme(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
  }, [theme, setTheme]);

  return {
    fontSize,
    setFontSize,
    theme,
    setTheme,
    toggleTheme,
    isDark: theme === "dark",
  };
}
