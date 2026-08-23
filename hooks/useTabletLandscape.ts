"use client";

import { useSyncExternalStore } from "react";

const TABLET_LANDSCAPE_QUERY = "(min-width: 768px) and (max-width: 1366px) and (orientation: landscape)";

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
