"use client";

import { useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Scan, X } from "lucide-react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { dialogMotion, overlayMotion, uiMotion } from "@/lib/motion";

/** The existing AI scan dialog shell, shared with background task results. */
export function AIScanDialog({ isOpen, onClose, children, title = "AI 扫描题目", closeOnBackdrop = true, elevated = false }: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  closeOnBackdrop?: boolean;
  elevated?: boolean;
}) {
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ isOpen, onClose, containerRef, initialFocusRef: closeRef });
  return (
    <AnimatePresence>
      {isOpen && <motion.div variants={overlayMotion} initial="initial" animate="animate" exit="exit" transition={{ duration: uiMotion.duration.fast, ease: uiMotion.ease.standard }}
        className={`fixed inset-0 ${elevated ? "z-[140]" : "z-50"} bg-black/40 backdrop-blur-sm`}
        onClick={() => { if (closeOnBackdrop) onClose(); }}>
        <motion.div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
          variants={dialogMotion} initial="initial" animate="animate" exit="exit" transition={uiMotion.spring.gentle}
          className="absolute inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-3xl md:h-auto max-h-[90vh] bg-surface-container-lowest rounded-2xl shadow-elevated flex flex-col overflow-hidden"
          onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
            <h2 id={titleId} className="text-lg font-bold text-on-surface font-headline flex items-center gap-2"><Scan className="w-5 h-5 text-primary" />{title}</h2>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭弹窗" className="motion-ui motion-interactive p-2 rounded-full hover:bg-surface-container-high"><X className="w-5 h-5 text-on-surface-variant" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  );
}
