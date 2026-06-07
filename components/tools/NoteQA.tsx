"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Loader2,
  MessageSquareText,
  Search,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { useToast } from "@/components/ui/Toast";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import type { NoteQAScope, NoteQASource } from "@/lib/note-qa";

type NoteQAResponse = {
  answer?: string;
  sources?: NoteQASource[];
  totalChunks?: number;
  tokensUsed?: number;
  error?: string;
  success?: boolean;
};

const scopeOptions: Array<{
  value: NoteQAScope;
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "note", label: "笔记" },
  { value: "problem", label: "题集" },
  { value: "essay", label: "随笔" },
];

const suggestions: Array<{ label: string; prompt: string }> = [
  { label: "矩阵结论", prompt: "帮我总结一下最近笔记里和矩阵相关的关键结论" },
  { label: "方程组判别", prompt: "线性方程组有解、唯一解、无解分别看什么条件？" },
  { label: "极限易错点", prompt: "从题集里找一下极限题常见的易错点" },
];

const typeLabel: Record<NoteQASource["noteType"], string> = {
  note: "笔记",
  problem: "题集",
  essay: "随笔",
};

function getErrorMessage(data: NoteQAResponse, fallback: string): string {
  return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}

export function NoteQA() {
  const toast = useToast();
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState<NoteQAScope>("all");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<NoteQASource[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuestion = question.trim();
  const canAsk = useMemo(() => trimmedQuestion.length > 0 && !isAsking, [isAsking, trimmedQuestion]);

  async function askQuestion(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!trimmedQuestion) return;

    setIsAsking(true);
    setError(null);

    try {
      const headers = await buildAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch("/api/ai/note-qa", {
        method: "POST",
        headers,
        body: JSON.stringify({ question: trimmedQuestion, scope }),
      });
      const data: NoteQAResponse = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(getErrorMessage(data, "笔记问答失败"));
      }

      setAnswer(data.answer ?? "");
      setSources(data.sources ?? []);
      setTotalChunks(data.totalChunks ?? 0);
      setTokensUsed(data.tokensUsed ?? 0);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "笔记问答失败";
      setError(message);
      toast.error(message);
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface pt-24">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="eyebrow-chip mb-2 px-3 py-1 text-xs">
              <Bot className="h-4 w-4" />
              笔记问答
            </div>
            <h1 className="font-headline text-2xl font-bold text-on-surface md:text-3xl">
              向笔记提问
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-outline-variant/40 bg-surface-container-lowest px-3 py-1.5 text-xs text-on-surface-variant">
            <Bot className="h-4 w-4" />
            <span>回答附来源</span>
          </div>
        </header>

        <section className="surface-panel p-4 md:p-5">
          <form onSubmit={askQuestion} className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {scopeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setScope(option.value)}
                  className={`control-button px-3 py-2 text-sm ${scope === option.value ? "control-button-selected" : ""}`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="block">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="field-control min-h-36 w-full resize-y px-4 py-3 text-sm leading-6"
                placeholder="输入问题，例如：矩阵相似和合同有什么区别？"
                maxLength={500}
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {suggestions.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setQuestion(item.prompt)}
                    className="rounded-full border border-outline-variant/50 bg-surface-container-lowest px-3 py-1.5 text-xs text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={!canAsk}
                className="control-button control-button-primary shrink-0 px-4 py-2.5 text-sm"
              >
                {isAsking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在检索
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    开始问答
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-5 border-t border-outline-variant/20 pt-5">
            {error ? (
              <div className="surface-muted flex gap-3 p-4 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : answer ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
                  <span>
                    来源 {sources.length}
                    {totalChunks > 0 ? ` · 片段 ${totalChunks}` : ""}
                  </span>
                  {tokensUsed > 0 ? <span>约 {tokensUsed} tokens</span> : null}
                </div>
                <MarkdownContent content={answer} className="rounded-lg bg-surface-container-lowest p-4" />
              </div>
            ) : (
              <div className="surface-muted p-5">
                <div className="flex items-start gap-3">
                  <MessageSquareText className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h2 className="font-headline text-base font-bold text-on-surface">输入问题后开始检索</h2>
                    <p className="mt-1 text-sm text-on-surface-variant">建议问具体概念、题型或公式条件。</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {sources.length > 0 ? (
          <section className="mt-4 surface-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-headline text-base font-bold text-on-surface">来源</h2>
              <span className="text-xs text-on-surface-variant">{sources.length} 条</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {sources.map((source) => (
                <Link
                  key={source.id}
                  href={source.href}
                  className="block rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-3 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-primary">[{source.id}]</span>
                    <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs text-on-surface-variant">
                      {typeLabel[source.noteType]}
                    </span>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-on-surface">
                    {source.noteTitle}
                  </h3>
                  <p className="mt-1 text-xs text-on-surface-variant">{source.sourceLabel}</p>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-on-surface-variant">
                    {source.excerpt}
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
                    原文
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
