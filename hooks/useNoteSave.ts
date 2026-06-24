"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  getMath3PracticeTagsFromProblems,
  mergeVisibleTagsWithMath3Tags,
  splitMath3PracticeTags,
} from "@/lib/math3-practice";
import { normalizeProblemReferenceMarkup } from "@/lib/problem-references";
import { getProblemsValidationIssues, normalizeProblem } from "@/lib/problem-utils";
import { notesApi } from "@/lib/supabase";
import type { NoteType, Problem, Subject, Video } from "@/lib/types";

type NoteSaveDraft = {
  isEditMode: boolean;
  editingId: string;
  noteType: NoteType;
  title: string;
  subject: Subject;
  tagInput: string;
  content: string;
  videos: Video[];
  problems: Problem[];
  coverImage: string;
  isUploadingCover: boolean;
};

type NoteSaveResult = {
  id: string;
};

type UseNoteSaveResult = {
  isSaving: boolean;
  saveNote: (draft: NoteSaveDraft) => Promise<NoteSaveResult | null>;
};

export function useNoteSave(): UseNoteSaveResult {
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const saveNote = useCallback(async (draft: NoteSaveDraft): Promise<NoteSaveResult | null> => {
    if (isSaving) return null;

    if (draft.isUploadingCover) {
      toast.error("封面图片还在上传，请稍后再保存");
      return null;
    }

    if (draft.coverImage.startsWith("blob:")) {
      toast.error("封面图片还没有上传成功，请重新上传后再保存");
      return null;
    }

    if (!draft.title.trim()) {
      toast.error("请输入标题");
      return null;
    }

    if (draft.isEditMode && !draft.editingId) {
      toast.error("编辑目标尚未加载完成，请稍后再试");
      return null;
    }

    const normalizedProblems = draft.noteType === "problem"
      ? draft.problems.map(normalizeProblem)
      : undefined;
    if (normalizedProblems) {
      const firstInvalidProblem = getProblemsValidationIssues(normalizedProblems)[0];
      if (firstInvalidProblem) {
        toast.error(`第 ${firstInvalidProblem.index + 1} 题：${firstInvalidProblem.issues[0]}`);
        return null;
      }
    }

    const visibleTags = draft.tagInput.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
    const tags = normalizedProblems
      ? mergeVisibleTagsWithMath3Tags(
        splitMath3PracticeTags(visibleTags).visibleTags,
        [],
        getMath3PracticeTagsFromProblems(normalizedProblems),
      )
      : splitMath3PracticeTags(visibleTags).visibleTags;
    const noteData = {
      type: draft.noteType,
      title: draft.title,
      subject: draft.noteType === "essay" ? undefined : draft.subject,
      tags,
      content: normalizeProblemReferenceMarkup(draft.content),
      videos: draft.videos,
      problems: normalizedProblems,
      coverImage: draft.coverImage || undefined,
    };

    setIsSaving(true);
    try {
      if (draft.isEditMode) {
        await notesApi.updateLight(draft.editingId, noteData);
        toast.success("笔记已更新！");
        return { id: draft.editingId };
      }

      const newNote = await notesApi.createLight({
        ...noteData,
        isPublished: true,
      });
      toast.success("笔记已创建！");
      return { id: newNote.id };
    } catch (error: unknown) {
      console.error("Failed to save note:", error);
      toast.error(`保存失败：${error instanceof Error ? error.message : "未知错误"}`);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, toast]);

  return { isSaving, saveNote };
}
