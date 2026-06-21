"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Clock3,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import { readJsonStorage, writeJsonStorage } from "@/lib/browser-storage";
import { scheduleDeferredClientWork } from "@/lib/deferred-client-work";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import type {
  NoteQAMode,
  NoteQAScope,
  NoteQASource,
  NoteQASubjectScope,
} from "@/lib/note-qa";

type NoteQAResponse = {
  answer?: string;
  sources?: NoteQASource[];
  totalChunks?: number;
  error?: string;
  success?: boolean;
};

type RecentQuestion = {
  id: string;
  text: string;
  mode: NoteQAMode;
  scope: NoteQAScope;
  subject: NoteQASubjectScope;
  contextLimit: number;
  createdAt: string;
};

const RECENT_QUESTIONS_KEY = "note-qa-recent-questions-v1";
const MAX_RECENT_QUESTIONS = 8;

const modeOptions: Array<{ value: NoteQAMode; label: string }> = [
  { value: "answer", label: "回答" },
  { value: "locate", label: "定位" },
  { value: "outline", label: "提纲" },
  { value: "quiz", label: "自测" },
];

const scopeOptions: Array<{ value: NoteQAScope; label: string }> = [
  { value: "all", label: "全部" },
  { value: "note", label: "文章" },
  { value: "problem", label: "题集" },
  { value: "essay", label: "随笔" },
];

const subjectOptions: Array<{ value: NoteQASubjectScope; label: string }> = [
  { value: "all", label: "全部" },
  { value: "math", label: "数学" },
  { value: "english", label: "英语" },
  { value: "politics", label: "政治" },
  { value: "economics", label: "经济" },
];

const contextLimitOptions = [
  { value: 4, label: "4 条" },
  { value: 8, label: "8 条" },
  { value: 12, label: "12 条" },
];

const typeLabel: Record<NoteQASource["noteType"], string> = {
  note: "文章",
  problem: "题集",
  essay: "随笔",
};

function getErrorMessage(data: NoteQAResponse, fallback: string): string {
  return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}

function isMode(value: unknown): value is NoteQAMode {
  return value === "answer" || value === "locate" || value === "outline" || value === "quiz";
}

function isScope(value: unknown): value is NoteQAScope {
  return value === "all" || value === "note" || value === "problem" || value === "essay";
}

function isSubject(value: unknown): value is NoteQASubjectScope {
  return value === "all" || value === "math" || value === "english" || value === "politics" || value === "economics";
}

function normalizeRecentQuestions(value: unknown): RecentQuestion[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): RecentQuestion | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim() : "";
      if (!text) return null;

      const contextLimit = typeof record.contextLimit === "number"
        ? Math.max(4, Math.min(12, Math.round(record.contextLimit)))
        : 8;

      return {
        id: typeof record.id === "string" && record.id ? record.id : `${Date.now()}-${text}`,
        text: text.slice(0, 500),
        mode: isMode(record.mode) ? record.mode : "answer",
        scope: isScope(record.scope) ? record.scope : "all",
        subject: isSubject(record.subject) ? record.subject : "all",
        contextLimit,
        createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
      };
    })
    .filter((item): item is RecentQuestion => item !== null)
    .slice(0, MAX_RECENT_QUESTIONS);
}

function makeRecentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function NoteQA() {
  const toast = useToast();
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<NoteQAMode>("answer");
  const [scope, setScope] = useState<NoteQAScope>("all");
  const [subject, setSubject] = useState<NoteQASubjectScope>("all");
  const [contextLimit, setContextLimit] = useState(8);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<NoteQASource[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [recentQuestions, setRecentQuestions] = useState<RecentQuestion[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return scheduleDeferredClientWork(() => {
      setRecentQuestions(readJsonStorage(RECENT_QUESTIONS_KEY, [], normalizeRecentQuestions));
    });
  }, []);

  const trimmedQuestion = question.trim();
  const canAsk = trimmedQuestion.length > 0 && !isAsking;

  const sourceSummary = useMemo(() => {
    if (sources.length === 0) return "";
    return totalChunks > 0 ? `${sources.length}/${totalChunks}` : `${sources.length}`;
  }, [sources.length, totalChunks]);

  function persistRecent(nextQuestion: string) {
    const nextItem: RecentQuestion = {
      id: makeRecentId(),
      text: nextQuestion,
      mode,
      scope,
      subject,
      contextLimit,
      createdAt: new Date().toISOString(),
    };
    const next = [
      nextItem,
      ...recentQuestions.filter((item) => item.text !== nextQuestion),
    ].slice(0, MAX_RECENT_QUESTIONS);

    setRecentQuestions(next);
    writeJsonStorage(RECENT_QUESTIONS_KEY, next);
  }

  function clearRecentQuestions() {
    setRecentQuestions([]);
    writeJsonStorage(RECENT_QUESTIONS_KEY, []);
  }

  function applyRecentQuestion(item: RecentQuestion) {
    setQuestion(item.text);
    setMode(item.mode);
    setScope(item.scope);
    setSubject(item.subject);
    setContextLimit(item.contextLimit);
  }

  async function askQuestion(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!trimmedQuestion) return;

    setIsAsking(true);
    setError(null);
    setAnswer("");
    setSources([]);
    setTotalChunks(0);

    try {
      const headers = await buildAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch("/api/ai/note-qa", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: trimmedQuestion,
          mode,
          scope,
          subject,
          contextLimit,
        }),
      });
      const data: NoteQAResponse = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(getErrorMessage(data, "笔记问答失败"));
      }

      setAnswer(data.answer ?? "");
      setSources(data.sources ?? []);
      setTotalChunks(data.totalChunks ?? 0);
      persistRecent(trimmedQuestion);
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
      <PageHeader width="compact" title="笔记问答" />

      <PageShell width="wide" topPadding="content">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="surface-panel p-4 md:p-5">
            <form onSubmit={askQuestion} className="space-y-4">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="field-control min-h-36 w-full resize-y px-4 py-3 text-sm leading-6"
                aria-label="问题"
                placeholder="输入要查的问题"
                maxLength={500}
              />

              <div className="grid gap-3 border-t border-outline-variant/20 pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="space-y-3">
                  <SegmentedControl
                    label="方式"
                    options={modeOptions}
                    value={mode}
                    onChange={setMode}
                  />

                  <div className="grid gap-3 sm:grid-cols-3">
                    <SelectField
                      label="资料"
                      value={scope}
                      onChange={(value) => setScope(value as NoteQAScope)}
                      options={scopeOptions}
                    />
                    <SelectField
                      label="科目"
                      value={subject}
                      onChange={(value) => setSubject(value as NoteQASubjectScope)}
                      options={subjectOptions}
                    />
                    <SelectField
                      label="来源"
                      value={String(contextLimit)}
                      onChange={(value) => setContextLimit(Number(value))}
                      options={contextLimitOptions.map((option) => ({
                        value: String(option.value),
                        label: option.label,
                      }))}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canAsk}
                  className="control-button control-button-primary h-11 justify-center px-5 text-sm lg:w-28"
                >
                  {isAsking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      检索中
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      提问
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          <aside className="surface-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-on-surface">
                <Clock3 className="h-4 w-4 text-on-surface-variant" />
                最近
              </div>
              {recentQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={clearRecentQuestions}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error"
                  aria-label="清空最近问题"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {recentQuestions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-outline-variant/30 px-3 py-8 text-center text-xs text-on-surface-variant">
                暂无记录
              </div>
            ) : (
              <div className="space-y-2">
                {recentQuestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyRecentQuestion(item)}
                    className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-left transition-colors hover:border-primary/30"
                  >
                    <span className="line-clamp-2 text-xs font-medium leading-5 text-on-surface">
                      {item.text}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>

        {(error || answer || sources.length > 0) && (
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <section className="surface-panel p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-headline text-base font-bold text-on-surface">结果</h2>
                {sourceSummary && <span className="text-xs text-on-surface-variant">{sourceSummary}</span>}
              </div>

              {error ? (
                <div className="surface-muted flex gap-3 p-4 text-sm text-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : answer ? (
                <MarkdownContent content={answer} className="rounded-lg bg-surface-container-lowest p-4" />
              ) : null}
            </section>

            {sources.length > 0 && (
              <section className="surface-panel p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="font-headline text-base font-bold text-on-surface">来源</h2>
                  <span className="text-xs text-on-surface-variant">{sources.length} 条</span>
                </div>
                <div className="space-y-2">
                  {sources.map((source) => (
                    <Link
                      key={source.id}
                      href={source.href}
                      className="block rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-3 transition-colors hover:border-primary/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-primary">[{source.id}]</span>
                        <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] text-on-surface-variant">
                          {typeLabel[source.noteType]}
                        </span>
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-on-surface">
                        {source.noteTitle}
                      </h3>
                      <p className="mt-1 line-clamp-1 text-xs text-on-surface-variant">
                        {source.sourceLabel}
                      </p>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-on-surface-variant">
                        {source.excerpt}
                      </p>
                      <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
                        打开
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </PageShell>
    </>
  );
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-on-surface-variant">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
              value === option.value
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-outline-variant/30 text-on-surface-variant hover:border-primary/30 hover:text-primary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-on-surface-variant">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field-control h-10 w-full px-3 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
