"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { uiMotion } from "@/lib/motion";
import { useReadingPreferences } from "@/lib/useReadingPreferences";

export function MotionProvider({ children }: { children: ReactNode }) {
  const { preferences } = useReadingPreferences();
  const reducedMotion = preferences.motionPreference === "reduced"
    ? "always"
    : preferences.motionPreference === "full"
      ? "never"
      : "user";

  return (
    <MotionConfig reducedMotion={reducedMotion} transition={{ duration: uiMotion.duration.standard, ease: uiMotion.ease.standard }}>
      {children}
    </MotionConfig>
  );
}
