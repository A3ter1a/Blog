"use client";

import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

type ConfirmDialogTone = "danger" | "primary";

const confirmToneClasses: Record<ConfirmDialogTone, string> = {
  danger: "bg-red-600 text-white hover:bg-red-700",
  primary: "bg-primary text-on-primary hover:bg-primary/90",
};

const iconToneClasses: Record<ConfirmDialogTone, string> = {
  danger: "bg-red-100 text-red-600",
  primary: "bg-primary/10 text-primary",
};

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "确认",
  confirmingLabel = "处理中",
  cancelLabel = "取消",
  tone = "danger",
  isWorking = false,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  isWorking?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [portalRoot] = useState<HTMLElement | null>(() => (
    typeof document === "undefined" ? null : document.body
  ));
  const ToneIcon = tone === "danger" ? AlertTriangle : CheckCircle2;

  const handleClose = () => {
    if (!isWorking) onClose();
  };

  const dialog = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(event) => {
            event.stopPropagation();
            handleClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-6 shadow-elevated"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconToneClasses[tone]}`}>
                <ToneIcon className="h-5 w-5" />
              </div>
              <h3 id={titleId} className="text-lg font-bold text-on-surface">
                {title}
              </h3>
            </div>

            <div id={descriptionId} className="mb-6 text-sm leading-6 text-on-surface-variant">
              {description}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isWorking}
                className="rounded-lg bg-surface-container-high px-4 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-40"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isWorking}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${confirmToneClasses[tone]}`}
              >
                {isWorking && <Loader2 className="h-4 w-4 animate-spin" />}
                {isWorking ? confirmingLabel : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return portalRoot ? createPortal(dialog, portalRoot) : null;
}
