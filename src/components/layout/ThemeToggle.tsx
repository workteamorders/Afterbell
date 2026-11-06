"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type Theme = "light" | "dark";
const KEY = "ab-theme";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStored(): Theme | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

/** Preferensi tema disimpan di localStorage (dibungkus try/catch); tanpa itu aplikasi mengikuti sistem. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readStored() ?? systemTheme());
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      icon={theme === "dark" ? "sun" : "moon"}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          window.localStorage.setItem(KEY, next);
        } catch {
          /* tema tetap berlaku untuk sesi ini */
        }
        setTheme(next);
      }}
    >
      {`Switch to ${next} theme`}
    </Button>
  );
}
