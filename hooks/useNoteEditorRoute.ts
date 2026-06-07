"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { splitMath3PracticeTags } from "@/lib/math3-practice";
import { notesApi } from "@/lib/supabase";
import type { NoteType, Problem, Subject, Video } from "@/lib/types";

export type ImportDraft = {
  title?: string;
  content?: string;
  tags?: string[];
  noteType?: NoteType;
  subject?: Subject;
  problems?: Problem[];
  coverImage?: string;
  videos?: Video[];
};

export type NoteEditorDraft = {
  noteType: NoteType;
  title: string;
  subject: Subject;
  tagInput: string;
  content: string;
  videos: Video[];
  problems: Problem[];
  coverImage: string;
};

type UseNoteEditorRouteOptions = {
  initialImportDraft: ImportDraft | null;
  applyDraft: (draft: NoteEditorDraft) => void;
  resetDraft: () => void;
};

type UseNoteEditorRouteResult = {
  routeReady: boolean;
  isEditMode: boolean;
  editingId: string;
  isLoadingExistingNote: boolean;
  loadNotice: string | null;
  loadError: string | null;
};

const EDIT_NOTE_SLOW_NOTICE_MS = 8000;
const EDIT_NOTE_LOAD_TIMEOUT_MS = 90000;

function withLoadTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("完整编辑数据加载超过 90 秒，可能是当前网络不稳定，或这篇笔记/题集数据量过大，请刷新后重试"));
    }, EDIT_NOTE_LOAD_TIMEOUT_MS);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function draftFromImport(importDraft: ImportDraft): NoteEditorDraft {
  const visibleTags = splitMath3PracticeTags(importDraft.tags).visibleTags;

  return {
    noteType: importDraft.noteType ?? "note",
    title: importDraft.title ?? "",
    subject: importDraft.subject ?? "math",
    tagInput: visibleTags.join(", "),
    content: importDraft.content ?? "",
    videos: importDraft.videos ?? [],
    problems: importDraft.problems ?? [],
    coverImage: importDraft.coverImage ?? "",
  };
}

export function useNoteEditorRoute({
  initialImportDraft,
  applyDraft,
  resetDraft,
}: UseNoteEditorRouteOptions): UseNoteEditorRouteResult {
  const toast = useToast();
  const [routeReady, setRouteReady] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [isLoadingExistingNote, setIsLoadingExistingNote] = useState(false);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const editId = searchParams.get("edit");
    const importMode = searchParams.get("import");
    let cancelled = false;
    let slowNoticeTimer: number | undefined;

    const routeTimer = window.setTimeout(() => {
      if (editId) {
        setIsEditMode(true);
        setEditingId(editId);
        setIsLoadingExistingNote(true);
        setLoadNotice(null);
        setLoadError(null);

        slowNoticeTimer = window.setTimeout(() => {
          if (!cancelled) {
            setLoadNotice("这篇内容的数据量较大，正在继续读取完整编辑数据...");
          }
        }, EDIT_NOTE_SLOW_NOTICE_MS);

        withLoadTimeout(notesApi.getEditableById(editId)).then((existingNote) => {
          if (cancelled) return;
          if (existingNote) {
            setLoadNotice(null);
            const visibleTags = splitMath3PracticeTags(existingNote.tags).visibleTags;

            applyDraft({
              noteType: existingNote.type,
              title: existingNote.title,
              subject: existingNote.subject || "math",
              tagInput: visibleTags.join(", "),
              content: existingNote.content,
              videos: existingNote.videos || [],
              problems: existingNote.problems || [],
              coverImage: existingNote.coverImage || "",
            });
          } else {
            const message = "没有找到要编辑的笔记，可能已被删除或没有权限访问";
            setLoadError(message);
            toast.error(message);
          }
        }).catch((error) => {
          if (cancelled) return;
          console.error("Failed to load note:", error);
          const message = error instanceof Error ? error.message : "未知错误";
          setLoadError(`加载笔记失败：${message}`);
          toast.error("加载笔记失败");
        }).finally(() => {
          if (slowNoticeTimer !== undefined) {
            window.clearTimeout(slowNoticeTimer);
          }
          if (!cancelled) {
            setIsLoadingExistingNote(false);
            setRouteReady(true);
          }
        });
      } else if (importMode) {
        setIsEditMode(false);
        setEditingId("");
        setLoadError(null);
        setLoadNotice(null);
        setIsLoadingExistingNote(false);
        if (initialImportDraft) {
          applyDraft(draftFromImport(initialImportDraft));
          toast.success("已自动填充导入内容，请检查后发布");
          sessionStorage.removeItem("pendingImport");
        }
        setRouteReady(true);
      } else {
        setIsEditMode(false);
        setEditingId("");
        setLoadError(null);
        setLoadNotice(null);
        setIsLoadingExistingNote(false);
        resetDraft();
        setRouteReady(true);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(routeTimer);
      if (slowNoticeTimer !== undefined) {
        window.clearTimeout(slowNoticeTimer);
      }
    };
  }, [applyDraft, initialImportDraft, resetDraft, toast]);

  return {
    routeReady,
    isEditMode,
    editingId,
    isLoadingExistingNote,
    loadNotice,
    loadError,
  };
}
