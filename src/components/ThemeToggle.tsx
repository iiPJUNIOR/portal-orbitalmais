"use client";

import React, { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Sun, Moon } from "lucide-react";

/**
 * ThemeToggle
 * - Persistência: localStorage key 'theme' ('dark' | 'light')
 * - Comportamento: por solicitação, inicia em dark quando não há preferência salva.
 * - Aplica a classe 'dark' ao document.documentElement para ativar as variáveis CSS existentes.
 */

const THEME_KEY = "theme";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "dark") return true;
      if (stored === "light") return false;
      // Default: dark (solicitado pelo usuário)
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

  // Ensure theme applied on first mount (helps when JS rehydrates)
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (isDark) root.classList.add("dark");
      else root.classList.remove("dark");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-3">
      <Moon className="h-4 w-4 text-muted-foreground" />
      <Switch checked={isDark} onCheckedChange={(v) => setIsDark(!!v)} />
      <Sun className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}