"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { pageMotion, uiMotion } from "@/lib/motion";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={pathname}
        variants={pageMotion}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
        className="flex-1"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
