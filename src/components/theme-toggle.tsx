"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isLightTheme, toggleTheme } from "@/lib/theme";

// Dark is the default (see globals.css :root) — this only ever needs to
// read back whichever explicit choice the inline anti-flash script in
// layout.tsx already applied to <html> before hydration.
export function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    setIsLight(isLightTheme());
  }, []);

  function toggle() {
    setIsLight(toggleTheme());
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
    >
      {isLight ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
    </Button>
  );
}
