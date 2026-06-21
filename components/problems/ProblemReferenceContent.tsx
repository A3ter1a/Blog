"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Loader2 } from "lucide-react";
import { notesApi } from "@/lib/supabase";
import type { Note, Problem } from "@/lib/types";
import {
  extractProblemReferenceNoteIds,
  splitProblemReferenceContent,
  type ProblemReference,
} from "@/lib/problem-references";
import { scheduleDeferredClientWork } from "@/lib/deferred-client-work";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { ProblemCard } from "@/components/problems/ProblemCard";

interface ProblemReferenceContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

type ProblemSetLoadState = {
  status: "loading" | "ready" | "error";
  note?: Note;
};

function sanitizeAnchorPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-");
}

function getReferencedProblems(note: Note, reference: ProblemReference): Array<{ problem: Problem; index: number }> {
  const problems = note.problems ?? [];
  return reference.numbers
    .map((number) => ({ problem: problems[number - 1], index: number - 1 }))
    .filter((item): item is { problem: Problem; index: number } => Boolean(item.problem));
}

function scrollToHashTarget() {
  const rawHash = window.location.hash.slice(1);
  if (!rawHash) return;

  let targetId = rawHash;
  try {
    targetId = decodeURIComponent(rawHash);
  } catch {
    targetId = rawHash;
  }

  const target = document.getElementById(targetId);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ProblemReferenceContent({
  content,
  className = "",
  style,
}: ProblemReferenceContentProps) {
  const segments = useMemo(() => splitProblemReferenceContent(content), [content]);
  const noteIds = useMemo(() => extractProblemReferenceNoteIds(content), [content]);
  const [problemSets, setProblemSets] = useState<Record<string, ProblemSetLoadState>>({});

  useEffect(() => {
    if (noteIds.length === 0) return;

    let cancelled = false;
    const idsToLoad = noteIds.filter((noteId) => !problemSets[noteId]);
    if (idsToLoad.length === 0) return;

    const cancelDeferredLoad = scheduleDeferredClientWork(() => {
      setProblemSets((current) => {
        const next = { ...current };
        idsToLoad.forEach((noteId) => {
          next[noteId] = current[noteId] ?? { status: "loading" };
        });
        return next;
      });

      void Promise.all(
        idsToLoad.map(async (noteId) => {
          try {
            const note = await notesApi.getPracticeSet(noteId);
            return { noteId, state: note ? { status: "ready" as const, note } : { status: "error" as const } };
          } catch {
            return { noteId, state: { status: "error" as const } };
          }
        }),
      ).then((results) => {
        if (cancelled) return;
        setProblemSets((current) => {
          const next = { ...current };
          results.forEach(({ noteId, state }) => {
            next[noteId] = state;
          });
          return next;
        });
      });
    });

    return () => {
      cancelled = true;
      cancelDeferredLoad();
    };
  }, [noteIds, problemSets]);

  useEffect(() => {
    if (noteIds.length === 0) return;

    const frame = window.requestAnimationFrame(scrollToHashTarget);
    const timer = window.setTimeout(scrollToHashTarget, 220);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [noteIds.length, problemSets]);

  if (segments.every((segment) => segment.type === "markdown")) {
    return <MarkdownContent content={content} className={className} style={style} />;
  }

  return (
    <div className={className} style={style}>
      {segments.map((segment, index) => {
        if (segment.type === "markdown") {
          if (!segment.content.trim()) return null;
          return (
            <MarkdownContent
              key={`markdown-${index}`}
              content={segment.content}
              className="text-inherit"
            />
          );
        }

        const state = problemSets[segment.reference.noteId];
        return (
          <ProblemReferenceBlock
            key={`${segment.reference.noteId}-${segment.reference.selection}-${index}`}
            reference={segment.reference}
            state={state}
          />
        );
      })}
    </div>
  );
}

function ProblemReferenceBlock({
  reference,
  state,
}: {
  reference: ProblemReference;
  state?: ProblemSetLoadState;
}) {
  if (!state || state.status === "loading") {
    return (
      <section className="surface-panel my-6 flex items-center gap-2 p-4 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        正在加载题目卡片...
      </section>
    );
  }

  if (state.status === "error" || !state.note) {
    return (
      <section className="surface-panel my-6 border-dashed p-4 text-sm text-on-surface-variant">
        题目引用暂时无法加载，可能是题集未发布或已删除。
      </section>
    );
  }

  const referencedProblems = getReferencedProblems(state.note, reference);
  const blockId = `problem-ref-${state.note.id}-${sanitizeAnchorPart(reference.selection)}`;

  if (referencedProblems.length === 0) {
    return (
      <section id={blockId} className="surface-panel my-6 border-dashed p-4 text-sm text-on-surface-variant">
        「{state.note.title}」里没有匹配到第 {reference.selection} 题。
      </section>
    );
  }

  const firstProblem = referencedProblems[0];

  return (
    <section id={blockId} className="my-7 scroll-mt-28">
      <div className="mb-3 flex flex-col gap-2 border-b border-outline-variant/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-on-surface">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="truncate">{state.note.title}</span>
          </div>
          <div className="mt-1 text-xs text-on-surface-variant">
            引用第 {reference.selection} 题
          </div>
        </div>
        {firstProblem && (
          <Link
            href={`/notes/${state.note.id}#problem-${firstProblem.problem.id}`}
            className="control-button h-9 self-start px-3 text-xs sm:self-auto"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            原题集
          </Link>
        )}
      </div>

      <div className="space-y-4">
        {referencedProblems.map(({ problem, index }) => (
          <ProblemCard
            key={problem.id}
            problem={problem}
            index={index}
            noteId={state.note?.id}
            anchorPrefix={blockId}
          />
        ))}
      </div>
    </section>
  );
}
