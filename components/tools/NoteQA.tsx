"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  Search,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import type { NoteQASource } from "@/lib/note-qa";

type NoteQAResponse = {
  answer?: string;
  sources?: NoteQASource[];
  error?: string;
  success?: boolean;
};

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
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<NoteQASource[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuestion = question.trim();
  const canAsk = trimmedQuestion.length > 0 && !isAsking;

  async function askQuestion(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!trimmedQuestion) return;

    setIsAsking(true);
    setError(null);
    setAnswer("");
    setSources([]);

    try {
      const headers = await buildAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch("/api/ai/note-qa", {
        method: "POST",
        headers,
        body: JSON.stringify({ question: trimmedQuestion }),
      });
      const data: NoteQAResponse = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(getErrorMessage(data, "笔记问答失败"));
      }

      setAnswer(data.answer ?? "");
      setSources(data.sources ?? []);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "笔记问答失败";
      setError(message);
      toast.error(message);
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <>
      <PageHeader
        width="compact"
        eyebrow="AI 检索"
        icon={<Search className="h-4 w-4" />}
        title="向笔记提问"
      />

      <PageShell width="compact" topPadding="content">
        <section className="surface-panel p-4 md:p-5">
          <form onSubmit={askQuestion} className="space-y-4">
            <label className="block">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="field-control min-h-40 w-full resize-y px-4 py-3 text-sm leading-6"
                aria-label="问题"
                maxLength={500}
              />
            </label>

            <div className="flex justify-end">
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

          {error || answer ? (
            <div className="mt-5 border-t border-outline-variant/20 pt-5">
              {error ? (
                <div className="surface-muted flex gap-3 p-4 text-sm text-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : answer ? (
                <MarkdownContent content={answer} className="rounded-lg bg-surface-container-lowest p-4" />
              ) : null}
            </div>
          ) : null}
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
      </PageShell>
    </>
  );
}
