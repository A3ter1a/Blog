"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clipboard, Download, FileDiff, ShieldCheck, X } from "lucide-react";
import {
  canApplyMarkdownReviewProposal,
  type MarkdownReviewProposal,
  validateMarkdownReviewProposal,
} from "@/lib/markdown-review-proposal";
import { dialogMotion, overlayMotion, uiMotion } from "@/lib/motion";

interface MarkdownReviewProposalDialogProps {
  proposal: MarkdownReviewProposal | null;
  currentMarkdown: string;
  onClose: () => void;
  onApply: (proposal: MarkdownReviewProposal) => void;
}

function downloadProposal(proposal: MarkdownReviewProposal) {
  const blob = new Blob([JSON.stringify(proposal, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${proposal.proposalId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function MarkdownReviewProposalDialog({
  proposal,
  currentMarkdown,
  onClose,
  onApply,
}: MarkdownReviewProposalDialogProps) {
  const [feedback, setFeedback] = useState("");
  const validation = useMemo(
    () => proposal ? validateMarkdownReviewProposal(proposal) : { valid: false, reasons: ["proposal_missing"] },
    [proposal],
  );
  const canApply = proposal ? canApplyMarkdownReviewProposal(proposal, currentMarkdown) : false;

  const copyReviewedMarkdown = async () => {
    if (!proposal) return;
    await navigator.clipboard.writeText(proposal.reviewedMarkdown);
    setFeedback("已复制精确 Markdown");
  };

  return (
    <AnimatePresence>
      {proposal && (
        <motion.div
          variants={overlayMotion}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: uiMotion.duration.reveal, ease: uiMotion.ease.standard }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-scrim/55 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
        >
          <motion.section
            variants={dialogMotion}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: uiMotion.duration.reveal, ease: uiMotion.ease.emphasized }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="markdown-review-proposal-title"
            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-outline-variant/20 px-5 py-4 sm:px-6">
              <div>
                <p className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary">
                  <FileDiff className="h-4 w-4" />
                  AI 提案 · 尚未写入正文
                </p>
                <h2 id="markdown-review-proposal-title" className="text-xl font-semibold text-on-surface">
                  公式与标题审阅结果
                </h2>
                <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                  {proposal.summary || "已生成修复建议。请确认后再应用到编辑器。"}
                </p>
              </div>
              <button type="button" onClick={onClose} className="icon-button" aria-label="关闭审阅结果">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              <div className="mb-5 grid gap-3 sm:grid-cols-4">
                <ReviewStat label="模型" value={proposal.model} />
                <ReviewStat label="分段" value={`${proposal.chunks.length} 段`} />
                <ReviewStat label="字符变化" value={`${proposal.sourceLength.toLocaleString()} → ${proposal.reviewedLength.toLocaleString()}`} />
                <ReviewStat label="捕获状态" value={validation.valid ? "精确响应已校验" : "记录不完整"} />
              </div>

              {!canApply && (
                <div className="mb-5 rounded-xl border border-error/25 bg-error-container/35 px-4 py-3 text-sm leading-6 text-on-error-container">
                  {validation.valid
                    ? "审阅期间正文已经变化。为防止覆盖新内容，请关闭本提案并重新审阅。"
                    : `提案记录校验失败：${validation.reasons.join("、")}`}
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <MarkdownPanel label="原文 Markdown" value={proposal.sourceMarkdown} checksum={proposal.sourceChecksum} />
                <MarkdownPanel label="建议 Markdown" value={proposal.reviewedMarkdown} checksum={proposal.reviewedChecksum} />
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary-container/30 px-4 py-3 text-sm leading-6 text-on-primary-container">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>下载记录会保留精确原文、AI 返回值、分段信息与双 checksum；关闭窗口不会修改正文。</span>
              </div>
            </div>

            <footer className="flex flex-col gap-3 border-t border-outline-variant/20 bg-surface-container-low px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span className="min-h-5 text-xs text-on-surface-variant" aria-live="polite">{feedback}</span>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={copyReviewedMarkdown} className="control-button h-10 px-4 text-sm">
                  <Clipboard className="h-4 w-4" />复制建议
                </button>
                <button type="button" onClick={() => downloadProposal(proposal)} className="control-button h-10 px-4 text-sm">
                  <Download className="h-4 w-4" />下载审阅记录
                </button>
                <button
                  type="button"
                  disabled={!canApply}
                  onClick={() => onApply(proposal)}
                  className="control-button control-button-primary h-10 px-4 text-sm"
                >
                  <Check className="h-4 w-4" />确认并应用
                </button>
              </div>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ReviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2.5">
      <p className="text-[11px] font-medium text-on-surface-variant">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-on-surface" title={value}>{value}</p>
    </div>
  );
}

function MarkdownPanel({ label, value, checksum }: { label: string; value: string; checksum: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-on-surface">
        {label}
        <code className="font-mono text-[10px] font-normal text-on-surface-variant" title={checksum}>
          {checksum.slice(0, 12)}…
        </code>
      </span>
      <textarea
        readOnly
        value={value}
        spellCheck={false}
        className="field-control h-72 w-full resize-y px-3 py-3 font-mono text-xs leading-5"
      />
    </label>
  );
}
