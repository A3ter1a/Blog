"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Bot,
  FileText,
  Layers,
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
  description: string;
}> = [
  { value: "all", label: "全部", description: "笔记、题集、随笔一起找" },
  { value: "note", label: "笔记", description: "只看文章笔记" },
  { value: "problem", label: "题集", description: "只看题目和答案" },
  { value: "essay", label: "随笔", description: "只看随笔内容" },
];

const suggestions = [
  "帮我总结一下最近笔记里和矩阵相关的关键结论",
  "线性方程组有解、唯一解、无解分别看什么条件？",
  "从题集里找一下极限题常见的易错点",
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
      <section className="border-b border-outline-variant/20 bg-surface-container-low/70">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="eyebrow-chip mb-3 px-3 py-1 text-xs">
            <Bot className="h-4 w-4" />
            笔记问答
          </div>
          <h1 className="font-headline text-3xl font-bold text-on-surface md:text-4xl">
            向自己的笔记提问
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-on-surface-variant md:text-base">
            从已发布笔记和题集里找相关片段，再让 AI 基于这些片段回答。适合快速回忆概念、定位题目和复习薄弱点。
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="surface-panel p-4 md:p-5">
          <form onSubmit={askQuestion} className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {scopeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setScope(option.value)}
                  className={`control-button px-3 py-2 text-sm ${scope === option.value ? "control-button-selected" : ""}`}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-on-surface">问题</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="field-control min-h-32 w-full resize-y px-4 py-3 text-sm leading-6"
                placeholder="例如：矩阵相似和合同有什么区别？"
                maxLength={500}
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {suggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setQuestion(item)}
                    className="rounded-full border border-outline-variant/50 bg-surface-container-lowest px-3 py-1.5 text-xs text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    {item}
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
                  <span>{sources.length} 个来源片段</span>
                  <span>{tokensUsed > 0 ? `约 ${tokensUsed} tokens` : "已生成回答"}</span>
                </div>
                <MarkdownContent content={answer} className="rounded-lg bg-surface-container-lowest p-4" />
              </div>
            ) : (
              <div className="surface-muted p-5">
                <div className="flex items-start gap-3">
                  <MessageSquareText className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h2 className="font-headline text-lg font-bold text-on-surface">先问一个具体问题</h2>
                    <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                      问得越具体，检索到的笔记片段越准。比如直接问某个概念、题型、公式使用条件，效果会比“帮我复习数学”更稳定。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="surface-panel p-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h2 className="font-headline text-lg font-bold text-on-surface">来源</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">
              AI 只会看到命中的少量片段，完整笔记不会一次性全部塞进去。
            </p>

            <div className="mt-4 space-y-3">
              {sources.length > 0 ? sources.map((source) => (
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
                    打开原文
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              )) : (
                <div className="rounded-lg border border-dashed border-outline-variant/50 p-4 text-sm text-on-surface-variant">
                  回答后会在这里列出引用片段。
                </div>
              )}
            </div>
          </section>

          <section className="surface-panel p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h2 className="font-headline text-lg font-bold text-on-surface">轻量模式</h2>
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-on-surface-variant">
              <p>当前先用关键词检索，不新增数据库表。</p>
              <p>已扫描片段：{totalChunks > 0 ? totalChunks : "等待提问"}</p>
              <p className="flex items-center gap-2 text-xs">
                <FileText className="h-3.5 w-3.5" />
                后续如果笔记量变大，再升级向量检索。
              </p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
