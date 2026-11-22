"use client";
/**
 * Current time in ms, refreshed every `everyMs`. null until mounted: Date.now() never runs during render
 * (Next 16 prerendering refuses unstable values), so time windows simply show nothing on the first paint.
 */
import { useEffect, useState } from "react";

/** @param {number} [everyMs] */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(/** @type {number | null} */ (null));
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [everyMs]);
  return now;
}
