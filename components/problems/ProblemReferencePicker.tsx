"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Loader2, Plus, Target } from "lucide-react";
import { createProblemReferenceMarker, parseProblemSelection } from "@/lib/problem-references";
import { notesApi } from "@/lib/supabase";
import type { Note, Problem } from "@/lib/types";

interface ProblemReferencePickerProps {
  isOpen: boolean;
  onInsert: (marker: string) => void;
}

function getProblemPreview(problem: Problem): string {
  return problem.question.replace(/\s+/g, " ").trim() || "(无题干)";
}

export function ProblemReferencePicker({ isOpen, onInsert }: ProblemReferencePickerProps) {
  const [problemSets, setProblemSets] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [selectionInput, setSelectionInput] = useState("1");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen || hasLoaded) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setLoadError(null);

      notesApi.getSummaries({ type: "problem", includeProblems: true, sortOrder: "desc", limit: 120 })
        .then((notes) => {
          if (cancelled) return;
          const sets = notes.filter((note) => (note.problems?.length ?? 0) > 0);
          setProblemSets(sets);
          setSelectedNoteId((current) => current || sets[0]?.id || "");
          setHasLoaded(true);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : "题集列表加载失败";
          setLoadError(message);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasLoaded, isOpen]);

  const selectedSet = useMemo(
    () => problemSets.find((note) => note.id === selectedNoteId),
    [problemSets, selectedNoteId],
  );
  const selectedNumbers = useMemo(() => parseProblemSelection(selectionInput), [selectionInput]);
  const selectedProblems = useMemo(() => {
    const problems = selectedSet?.problems ?? [];
    return selectedNumbers
      .map((number) => ({ number, problem: problems[number - 1] }))
      .filter((item): item is { number: number; problem: Problem } => Boolean(item.problem));
  }, [selectedNumbers, selectedSet?.problems]);
  const invalidCount = Math.max(0, selectedNumbers.length - selectedProblems.length);
  const marker = selectedSet ? createProblemReferenceMarker(selectedSet.id, selectedNumbers) : "";
  const canInsert = Boolean(marker && selectedProblems.length > 0);

  if (!isOpen) return null;

  return (
    <section className="surface-panel mb-4 p-3">
      <div className="mb-3 flex flex-col gap-2 border-b border-outline-variant/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Target className="h-4 w-4 text-primary" />
            题目引用
          </div>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">
            从已有题集选题，插入后阅读页会显示题目卡片。
          </p>
        </div>
        <button
          type="button"
          onClick={() => onInsert(`\n\n${marker}\n\n`)}
          disabled={!canInsert}
          className="control-button control-button-primary h-9 self-start px-3 text-xs disabled:opacity-40 sm:self-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          插入卡片
        </button>
      </div>

      {isLoading ? (
        <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          正在读取题集...
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {loadError}
        </div>
      ) : problemSets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant/30 px-3 py-6 text-center text-sm text-on-surface-variant">
          还没有可引用的题集。
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-on-surface-variant">题集</span>
              <select
                value={selectedNoteId}
                onChange={(event) => setSelectedNoteId(event.target.value)}
                className="field-control h-10 w-full px-3 text-sm"
              >
                {problemSets.map((note) => (
                  <option key={note.id} value={note.id}>
                    {note.title} · {note.problems?.length ?? 0} 题
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-medium text-on-surface-variant">题号</span>
              <input
                value={selectionInput}
                onChange={(event) => setSelectionInput(event.target.value)}
                placeholder="例如：1、3-5、8"
                className="field-control h-10 w-full px-3 text-sm placeholder:text-on-surface-variant/40"
              />
            </label>

            <div className="compact-meta-row">
              <span>{selectedProblems.length} 题可插入</span>
              {invalidCount > 0 && <span>{invalidCount} 个题号超出范围</span>}
              {selectedSet && <span>题集共 {selectedSet.problems?.length ?? 0} 题</span>}
            </div>
          </div>

          <div className="rounded-lg border border-outline-variant/15 bg-surface-container-low p-2">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
              <BookOpen className="h-3.5 w-3.5" />
              定位
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
              {selectedProblems.length === 0 ? (
                <p className="px-1 py-3 text-xs text-on-surface-variant/70">
                  输入题号后可定位到原题。
                </p>
              ) : (
                selectedProblems.slice(0, 10).map(({ number, problem }) => (
                  <Link
                    key={problem.id}
                    href={`/notes/${selectedNoteId}#problem-${problem.id}`}
                    className="flex items-start gap-2 rounded-md px-2 py-2 text-xs text-on-surface-variant transition-colors hover:bg-surface-container-lowest hover:text-primary"
                  >
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="font-semibold text-on-surface">第 {number} 题</span>
                      <span className="mt-0.5 line-clamp-2 block">{getProblemPreview(problem)}</span>
                    </span>
                  </Link>
                ))
              )}
              {selectedProblems.length > 10 && (
                <div className="px-2 py-1 text-xs text-on-surface-variant/70">
                  还有 {selectedProblems.length - 10} 题会一起插入
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
