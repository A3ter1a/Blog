"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowUpRight, Download, Loader2 } from "lucide-react";
import { AIScanDialog } from "@/components/ai-assistant/AIScanDialog";
import { AIExtractionResult } from "@/components/ai-assistant/AIExtractionResult";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { extractProblemOcrJobResult } from "@/lib/problem-ocr-contract";
import { getJobResultDestination } from "@/lib/job-result-navigation";
import type { ClientJob } from "@/lib/job-client";

export function JobResultDialog({ job, onClose, onLoad }: {
  job: ClientJob;
  onClose: () => void;
  onLoad: (id: string) => Promise<void>;
}) {
  const hasResult = Boolean(job.resultMarkdown || job.resultPayload);
  const [loading, setLoading] = useState(!hasResult);
  const [error, setError] = useState("");
  const restore = useCallback(async () => {
    setLoading(true);
    setError("");
    try { await onLoad(job.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "读取结果失败，请重试。"); }
    finally { setLoading(false); }
  }, [job.id, onLoad]);
  useEffect(() => {
    if (hasResult) return;
    const timer = window.setTimeout(() => { void restore(); }, 0);
    return () => window.clearTimeout(timer);
    // Keyed by task id: only fetch on opening, with an explicit retry on failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ocr = useMemo(() => job.type === "problem_ocr" ? extractProblemOcrJobResult(job.resultPayload) : null, [job.type, job.resultPayload]);
  const destination = getJobResultDestination(job);
  const continueReceiving = () => { if (destination) window.location.assign(destination); };
  const download = () => {
    const text = job.resultMarkdown || JSON.stringify(job.resultPayload, null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${job.title.replace(/[<>:"/\\|?*]/g, "-")}.${job.resultMarkdown ? "md" : "json"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <AIScanDialog isOpen onClose={onClose} elevated title={job.type === "problem_ocr" ? "AI 扫描题目" : job.title}>
      <p className="text-xs text-on-surface-variant/60">{job.type === "problem_ocr" ? `${job.title} · ` : ""}查看后继续领取；关闭弹窗不会丢失结果。</p>
      {loading && !hasResult && <p role="status" className="flex items-center gap-2 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" />正在恢复任务结果…</p>}
      {!loading && !hasResult && <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200"><p className="text-sm text-red-700">{error || job.error || "暂时无法读取成果，请重试。"}</p><button type="button" onClick={() => void restore()} className="mt-2 text-xs text-red-600 underline hover:text-red-800">重新获取结果</button></div>}
      {ocr && <>
        {ocr.warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700"><div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div className="space-y-1">{ocr.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div></div></div>}
        {ocr.extractedProblems.length > 0 ? <AIExtractionResult extractedProblems={ocr.extractedProblems} onContinue={continueReceiving} /> : <p className="text-sm text-on-surface-variant">没有提取到可用题目，请返回扫描页面核对。</p>}
      </>}
      {hasResult && job.type === "problem_ocr" && !ocr && <p role="alert" className="text-sm text-red-700">题目结果格式不完整，原始任务仍保留，请重新核对任务。</p>}
      {hasResult && job.type !== "problem_ocr" && <>
        {job.resultMarkdown ? <MarkdownContent content={job.resultMarkdown} /> : <><p className="text-sm text-on-surface-variant">{job.statusText}</p><details className="text-xs text-on-surface-variant"><summary>查看完整处理结果</summary><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(job.resultPayload, null, 2)}</pre></details></>}
        <div className="flex gap-2 pt-2"><button type="button" onClick={destination ? continueReceiving : download} className="motion-ui motion-interactive flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl editorial-gradient text-on-primary text-sm font-medium hover:opacity-90">{destination ? <ArrowUpRight className="w-4 h-4" /> : <Download className="w-4 h-4" />}{destination ? "继续领取" : "下载结果"}</button></div>
      </>}
    </AIScanDialog>
  );
}
