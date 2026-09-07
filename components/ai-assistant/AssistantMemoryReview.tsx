"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { normalizeAssistantMemories, type AssistantMemoryCandidate, type AssistantMemoryStatus } from "@/lib/assistant-memory";
import { useToast } from "@/components/ui/Toast";

const labels: Record<AssistantMemoryStatus, string> = { proposed: "待确认", accepted: "已确认", rejected: "未采用" };

export function AssistantMemoryReview() {
  const [memories, setMemories] = useState<AssistantMemoryCandidate[]>([]);
  const [filter, setFilter] = useState<AssistantMemoryStatus>("proposed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const toast = useToast();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetchWithAuth("/api/assistant/memories", { cache: "no-store", signal });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.memories)) throw new Error(payload.error || "候选记忆暂时无法读取，请重试");
      if (!signal?.aborted) setMemories(normalizeAssistantMemories(payload.memories));
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "读取失败，请重试");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  const decide = async (candidateId: string, decision: "accepted" | "rejected") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(candidateId);
    setError("");
    try {
      const response = await fetchWithAuth("/api/assistant/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", candidateId, decision }),
      });
      const payload = await response.json();
      const memory = normalizeAssistantMemories([payload.memory])[0];
      if (!response.ok || !memory) throw new Error(payload.error || "没有保存成功，请重试");
      setMemories((current) => current.map((item) => item.id === candidateId ? memory : item));
      toast.success(decision === "accepted" ? "已确认，将供后续回答参考" : "已标为未采用");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const visible = memories.filter((memory) => memory.status === filter);
  return <div className="mx-auto max-w-4xl space-y-4">
    <div className="flex flex-wrap gap-2" aria-label="记忆状态筛选">
      {(Object.keys(labels) as AssistantMemoryStatus[]).map((status) => <button key={status} type="button" aria-pressed={filter === status} onClick={() => setFilter(status)} className={`control-button min-h-11 px-4 text-sm ${filter === status ? "control-button-selected" : ""}`}>{labels[status]} · {memories.filter((memory) => memory.status === status).length}</button>)}
    </div>
    {error && <div role="alert" className="surface-panel p-4 text-sm"><p>{error}</p><button type="button" disabled={loading || Boolean(busyId)} onClick={() => { setLoading(true); setError(""); void load(); }} className="control-button mt-3 min-h-11 px-4">重新读取</button></div>}
    {loading ? <p role="status" className="flex items-center gap-2 py-6 text-on-surface-variant"><Loader2 className="h-5 w-5 animate-spin" />正在读取记忆…</p> : visible.length === 0 && !error ? <div className="surface-panel space-y-3 p-6"><h2 className="font-semibold text-on-surface">{filter === "proposed" ? "暂时没有待确认的记忆" : `还没有${labels[filter]}的记忆`}</h2><p className="text-sm leading-6 text-on-surface-variant">阅读笔记时，可在助手回答下选择「记忆候选」，再到这里核对。</p><Link href="/notes" className="control-button min-h-11 px-4 text-sm">去读笔记</Link></div> : visible.map((memory) => <article key={memory.id} className="surface-panel space-y-3 p-5" aria-busy={busyId === memory.id}>
      <p className="text-xs font-semibold text-primary">{labels[memory.status]}</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-on-surface">{memory.content}</p>
      <p className="text-sm leading-6 text-on-surface-variant">保存原因：{memory.reason}</p>
      <div className="flex flex-wrap items-center gap-2">
        {/^\/notes\/(?:private\/)?[\w-]+(?:[?#].*)?$/.test(memory.sourcePath) && <Link href={memory.sourcePath} className="control-button min-h-11 px-3 text-sm">回看来源笔记</Link>}
        {memory.status === "proposed" && <><button type="button" disabled={Boolean(busyId)} onClick={() => void decide(memory.id, "rejected")} className="control-button min-h-11 px-3 text-sm">不采用</button><button type="button" disabled={Boolean(busyId)} onClick={() => void decide(memory.id, "accepted")} className="control-button control-button-primary min-h-11 px-3 text-sm">{busyId === memory.id ? "正在保存…" : "确认用于后续回答"}</button></>}
      </div>
    </article>)}
  </div>;
}
