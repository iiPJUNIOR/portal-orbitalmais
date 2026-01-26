"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const THEME_KEY = "theme";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "dark") return true;
      if (stored === "light") return false;
      // Default: dark
      return true;
    } catch {
      return true;
    }
  });

  // Apply theme when toggled
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (isDark) {
        root.classList.add("dark");
        localStorage.setItem(THEME_KEY, "dark");
      } else {
        root.classList.remove("dark");
        localStorage.setItem(THEME_KEY, "light");
      }
    } catch (err) {
      // no-op
    }
  }, [isDark]);

  // Ensure theme applied on first mount
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (isDark) root.classList.add("dark");
      else root.classList.remove("dark");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="Ativar modo escuro"
        title="Modo escuro"
        onClick={() => setIsDark(true)}
        className={`p-1 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
          isDark ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-gray-100/60 dark:hover:bg-white/5"
        }`}
      >
        <Moon className="h-4 w-4" />
      </button>

      <button
        aria-label="Ativar modo claro"
        title="Modo claro"
        onClick={() => setIsDark(false)}
        className={`p-1 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
          !isDark ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-gray-100/60 dark:hover:bg-white/5"
        }`}
      >
        <Sun className="h-4 w-4" />
      </button>
    </div>
  );
}