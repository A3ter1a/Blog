"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { uiMotion } from "@/lib/motion";

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: uiMotion.duration.standard, ease: uiMotion.ease.standard }}>
      {children}
    </MotionConfig>
  );
}
