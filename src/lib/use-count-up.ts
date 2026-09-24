"use client";

import { useEffect, useRef, useState } from "react";

// Animates a displayed number from its previous value to `value` when it
// changes — purely cosmetic. The first render (including the server render)
// is always the real number, never 0: the old "count up from 0 on mount"
// version depended on requestAnimationFrame, which browsers pause in
// background tabs, so a dashboard opened in a new tab sat on "0" for every
// headline figure until someone focused it.
export function useCountUp(value: number, durationMs = 700): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;
    if (from === value) return;

    let raf: number;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Never leave the display stranded mid-animation if interrupted.
      setDisplay(value);
    };
  }, [value, durationMs]);

  return display;
}
