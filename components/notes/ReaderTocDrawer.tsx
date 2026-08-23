"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { BookOpen, X } from "lucide-react";
import { TableOfContents } from "@/components/ui/TableOfContents";

type ReaderTocDrawerProps = {
  open: boolean;
  content: string;
  onClose: () => void;
};

export function ReaderTocDrawer({ open, content, onClose }: ReaderTocDrawerProps) {
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

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="reader-toc-drawer" data-print-hide>
      <button type="button" className="reader-toc-drawer__backdrop" aria-label="点击背景关闭目录" onClick={onClose} />
      <aside ref={panelRef} className="reader-toc-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="reader-toc-title">
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
      </aside>
    </div>,
    document.body,
  );
}
