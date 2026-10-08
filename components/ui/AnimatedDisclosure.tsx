"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { collapsibleMotion, uiMotion } from "@/lib/motion";

type DisclosureProps = {
  open: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
};

function DisclosureContent({ children, id, className }: Omit<DisclosureProps, "open">) {
  const present = useIsPresent();
  const reducedMotion = usePrefersReducedMotion();

  return (
    <motion.div
      id={id}
      data-motion-disclosure
      inert={!present || undefined}
      aria-hidden={!present || undefined}
      variants={collapsibleMotion}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: reducedMotion ? 0 : uiMotion.duration.page, ease: uiMotion.ease.standard }}
      className={`overflow-hidden ${className ?? ""}`}
    >
      {children}
    </motion.div>
  );
}

// Keep closing content present for the exit, but remove it from keyboard interaction immediately.
export function AnimatedDisclosure({ open, ...props }: DisclosureProps) {
  return (
    <AnimatePresence initial={false}>
      {open && <DisclosureContent key="content" {...props} />}
    </AnimatePresence>
  );
}
