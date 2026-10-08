"use client";

import { Suspense, useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { Editor } from "@tiptap/react";
import { Save, RotateCcw, X, Image as ImageIcon, FolderTree, Columns, Maximize2, Eye, Loader2, ChevronDown, SlidersHorizontal, Video as VideoIcon, Target, LineChart, ArrowLeft, AlertTriangle, CheckCircle2, Keyboard } from "lucide-react";
import { Subject, subjectMap, NoteType, typeMap, Video, Problem } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import type { RichTextEditorRef } from "@/components/editor/RichTextEditor";
import { LazyRichTextEditor } from "@/components/editor/LazyRichTextEditor";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { DocumentOcrDialog } from "@/components/editor/DocumentOcrDialog";
import { MarkdownReviewProposalDialog } from "@/components/editor/MarkdownReviewProposalDialog";
import { EconomicsGraphComposer } from "@/components/editor/EconomicsGraphComposer";
import {
  AI_CONFIG_STORAGE_KEY,
  DEFAULT_AI_CONFIG,
  normalizeAIConfig,
  sanitizeAIConfig,
} from "@/lib/ai-config";
import { readJsonStorage, removeStorage, writeJsonStorage } from "@/lib/browser-storage";
import {
  extractMarkdownReviewProposal,
  type MarkdownReviewProposal,
  validateMarkdownReviewProposal,
  verifyMarkdownReviewProposalChecksums,
} from "@/lib/markdown-review-proposal";
import { useJobCenter } from "@/components/jobs/JobCenter";
import { isClientJobActive } from "@/lib/job-client";
import { uploadImage, generateFileName } from "@/lib/supabase-storage";
import { getMarkdownTextStats } from "@/lib/markdown-format";
import { splitMath3PracticeTags } from "@/lib/math3-practice";
import { getNoteReadPath } from "@/lib/note-routes";
import { AdminGate } from "@/components/auth/AdminGate";
import { ProblemReferencePicker } from "@/components/problems/ProblemReferencePicker";
import { AnimatedDisclosure } from "@/components/ui/AnimatedDisclosure";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCoverUpload } from "@/hooks/useCoverUpload";
import { useNoteSave } from "@/hooks/useNoteSave";
import { useLocalReviewMode } from "@/hooks/useAdminAuth";
import { type ImportDraft, type NoteEditorDraft, useNoteEditorRoute } from "@/hooks/useNoteEditorRoute";
import { surfaceMotion, uiMotion } from "@/lib/motion";

const CREATE_TASK_TARGET_STORAGE_KEY = "asteroid:create-task-target:v1";

function isTaskTargetId(value: unknown): value is string {
  return typeof value === "string" && /^draft:[0-9a-f-]{36}$/i.test(value);
}

function createDraftTaskTargetId(): string {
  return `draft:${crypto.randomUUID()}`;
}

const ProblemEditor = dynamic(
  () => import("@/components/problems/ProblemEditor").then((module) => module.ProblemEditor),
  { loading: () => <EditorModuleFallback label="正在加载题集编辑器..." /> },
);

const ChapterManager = dynamic(
  () => import("@/components/chapters/ChapterManager").then((module) => module.ChapterManager),
  { loading: () => null },
);

const Playlist = dynamic(
  () => import("@/components/video/Playlist").then((module) => module.Playlist),
  { loading: () => <EditorModuleFallback label="正在加载视频列表..." /> },
);

const ContentPreview = dynamic(
  () => import("@/components/ui/ContentPreview").then((module) => module.ContentPreview),
  { loading: () => <EditorModuleFallback label="正在生成预览..." /> },
);

function EditorModuleFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low p-6 text-sm text-on-surface-variant">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <span>{label}</span>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRecoverableEditorDraft(value: unknown): NoteEditorDraft | null {
  if (!isRecord(value)) return null;
  if (value.noteType !== "note" && value.noteType !== "problem" && value.noteType !== "essay") return null;
  if (value.subject !== "math" && value.subject !== "english" && value.subject !== "politics" && value.subject !== "economics") return null;
  if (typeof value.title !== "string" || typeof value.tagInput !== "string" || typeof value.content !== "string" || typeof value.coverImage !== "string") return null;
  if (!Array.isArray(value.videos) || !Array.isArray(value.problems)) return null;
  return {
    noteType: value.noteType,
    title: value.title,
    subject: value.subject,
    tagInput: value.tagInput,
    content: value.content,
    videos: value.videos as Video[],
    problems: value.problems as Problem[],
    coverImage: value.coverImage,
  };
}

function hasRecoverableEditorContent(draft: NoteEditorDraft): boolean {
  return Boolean(draft.title.trim() || draft.tagInput.trim() || draft.content.trim() || draft.coverImage || draft.videos.length || draft.problems.length);
}

function getPendingImportDraft(): ImportDraft | null {
  if (typeof window === "undefined") return null;

  const searchParams = new URLSearchParams(window.location.search);
  if (!searchParams.get("import")) return null;

  const importData = sessionStorage.getItem("pendingImport");
  if (!importData) return null;

  try {
    const parsed: unknown = JSON.parse(importData);
    if (!isRecord(parsed)) return null;

    return {
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      content: typeof parsed.content === "string" ? parsed.content : undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
      noteType: parsed.noteType === "note" || parsed.noteType === "problem" || parsed.noteType === "essay" ? parsed.noteType : undefined,
      subject: parsed.subject === "math" || parsed.subject === "english" || parsed.subject === "politics" || parsed.subject === "economics" ? parsed.subject : undefined,
      problems: Array.isArray(parsed.problems) ? (parsed.problems as Problem[]) : undefined,
      coverImage: typeof parsed.coverImage === "string" ? parsed.coverImage : undefined,
      videos: Array.isArray(parsed.videos) ? (parsed.videos as Video[]) : undefined,
    };
  } catch (error) {
    console.error("Failed to parse import data:", error);
    return null;
  }
}

function CreateEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const isReviewMode = useLocalReviewMode();
  const {
    jobs,
    requestedJobId,
    createMarkdownReviewJob,
    loadJobResult,
    claimJobResult,
    updateJob,
  } = useJobCenter();
  const [initialImportDraft] = useState<ImportDraft | null>(getPendingImportDraft);
  const [initialImportVisibleTags] = useState(() => splitMath3PracticeTags(initialImportDraft?.tags).visibleTags);

  const [noteType, setNoteType] = useState<NoteType>(initialImportDraft?.noteType ?? "note");
  const [title, setTitle] = useState(initialImportDraft?.title ?? "");
  const [subject, setSubject] = useState<Subject>(initialImportDraft?.subject ?? "math");
  const [tagInput, setTagInput] = useState(initialImportVisibleTags.join(", "));
  const [content, setContent] = useState(initialImportDraft?.content ?? "");
  const [videos, setVideos] = useState<Video[]>(initialImportDraft?.videos ?? []);
  const [problems, setProblems] = useState<Problem[]>(initialImportDraft?.problems ?? []);
  const [hasProblemChanges, setHasProblemChanges] = useState(false);
  const {
    coverImage,
    coverPreviewSrc,
    coverUploadError,
    isUploadingCover,
    setCoverImageUrl,
    clearCoverImage,
    handleCoverImageUpload,
  } = useCoverUpload(initialImportDraft?.coverImage ?? "");
  const { isSaving, saveNote } = useNoteSave();
  const [showVideoSection, setShowVideoSection] = useState(false);
  const [showMetaSection, setShowMetaSection] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [showChapterManager, setShowChapterManager] = useState(false);
  const [chapterRefreshKey, setChapterRefreshKey] = useState(0);
  const [showProblemReferencePicker, setShowProblemReferencePicker] = useState(false);
  const [showDocumentOcrDialog, setShowDocumentOcrDialog] = useState(false);
  const [isReviewingMarkdown, setIsReviewingMarkdown] = useState(false);
  const [markdownReviewProposal, setMarkdownReviewProposal] = useState<MarkdownReviewProposal | null>(null);
  const [markdownReviewJobId, setMarkdownReviewJobId] = useState<string | null>(null);
  const [draftTaskTargetId, setDraftTaskTargetId] = useState("");
  const pendingMath3ClassificationJobsRef = useRef(new Set<string>());
  const [showEconomicsGraphComposer, setShowEconomicsGraphComposer] = useState(false);
  const [viewMode, setViewMode] = useState<"split" | "editor" | "preview">("editor");
  const [pendingTypeChange, setPendingTypeChange] = useState<NoteType | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [draftState, setDraftState] = useState<"clean" | "dirty" | "error">("clean");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const baselineFingerprintRef = useRef<string | null>(null);
  const draftPersistTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const [draftRecoveryReady, setDraftRecoveryReady] = useState(false);
  const [recoverableDraft, setRecoverableDraft] = useState<NoteEditorDraft | null>(null);
  const handleSaveRef = useRef<() => Promise<void>>(async () => undefined);
  const editorRef = useRef<RichTextEditorRef>(null);
  const [toolbarEditor, setToolbarEditor] = useState<Editor | null>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const handledMarkdownReviewJobsRef = useRef(new Set<string>());
  const contentStats = useMemo(() => getMarkdownTextStats(content), [content]);
  const saveShortcutLabel = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac")
    ? "⌘ S"
    : "Ctrl + S";
  const returnPath = useMemo(() => {
    const candidate = searchParams.get("from");
    return candidate && candidate.startsWith("/") && !candidate.startsWith("//") && !/[\\\u0000-\u0020]/.test(candidate)
      ? candidate
      : "/notes";
  }, [searchParams]);
  const editorDraftStorageKey = useMemo(() => {
    const editId = searchParams.get("edit");
    return editId ? `asteroid:editor-draft:v2:${editId}` : "asteroid:editor-draft:v2:new";
  }, [searchParams]);
  const restoredDraftRef = useRef(false);
  const draftFingerprint = useMemo(() => JSON.stringify({
    noteType,
    title,
    subject,
    tagInput,
    content,
    videos,
    problems,
    coverImage,
  }), [content, coverImage, noteType, problems, subject, tagInput, title, videos]);

  const applyDraft = useCallback((draft: NoteEditorDraft) => {
    setNoteType(draft.noteType);
    setTitle(draft.title);
    setSubject(draft.subject);
    setTagInput(draft.tagInput);
    setContent(draft.content);
    setVideos(draft.videos);
    setProblems(draft.problems);
    setHasProblemChanges(false);
    setCoverImageUrl(draft.coverImage);
  }, [setCoverImageUrl]);

  const resetDraft = useCallback(() => {
    setNoteType("note");
    setTitle("");
    setSubject("math");
    setTagInput("");
    setContent("");
    setVideos([]);
    setProblems([]);
    setHasProblemChanges(false);
    setPendingTypeChange(null);
    setCoverImageUrl("");
  }, [setCoverImageUrl]);

  const {
    routeReady,
    isEditMode,
    editingId,
    editingContentVersion,
    editingIsPublished,
    isLoadingExistingNote,
    loadNotice,
    loadError,
  } = useNoteEditorRoute({
    initialImportDraft,
    applyDraft,
    resetDraft,
  });
  const requestedJob = jobs.find((job) => job.id === requestedJobId);
  const taskTargetId = isEditMode && editingId ? `note:${editingId}` : requestedJob?.targetId || draftTaskTargetId;
  const openedResultRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routeReady || isLoadingExistingNote || !requestedJob || openedResultRef.current === requestedJob.id) return;
    const timer = window.setTimeout(() => {
      openedResultRef.current = requestedJob.id;
      if (!isEditMode && isTaskTargetId(requestedJob.targetId)) setDraftTaskTargetId(requestedJob.targetId!);
      if ((requestedJob.type === "problem_ocr" || requestedJob.type === "math3_auto_classify") && !isEditMode) setNoteType("problem");
      if (requestedJob.type === "document_ocr") setShowDocumentOcrDialog(true);
      if (requestedJob.type === "economics_graph_generation") {
        if (!isEditMode) { setSubject("economics"); setNoteType("note"); }
        setShowEconomicsGraphComposer(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isEditMode, isLoadingExistingNote, requestedJob, routeReady]);
  const hasActiveMarkdownReviewJob = useMemo(
    () => jobs.some((job) => job.type === "markdown_review" && job.targetId === taskTargetId && isClientJobActive(job)),
    [jobs, taskTargetId],
  );

  useEffect(() => {
    if (isEditMode || draftTaskTargetId) return;
    const stored = readJsonStorage<unknown>(CREATE_TASK_TARGET_STORAGE_KEY, null);
    const nextTargetId = isTaskTargetId(stored) ? stored : createDraftTaskTargetId();
    if (!isTaskTargetId(stored)) writeJsonStorage(CREATE_TASK_TARGET_STORAGE_KEY, nextTargetId);
    const timer = window.setTimeout(() => setDraftTaskTargetId(nextTargetId), 0);
    return () => window.clearTimeout(timer);
  }, [draftTaskTargetId, isEditMode]);

  const handleMath3ClassificationApplied = useCallback((jobId: string) => {
    pendingMath3ClassificationJobsRef.current.add(jobId);
  }, []);

  useEffect(() => {
    if (!taskTargetId) return;
    const resumableJob = jobs.find((job) => (
      job.type === "markdown_review"
      && job.targetId === taskTargetId
      && job.status === "succeeded"
      && !job.resultClaimedAt
      && !handledMarkdownReviewJobsRef.current.has(job.id)
    ));
    if (!resumableJob) return;
    if (!resumableJob.resultPayload) {
      void loadJobResult(resumableJob.id);
      return;
    }

    const result = isRecord(resumableJob.resultPayload) ? resumableJob.resultPayload : null;
    if (result?.targetId !== taskTargetId) return;
    handledMarkdownReviewJobsRef.current.add(resumableJob.id);
    const proposal = extractMarkdownReviewProposal(result.proposal);
    if (!proposal || !validateMarkdownReviewProposal(proposal).valid) {
      updateJob(resumableJob.id, {
        phase: "结果校验失败",
        statusText: "云端审阅结果结构不完整，未写入正文",
        error: "Markdown 审阅提案结构校验失败",
      });
      toast.error("后台 Markdown 审阅结果不完整，已阻止应用");
      return;
    }

    void verifyMarkdownReviewProposalChecksums(proposal).then((checksumValid) => {
      if (!checksumValid) {
        updateJob(resumableJob.id, {
          phase: "结果校验失败",
          statusText: "云端审阅结果 checksum 不匹配，未写入正文",
          error: "Markdown 审阅提案 checksum 校验失败",
        });
        toast.error("后台 Markdown 审阅结果 checksum 不匹配，已阻止应用");
        return;
      }
      setMarkdownReviewJobId(resumableJob.id);
      setMarkdownReviewProposal(proposal);
      toast.success("后台审阅建议已恢复，确认后才会应用到正文");
    });
  }, [jobs, loadJobResult, taskTargetId, toast, updateJob]);

  useEffect(() => {
    if (!routeReady || isLoadingExistingNote || loadError || restoredDraftRef.current) return;
    const stored = readJsonStorage<unknown>(editorDraftStorageKey, null);
    const recovered = searchParams.get("import") ? null : readRecoverableEditorDraft(isRecord(stored) && isRecord(stored.draft) ? stored.draft : stored);
    const timer = window.setTimeout(() => {
      restoredDraftRef.current = true;
      setDraftRecoveryReady(true);
      if (!recovered || (!isEditMode && !hasRecoverableEditorContent(recovered))) return;
      if (JSON.stringify(recovered) === draftFingerprint) {
        removeStorage(editorDraftStorageKey);
        return;
      }
      if (isEditMode) {
        // Always keep the current server version visible until the user chooses
        // to restore a local edit. Legacy drafts lack version information.
        setRecoverableDraft(recovered);
      } else {
        applyDraft(recovered);
        setDraftState("dirty");
        toast.info("已恢复上次未保存的编辑草稿，确认内容后再保存");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [applyDraft, draftFingerprint, editorDraftStorageKey, isEditMode, isLoadingExistingNote, loadError, routeReady, searchParams, toast]);

  useEffect(() => {
    if (!routeReady || isLoadingExistingNote || loadError) return;
    if (baselineFingerprintRef.current === null) {
      baselineFingerprintRef.current = draftFingerprint;
    }
    const hasChanges = baselineFingerprintRef.current !== draftFingerprint || (!isEditMode && hasRecoverableEditorContent({ noteType, title, subject, tagInput, content, videos, problems, coverImage }));
    setDraftState(hasChanges ? "dirty" : "clean");
  }, [content, coverImage, draftFingerprint, isEditMode, isLoadingExistingNote, loadError, noteType, problems, routeReady, subject, tagInput, title, videos]);

  const persistCurrentDraft = useCallback(() => {
    if (!draftRecoveryReady || recoverableDraft || loadError || !routeReady || isLoadingExistingNote) return;
    const hasChanges = baselineFingerprintRef.current !== draftFingerprint || (!isEditMode && hasRecoverableEditorContent({ noteType, title, subject, tagInput, content, videos, problems, coverImage }));
    if (!hasChanges) {
      removeStorage(editorDraftStorageKey);
      return;
    }
    writeJsonStorage(editorDraftStorageKey, {
      draft: { noteType, title, subject, tagInput, content, videos, problems, coverImage },
      baseContentVersion: editingContentVersion,
    });
  }, [content, coverImage, draftFingerprint, draftRecoveryReady, editingContentVersion, editorDraftStorageKey, isEditMode, isLoadingExistingNote, loadError, noteType, problems, recoverableDraft, routeReady, subject, tagInput, title, videos]);

  useEffect(() => {
    draftPersistTimerRef.current = window.setTimeout(persistCurrentDraft, 650);
    return () => {
      if (draftPersistTimerRef.current !== null) window.clearTimeout(draftPersistTimerRef.current);
      draftPersistTimerRef.current = null;
    };
  }, [persistCurrentDraft]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (draftState === "clean") return;
      persistCurrentDraft();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draftState, persistCurrentDraft]);

  // Synchronize scroll between editor and preview panels
  const syncScroll = useCallback((source: HTMLDivElement, target: HTMLDivElement) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;

    const ratio = source.scrollTop / Math.max(1, source.scrollHeight - source.clientHeight);
    target.scrollTop = ratio * Math.max(0, target.scrollHeight - target.clientHeight);

    requestAnimationFrame(() => { isSyncingScroll.current = false; });
  }, []);

  const handleEditorScroll = useCallback(() => {
    if (editorScrollRef.current && previewScrollRef.current) {
      syncScroll(editorScrollRef.current, previewScrollRef.current);
    }
  }, [syncScroll]);

  const handlePreviewScroll = useCallback(() => {
    if (previewScrollRef.current && editorScrollRef.current) {
      syncScroll(previewScrollRef.current, editorScrollRef.current);
    }
  }, [syncScroll]);

  const handleProblemsChange = useCallback((nextProblems: Problem[]) => {
    setProblems(nextProblems);
    setHasProblemChanges(true);
  }, []);

  const handleChapterDeleted = useCallback((chapterId: string) => {
    const affectedCount = problems.filter((problem) => problem.chapterId === chapterId).length;
    if (affectedCount === 0) return;

    setProblems((currentProblems) => currentProblems.map((problem) => {
      if (problem.chapterId !== chapterId) return problem;
      return { ...problem, chapterId: undefined };
    }));

    setHasProblemChanges(true);
    toast.info(`已将 ${affectedCount} 道题移到无章节，保存笔记后生效`);
  }, [problems, toast]);

  const handleChapterManagerClose = useCallback(() => {
    setShowChapterManager(false);
    setChapterRefreshKey((key) => key + 1);
  }, []);

  const handleSave = useCallback(async () => {
    if (saveInFlightRef.current || isSaving || !routeReady || isLoadingExistingNote || loadError) return;
    if (recoverableDraft) {
      toast.info("请先选择恢复本机草稿或继续使用当前内容，再保存");
      return;
    }
    saveInFlightRef.current = true;
    try {
    if (isReviewMode) {
      // The review build intentionally has no remote write path. Preserve the
      // same local draft used by recovery so the editor remains testable.
      persistCurrentDraft();
      baselineFingerprintRef.current = draftFingerprint;
      setLastSavedAt(new Date());
      setDraftState("clean");
      toast.success("审查模式已保存本机草稿，正式环境再同步 Supabase");
      return;
    }

      const result = await saveNote({
      isEditMode,
      editingId,
      editingContentVersion,
      noteType,
      title,
      subject,
      tagInput,
      content,
      videos,
      problems,
      coverImage,
      isUploadingCover,
      });

    if (!result) {
      setDraftState("error");
      return;
    }
    baselineFingerprintRef.current = draftFingerprint;
    if (draftPersistTimerRef.current !== null) window.clearTimeout(draftPersistTimerRef.current);
    removeStorage(editorDraftStorageKey);
    setLastSavedAt(new Date());
    setDraftState("clean");
    for (const jobId of pendingMath3ClassificationJobsRef.current) claimJobResult(jobId);
    pendingMath3ClassificationJobsRef.current.clear();
    if (!isEditMode) removeStorage(CREATE_TASK_TARGET_STORAGE_KEY);
    setHasProblemChanges(false);
    router.push(getNoteReadPath({
      id: result.id,
      isPublished: isEditMode ? editingIsPublished : false,
    }));
    } finally {
      saveInFlightRef.current = false;
    }
  }, [
    claimJobResult,
    content,
    coverImage,
    draftFingerprint,
    editingContentVersion,
    editingId,
    editingIsPublished,
    editorDraftStorageKey,
    isEditMode,
    isLoadingExistingNote,
    isReviewMode,
    isSaving,
    isUploadingCover,
    loadError,
    noteType,
    persistCurrentDraft,
    problems,
    recoverableDraft,
    router,
    routeReady,
    saveNote,
    subject,
    tagInput,
    title,
    toast,
    videos,
  ]);

  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (event.repeat) return;
      void handleSaveRef.current();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const handleBack = () => {
    if (draftState !== "clean") {
      persistCurrentDraft();
      setShowLeaveConfirm(true);
      return;
    }
    persistCurrentDraft();
    router.push(returnPath);
  };

  const confirmLeave = () => {
    setShowLeaveConfirm(false);
    persistCurrentDraft();
    router.push(returnPath);
  };

  const handleTypeChange = (nextType: NoteType) => {
    if (nextType === noteType) return;
    const hasCurrentContent = hasRecoverableEditorContent({
      noteType,
      title,
      subject,
      tagInput,
      content,
      videos,
      problems,
      coverImage,
    });
    if (!hasCurrentContent) {
      setNoteType(nextType);
      setPendingTypeChange(null);
      return;
    }
    setPendingTypeChange(nextType);
  };

  const confirmTypeChange = () => {
    if (!pendingTypeChange) return;
    setNoteType(pendingTypeChange);
    setPendingTypeChange(null);
  };

  const clearEditorDraft = () => {
    if (isSaving) return;
    if (draftPersistTimerRef.current !== null) window.clearTimeout(draftPersistTimerRef.current);
    setRecoverableDraft(null);
    resetDraft();
    removeStorage(editorDraftStorageKey);
    const nextTargetId = createDraftTaskTargetId();
    writeJsonStorage(CREATE_TASK_TARGET_STORAGE_KEY, nextTargetId);
    setDraftTaskTargetId(nextTargetId);
    pendingMath3ClassificationJobsRef.current.clear();
    setHasProblemChanges(true);
  };

  const handleClear = () => {
    if (isSaving) return;
    const hasContent = hasRecoverableEditorContent({ noteType, title, subject, tagInput, content, videos, problems, coverImage });
    if (hasContent) {
      setShowClearConfirm(true);
      return;
    }
    clearEditorDraft();
  };

  // Editor toolbar handlers - only complex operations remain
  const uploadEditorImage = useCallback(async (file: File): Promise<string> => {
    const ext = (file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : undefined)
      || file.type.split("/")[1]?.split("+")[0]?.toLowerCase()
      || "png";
    const looksLikeImage = file.type.startsWith("image/")
      || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext);

    if (!looksLikeImage) {
      throw new Error("请选择图片文件");
    }

    const path = generateFileName("note", ext);
    return uploadImage(file, path);
  }, []);

  const handlePastedEditorImageUpload = useCallback(async (file: File): Promise<string> => {
    const url = await uploadEditorImage(file);
    toast.success("粘贴图片已上传并插入");
    return url;
  }, [toast, uploadEditorImage]);

  const handleEditorImageUpload = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("请选择图片文件");
        input.value = "";
        return;
      }
      if (!editorRef.current?.editor) {
        toast.error("编辑器还没有准备好，请稍后再试");
        input.value = "";
        return;
      }

      try {
        const url = await uploadEditorImage(file);
        editorRef.current.insertImage(url);
        toast.success("图片已插入");
      } catch (err: unknown) {
        toast.error(`图片上传失败：${err instanceof Error ? err.message : "未知错误"}`);
      } finally {
        input.value = "";
      }
    };
    input.click();
  };

  const handleInsertProblemReference = useCallback((marker: string) => {
    if (editorRef.current?.editor) {
      editorRef.current.insertMarkdown(marker);
    } else {
      setContent((current) => `${current.trimEnd()}${marker}`);
    }
    toast.success("已插入题目引用");
  }, [toast]);

  const handleInsertDocumentOcrMarkdown = useCallback((markdown: string) => {
    if (editorRef.current?.editor) {
      editorRef.current.insertMarkdown(markdown);
    } else {
      setContent((current) => `${current.trimEnd()}${markdown}`);
    }
    toast.success("讲义 OCR 内容已插入正文");
  }, [toast]);

  const handleReviewMarkdown = useCallback(async () => {
    if (isReviewingMarkdown) return;
    if (hasActiveMarkdownReviewJob) {
      toast.info("已有 Markdown 审阅任务在后台运行，可在右下角任务中心查看进度");
      return;
    }

    const currentMarkdown = content.trim();
    if (!currentMarkdown) {
      toast.error("正文为空，无法审查");
      return;
    }

    setIsReviewingMarkdown(true);
    try {
      const aiConfig = sanitizeAIConfig(
        readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig),
      );
      await createMarkdownReviewJob({
        markdown: content,
        model: aiConfig.deepseekModel,
        targetId: taskTargetId,
      });
      toast.success("Markdown 审阅已转入后台任务，可安全切换页面");
    } catch (error: unknown) {
      toast.error(`Markdown 审查失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsReviewingMarkdown(false);
    }
  }, [content, createMarkdownReviewJob, hasActiveMarkdownReviewJob, isReviewingMarkdown, taskTargetId, toast]);

  const handleApplyMarkdownReviewProposal = useCallback((proposal: MarkdownReviewProposal) => {
    if (content !== proposal.sourceMarkdown) {
      toast.error("正文已发生变化，请重新生成审阅建议");
      return;
    }

    if (editorRef.current?.editor) {
      editorRef.current.setMarkdown(proposal.reviewedMarkdown);
    } else {
      setContent(proposal.reviewedMarkdown);
    }
    setMarkdownReviewProposal(null);
    if (markdownReviewJobId) {
      claimJobResult(markdownReviewJobId);
      setMarkdownReviewJobId(null);
    }
    toast.success("已应用公式与标题修复，可继续编辑或撤销");
  }, [claimJobResult, content, markdownReviewJobId, toast]);

  const handleInsertEconomicsGraphMarkdown = useCallback((markdown: string) => {
    if (editorRef.current?.editor) {
      editorRef.current.insertMarkdown(markdown);
    } else {
      setContent((current) => `${current.trimEnd()}${markdown}`);
    }
  }, []);

  const isEssay = noteType === "essay";
  const isProblem = noteType === "problem";
  const isEconomicsNote = !isProblem && !isEssay && subject === "economics";

  if (!routeReady || isLoadingExistingNote) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-surface px-4 pb-20 pt-24 sm:px-6">
          <div className="surface-panel max-w-md p-6 text-center text-on-surface-variant">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span>{loadNotice ?? "正在准备编辑器..."}</span>
            </div>
            {loadNotice && (
              <p className="mt-3 text-xs leading-relaxed text-on-surface-variant/70">
                题集会一次性读取题干、答案和选项，数据量大时会比普通文章慢一些。
              </p>
            )}
          </div>
        </main>
    );
  }

  if (loadError) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-surface px-4 pb-20 pt-24 sm:px-6">
          <div className="surface-panel max-w-md space-y-4 p-6 text-center">
            <h1 className="text-2xl font-bold text-on-surface">无法编辑这篇笔记</h1>
            <p className="text-sm text-on-surface-variant">{loadError}</p>
            <button
              type="button"
              onClick={() => router.push(returnPath)}
              className="control-button px-4 py-2 text-sm"
            >
              返回笔记列表
            </button>
            <button type="button" onClick={() => window.location.reload()} className="control-button control-button-primary ml-2 min-h-11 px-4 text-sm">重新加载</button>
          </div>
        </main>
    );
  }

  return (
    <main className="page-template-workspace min-h-screen bg-surface pb-20 pt-24" data-page-template="workspace">
      <div className="page-frame page-frame--workspace">
        {/* Header */}
        <motion.div
          variants={surfaceMotion}
          initial="initial"
          animate="animate"
          transition={{ duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
          className="command-bar sticky top-20 z-30 mb-5 p-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="control-button mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center p-0"
                aria-label="返回笔记列表"
                title="返回笔记列表"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-on-surface-variant">
                  <span>{isEditMode ? "正在编辑" : "新建内容"} · {typeMap[noteType]}</span>
                  <span className="text-outline-variant">/</span>
                  <span aria-live="polite" className={`inline-flex items-center gap-1 ${draftState === "dirty" ? "text-amber-700" : draftState === "error" ? "text-red-600" : "text-emerald-700"}`}>
                    {draftState === "dirty" ? <AlertTriangle className="h-3.5 w-3.5" /> : draftState === "error" ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {draftState === "dirty" ? "有未保存修改" : draftState === "error" ? "保存失败，可重试" : lastSavedAt ? `已保存 ${lastSavedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "草稿已就绪"}
                  </span>
                </div>
                <h1 className="truncate font-headline text-2xl font-bold text-on-surface">
                  {title.trim() || `${isEditMode ? "未命名" : "创建新"}${typeMap[noteType]}`}
                </h1>
                <p className="mt-1 hidden items-center gap-1 text-xs text-on-surface-variant/65 sm:flex">
                  <Keyboard className="h-3.5 w-3.5" />
                  {saveShortcutLabel} 保存 · 返回会保留当前上下文
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleClear}
                disabled={isSaving}
                className="control-button h-10 px-3 text-sm"
              >
                <RotateCcw className="h-4 w-4" />
                清空
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="control-button control-button-primary h-10 px-4 text-sm"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? "保存中" : isEditMode ? "更新" : "保存为私人内容"}
              </button>
            </div>
          </div>
        </motion.div>

        {recoverableDraft && (
          <section role="status" className="surface-panel mb-5 space-y-3 border-amber-500/30 p-4">
            <p className="text-sm font-semibold text-on-surface">发现本机未保存的草稿</p>
            <p className="text-sm leading-6 text-on-surface-variant">当前显示的是已保存版本。确认后可恢复本机草稿，避免旧草稿自动覆盖最新内容。</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="control-button control-button-primary min-h-11 px-4 text-sm" onClick={() => { applyDraft(recoverableDraft); setHasProblemChanges(true); setRecoverableDraft(null); }}>恢复本机草稿</button>
              <button type="button" className="control-button min-h-11 px-4 text-sm" onClick={() => { removeStorage(editorDraftStorageKey); setRecoverableDraft(null); }}>继续使用已保存版本</button>
            </div>
          </section>
        )}

        {/* Type Selector */}
        <motion.div
          variants={surfaceMotion}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.04, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
          className="surface-toolbar mb-4 p-2"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="px-2 text-sm font-medium text-on-surface-variant">类型</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["note", "problem", "essay"] as NoteType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  aria-pressed={noteType === type}
                  className={`control-button h-9 min-h-0 px-4 text-sm ${
                    noteType === type ? "control-button-primary" : ""
                  }`}
                >
                  {typeMap[type]}
                </button>
              ))}
            </div>
          </div>
          {pendingTypeChange && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex flex-col gap-3 rounded-lg border border-primary/15 bg-primary/5 px-3 py-3 text-sm text-on-surface-variant sm:flex-row sm:items-center sm:justify-between"
              role="status"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  切换为「{typeMap[pendingTypeChange]}」后，当前内容会按新类型保存。
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPendingTypeChange(null)}
                  className="control-button h-9 min-h-0 px-3 text-xs"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmTypeChange}
                  className="control-button control-button-primary h-9 min-h-0 px-3 text-xs"
                >
                  继续切换
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Title Input */}
        <motion.div
          variants={surfaceMotion}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.06, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
          className="mb-4"
        >
          <label htmlFor="note-title" className="mb-2 block text-sm font-medium text-on-surface-variant">
            标题
          </label>
          <input
            id="note-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入标题..."
            className="field-control h-12 w-full px-4 text-base placeholder:text-on-surface-variant/40"
          />
        </motion.div>

        {/* Metadata & Cover */}
        <motion.section
          variants={surfaceMotion}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.08, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
          className="foldout-panel mb-6 p-2"
        >
          <button
            type="button"
            onClick={() => setShowMetaSection((value) => !value)}
            className="foldout-trigger px-3"
            aria-expanded={showMetaSection}
            aria-controls="create-metadata-panel"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              属性与封面
            </span>
            <span className="compact-meta-row justify-end">
              {!isEssay && <span>{subjectMap[subject]}</span>}
              {tagInput.trim() && <span>{tagInput.split(/[,，]/).filter((tag) => tag.trim()).length} 个标签</span>}
              {coverImage && <span>有封面</span>}
              <ChevronDown className="motion-chevron h-4 w-4" />
            </span>
          </button>

          <AnimatedDisclosure
            open={showMetaSection}
            id="create-metadata-panel"
            className="mt-2 border-t border-outline-variant/10"
          >
            <div className="space-y-4 p-3">
              <div className="grid gap-4 md:grid-cols-2">
                {!isEssay && (
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-3">
                      科目
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(Object.keys(subjectMap) as Subject[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSubject(key)}
                          className={`control-button h-9 min-h-0 px-3 text-sm ${
                            subject === key ? "control-button-primary" : ""
                          }`}
                        >
                          {subjectMap[key]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className={isEssay ? "md:col-span-2" : ""}>
                  <label className="block text-sm font-medium text-on-surface-variant mb-3">
                    标签
                  </label>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="输入标签，用逗号分隔..."
                    className="field-control h-11 w-full px-4 text-sm placeholder:text-on-surface-variant/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-3">
                  封面图片（可选）
                </label>
                <div className="flex gap-3 items-start">
                  <input
                    type="text"
                    value={coverImage}
                    onChange={(e) => setCoverImageUrl(e.target.value)}
                    placeholder="输入图片 URL..."
                    className="field-control h-11 min-w-0 flex-1 px-4 text-sm placeholder:text-on-surface-variant/40"
                  />
                  <label
                    className={`control-button h-11 w-11 flex-shrink-0 p-0 ${
                      isUploadingCover ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                    }`}
                    title={isUploadingCover ? "上传中" : "上传图片"}
                    aria-disabled={isUploadingCover}
                  >
                    {isUploadingCover ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isUploadingCover}
                      onChange={handleCoverImageUpload}
                    />
                  </label>
                  {coverImage && (
                    <button
                      type="button"
                      onClick={clearCoverImage}
                      className="control-button h-11 w-11 flex-shrink-0 p-0"
                      title="清除封面"
                      aria-label="清除封面"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
                {coverUploadError && (
                  <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                    {coverUploadError}
                  </div>
                )}
                {isUploadingCover && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-on-surface-variant/60">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    正在上传封面图片...
                  </div>
                )}
                {coverPreviewSrc && (
                  <div className="mt-3 max-h-48 overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Cover previews can be external URLs or legacy data URLs. */}
                    <img src={coverPreviewSrc} alt="封面预览" className="h-48 w-full object-cover" />
                  </div>
                )}
              </div>
            </div>
          </AnimatedDisclosure>
        </motion.section>

        {/* Content Editor / Problem Editor */}
        <motion.div
          variants={surfaceMotion}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.1, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
          className="mb-8"
        >
          {isProblem ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-on-surface-variant">
                  题目
                </label>
                <button
                  onClick={() => setShowChapterManager(true)}
                  className="control-button h-9 min-h-0 px-3 text-xs"
                >
                  <FolderTree className="w-3.5 h-3.5" />
                  章节管理
                </button>
              </div>
              <ProblemEditor
                title={title}
                problems={problems}
                onChange={handleProblemsChange}
                noteId={isEditMode ? editingId : undefined}
                taskTargetId={taskTargetId}
                onMath3ClassificationApplied={handleMath3ClassificationApplied}
                subject={subject}
                hasUnsavedChanges={isEditMode && hasProblemChanges}
                chapterRefreshKey={chapterRefreshKey}
              />
            </>
          ) : (
            <>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="block text-sm font-medium text-on-surface-variant">
                  内容
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowProblemReferencePicker((value) => !value)}
                    className={`control-button h-9 min-h-0 px-3 text-xs ${showProblemReferencePicker ? "control-button-selected" : ""}`}
                    aria-expanded={showProblemReferencePicker}
                    aria-controls="create-problem-reference-picker"
                  >
                    <Target className="h-3.5 w-3.5" />
                    题目引用
                    <ChevronDown className="motion-chevron h-3.5 w-3.5" />
                  </button>
                  {isEconomicsNote && (
                    <button
                      type="button"
                      onClick={() => setShowEconomicsGraphComposer((value) => !value)}
                      className={`control-button h-9 min-h-0 px-3 text-xs ${showEconomicsGraphComposer ? "control-button-selected" : ""}`}
                      aria-expanded={showEconomicsGraphComposer}
                      aria-controls="create-economics-graph-composer"
                    >
                      <LineChart className="h-3.5 w-3.5" />
                      曲线卡片
                      <ChevronDown className="motion-chevron h-3.5 w-3.5" />
                    </button>
                  )}
                  {/* Mode Toggle */}
                  <div className="grid w-full grid-cols-3 overflow-hidden rounded-lg border border-outline-variant/20 sm:flex sm:w-auto">
                    <button
                      onClick={() => setViewMode("split")}
                      className={`motion-ui motion-interactive px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 ${
                        viewMode === "split"
                          ? "bg-primary/10 text-primary"
                          : "text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      <Columns className="w-3.5 h-3.5" />
                      分屏
                    </button>
                    <button
                      onClick={() => setViewMode("editor")}
                      className={`motion-ui motion-interactive px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 ${
                        viewMode === "editor"
                          ? "bg-primary/10 text-primary"
                          : "text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      仅编辑
                    </button>
                    <button
                      onClick={() => setViewMode("preview")}
                      className={`motion-ui motion-interactive px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 ${
                        viewMode === "preview"
                          ? "bg-primary/10 text-primary"
                          : "text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      仅预览
                    </button>
                  </div>
                </div>
              </div>

              <AnimatedDisclosure open={showProblemReferencePicker} id="create-problem-reference-picker">
                <ProblemReferencePicker
                  isOpen={true}
                  onInsert={handleInsertProblemReference}
                />
              </AnimatedDisclosure>

              {isEconomicsNote && (
                <AnimatedDisclosure open={showEconomicsGraphComposer} id="create-economics-graph-composer">
                  <EconomicsGraphComposer onInsert={handleInsertEconomicsGraphMarkdown} targetId={taskTargetId} />
                </AnimatedDisclosure>
              )}

              {viewMode === "split" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Editor Panel */}
                  <div
                    className="flex min-h-[320px] flex-col overflow-visible rounded-lg border border-outline-variant/20 bg-surface-container-low lg:h-auto lg:min-h-[320px]"
                  >
                    {editorReady && (
                      <div className="sticky top-0 z-20 shrink-0 rounded-t-lg border-b border-outline-variant/20 bg-surface-container-low/95 backdrop-blur-md">
                        <EditorToolbar
                          editor={toolbarEditor}
                          onImageUpload={handleEditorImageUpload}
                          onDocumentOcrOpen={() => setShowDocumentOcrDialog(true)}
                          onReviewMarkdown={handleReviewMarkdown}
                          isReviewingMarkdown={isReviewingMarkdown || hasActiveMarkdownReviewJob}
                        />
                      </div>
                    )}
                    {/* Scrollable Editor */}
                    <div
                      ref={editorScrollRef}
                      onScroll={handleEditorScroll}
                      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-b-lg
                        [&::-webkit-scrollbar]:w-1.5
                        [&::-webkit-scrollbar-thumb]:bg-outline-variant/30
                        [&::-webkit-scrollbar-thumb]:rounded-full"
                    >
                      <LazyRichTextEditor
                        ref={editorRef}
                        content={content}
                        onChange={setContent}
                        onImageUpload={handlePastedEditorImageUpload}
                      onReady={(editor) => {
                          setEditorReady(true);
                          setToolbarEditor(editor);
                        }}
                        density="compact"
                        placeholder={isEssay ? "记录你的想法..." : "在此输入内容，支持 Markdown 语法..."}
                      />
                      {/* Character Count */}
                      <div className="flex justify-between items-center px-6 pb-3 text-xs text-on-surface-variant/60">
                        <span>
                          字数: {contentStats.wordCount.toLocaleString()} |
                          字符: {contentStats.characterCount.toLocaleString()}
                        </span>
                        <span>Markdown</span>
                      </div>
                    </div>
                  </div>

                  {/* Preview Panel */}
                  <div
                    className="flex min-h-[320px] flex-col overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-low lg:h-auto lg:min-h-[320px]"
                  >
                    {/* Preview Header */}
                    <div className="shrink-0 border-b border-outline-variant/20 px-4 py-2 flex items-center" style={{ minHeight: '48px' }}>
                      <span className="text-xs font-medium text-on-surface-variant/40">实时预览</span>
                    </div>
                    {/* Scrollable Preview */}
                    <div
                      ref={previewScrollRef}
                      onScroll={handlePreviewScroll}
                      className="overflow-y-auto flex-1 min-h-0
                        [&::-webkit-scrollbar]:w-1.5
                        [&::-webkit-scrollbar-thumb]:bg-outline-variant/30
                        [&::-webkit-scrollbar-thumb]:rounded-full"
                    >
                      <div className="p-6">
                        <ContentPreview
                          content={content}
                          className="text-on-surface-variant"
                          enableEconomicsTerms={isEconomicsNote}
                          enableEconomicsGraphs={isEconomicsNote}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {viewMode === "editor" && (
                <div
                    className="flex min-h-[320px] flex-col overflow-visible rounded-lg border border-outline-variant/20 bg-surface-container-low lg:h-auto lg:min-h-[320px]"
                >
                  {editorReady && (
                    <div className="sticky top-0 z-20 shrink-0 rounded-t-lg border-b border-outline-variant/20 bg-surface-container-low/95 backdrop-blur-md">
                      <EditorToolbar
                        editor={toolbarEditor}
                        onImageUpload={handleEditorImageUpload}
                        onDocumentOcrOpen={() => setShowDocumentOcrDialog(true)}
                        onReviewMarkdown={handleReviewMarkdown}
                        isReviewingMarkdown={isReviewingMarkdown || hasActiveMarkdownReviewJob}
                      />
                    </div>
                  )}
                  <div
                    ref={editorScrollRef}
                    className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-b-lg
                      [&::-webkit-scrollbar]:w-1.5
                      [&::-webkit-scrollbar-thumb]:bg-outline-variant/30
                      [&::-webkit-scrollbar-thumb]:rounded-full"
                  >
                    <LazyRichTextEditor
                      ref={editorRef}
                      content={content}
                      onChange={setContent}
                      onImageUpload={handlePastedEditorImageUpload}
                      onReady={(editor) => {
                          setEditorReady(true);
                          setToolbarEditor(editor);
                        }}
                        density="compact"
                        placeholder={isEssay ? "记录你的想法..." : "在此输入内容，支持 Markdown 语法..."}
                    />
                    <div className="flex justify-between items-center px-6 pb-3 text-xs text-on-surface-variant/60">
                      <span>
                        字数: {contentStats.wordCount.toLocaleString()} |
                        字符: {contentStats.characterCount.toLocaleString()}
                      </span>
                      <span>Markdown</span>
                    </div>
                  </div>
                </div>
              )}

              {viewMode === "preview" && (
                <div className="py-6">
                  <ContentPreview
                    content={content}
                    className="text-on-surface-variant text-lg leading-relaxed"
                    enableEconomicsTerms={isEconomicsNote}
                    enableEconomicsGraphs={isEconomicsNote}
                  />
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* Video Section (hidden for essay) */}
        {!isEssay && (
          <motion.div
            variants={surfaceMotion}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.12, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
            className="foldout-panel mb-8 p-2"
          >
            <button
              type="button"
              onClick={() => setShowVideoSection((value) => !value)}
              className="foldout-trigger px-3"
              aria-expanded={showVideoSection}
              aria-controls="create-video-panel"
            >
              <span className="inline-flex items-center gap-2">
                <VideoIcon className="h-4 w-4" />
                关联视频
              </span>
              <span className="compact-meta-row justify-end">
                {videos.length > 0 && <span>{videos.length} 个视频</span>}
                <ChevronDown className="motion-chevron h-4 w-4" />
              </span>
            </button>

            <AnimatedDisclosure
              open={showVideoSection}
              id="create-video-panel"
              className="mt-2 border-t border-outline-variant/10 p-3 overscroll-contain"
            >
                <Playlist
                  videos={videos}
                  onChange={setVideos}
                  editable={true}
                />
            </AnimatedDisclosure>
          </motion.div>
        )}

        <div className="h-6" />
      </div>
      {/* Chapter Manager Modal */}
      {showChapterManager && (
        <ChapterManager
          isOpen={showChapterManager}
          onClose={handleChapterManagerClose}
          noteId={isEditMode ? editingId : undefined}
          onChapterDeleted={handleChapterDeleted}
        />
      )}
      <DocumentOcrDialog
        isOpen={showDocumentOcrDialog}
        onClose={() => setShowDocumentOcrDialog(false)}
        onInsert={handleInsertDocumentOcrMarkdown}
      />
      <MarkdownReviewProposalDialog
        key={markdownReviewProposal?.proposalId ?? "closed"}
        proposal={markdownReviewProposal}
        currentMarkdown={content}
        onClose={() => {
          setMarkdownReviewProposal(null);
          setMarkdownReviewJobId(null);
        }}
        onApply={handleApplyMarkdownReviewProposal}
      />
      <ConfirmDialog
        isOpen={showLeaveConfirm}
        title="离开编辑页"
        description="当前有未保存修改，离开前已保留本机草稿。下次返回创建页时可以继续恢复。"
        confirmLabel="离开并保留草稿"
        tone="primary"
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={confirmLeave}
      />
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="清空当前内容"
        description="这会清空当前编辑器里的内容，并重新开始一份草稿；已经保存到服务器的文章不会被删除。"
        confirmLabel="清空内容"
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => {
          setShowClearConfirm(false);
          clearEditorDraft();
        }}
      />
    </main>
  );
}

export default function CreatePage() {
  return (
    <AdminGate>
      <Suspense fallback={<EditorModuleFallback label="正在准备编辑器..." />}>
        <CreateEditorRoute />
      </Suspense>
    </AdminGate>
  );
}

function CreateEditorRoute() {
  const searchParams = useSearchParams();
  const routeKey = `${searchParams.get("edit") ?? "new"}:${searchParams.get("import") ?? ""}`;
  return <CreateEditorPage key={routeKey} />;
}
