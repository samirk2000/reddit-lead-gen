"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "leadgen-theme";

/**
 * Toggles `dark` on <html>. Persists in localStorage.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = stored === "dark" || (!stored && prefersDark);
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    setReady(true);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    setDark(next);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggle}
      className={className}
      aria-label={dark ? "Modo claro" : "Modo oscuro"}
      disabled={!ready}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="hidden sm:inline">{dark ? "Claro" : "Oscuro"}</span>
    </Button>
  );
}
