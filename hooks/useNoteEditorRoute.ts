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
  preservedMath3PracticeTags: string[];
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
  loadError: string | null;
};

function draftFromImport(importDraft: ImportDraft): NoteEditorDraft {
  const { visibleTags, math3PracticeTags } = splitMath3PracticeTags(importDraft.tags);

  return {
    noteType: importDraft.noteType ?? "note",
    title: importDraft.title ?? "",
    subject: importDraft.subject ?? "math",
    tagInput: visibleTags.join(", "),
    content: importDraft.content ?? "",
    videos: importDraft.videos ?? [],
    problems: importDraft.problems ?? [],
    coverImage: importDraft.coverImage ?? "",
    preservedMath3PracticeTags: math3PracticeTags,
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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const editId = searchParams.get("edit");
    const importMode = searchParams.get("import");
    let cancelled = false;

    if (editId) {
      setIsEditMode(true);
      setEditingId(editId);
      setIsLoadingExistingNote(true);
      setLoadError(null);

      notesApi.getById(editId).then((existingNote) => {
        if (cancelled) return;
        if (existingNote) {
          const { visibleTags, math3PracticeTags } = splitMath3PracticeTags(existingNote.tags);

          applyDraft({
            noteType: existingNote.type,
            title: existingNote.title,
            subject: existingNote.subject || "math",
            tagInput: visibleTags.join(", "),
            content: existingNote.content,
            videos: existingNote.videos || [],
            problems: existingNote.problems || [],
            coverImage: existingNote.coverImage || "",
            preservedMath3PracticeTags: math3PracticeTags,
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
        if (!cancelled) {
          setIsLoadingExistingNote(false);
          setRouteReady(true);
        }
      });
    } else if (importMode) {
      setIsEditMode(false);
      setEditingId("");
      setLoadError(null);
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
      setIsLoadingExistingNote(false);
      resetDraft();
      setRouteReady(true);
    }

    return () => {
      cancelled = true;
    };
  }, [applyDraft, initialImportDraft, resetDraft, toast]);

  return {
    routeReady,
    isEditMode,
    editingId,
    isLoadingExistingNote,
    loadError,
  };
}
