"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { collapsibleMotion, uiMotion } from "@/lib/motion";

export function AnswerReveal({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          variants={collapsibleMotion}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: uiMotion.duration.reveal, ease: uiMotion.ease.emphasized }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
