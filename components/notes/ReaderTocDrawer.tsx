"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, X } from "lucide-react";
import { TableOfContents } from "@/components/ui/TableOfContents";
import { overlayMotion, uiMotion } from "@/lib/motion";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

type ReaderTocDrawerProps = {
  open: boolean;
  content: string;
  onClose: () => void;
};

export function ReaderTocDrawer({ open, content, onClose }: ReaderTocDrawerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [onClose, open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence initial={false}>
    {open && <motion.div key="reader-toc" className="reader-toc-drawer" data-print-hide inert={!open || undefined} aria-hidden={!open || undefined}>
      <motion.button variants={overlayMotion} initial="initial" animate="animate" exit="exit" transition={{ duration: reducedMotion ? 0 : uiMotion.duration.fast }} type="button" className="reader-toc-drawer__backdrop" aria-label="点击背景关闭目录" onClick={onClose} />
      <motion.aside initial={reducedMotion ? false : { x: "100%" }} animate={{ x: 0 }} exit={{ x: reducedMotion ? 0 : "100%" }} transition={reducedMotion ? { duration: 0 } : { duration: uiMotion.duration.page, ease: uiMotion.ease.standard }} ref={panelRef} className="reader-toc-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="reader-toc-title">
        <header className="reader-toc-drawer__header">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 id="reader-toc-title" className="font-headline text-base font-bold text-on-surface">文章目录</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="reader-toolbar__icon" aria-label="关闭目录" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="reader-toc-drawer__content">
          <TableOfContents content={content} onNavigate={onClose} />
        </div>
      </motion.aside>
    </motion.div>}
    </AnimatePresence>,
    document.body,
  );
}
