"use client";

import { useEffect, useState } from "react";

// Animates a displayed integer from 0 up to `value` on mount — purely
// cosmetic. The number it settles on is always exactly `value`; nothing
// reads the mid-animation frames, so this never risks showing a wrong
// figure, only a briefly-outdated one on its way to the real number.
export function useCountUp(value: number, durationMs = 700): number {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return display;
}
