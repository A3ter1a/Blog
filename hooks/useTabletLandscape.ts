"use client";

import { useSyncExternalStore } from "react";

// Width alone also matches ordinary desktop browser windows such as 1280×720.
// Restrict the reader-specific layout to touch-first landscape devices so a
// desktop user keeps the global navigation while reading.
const TABLET_LANDSCAPE_QUERY = "(min-width: 768px) and (max-width: 1366px) and (orientation: landscape) and (pointer: coarse)";

export function useTabletLandscape(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(TABLET_LANDSCAPE_QUERY);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => window.matchMedia(TABLET_LANDSCAPE_QUERY).matches,
    () => false,
  );
}
