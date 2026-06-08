"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Editor } from "@tiptap/react";
import { Save, RotateCcw, X, Image as ImageIcon, FolderTree, Columns, Maximize2, Eye, Loader2, ChevronDown, ChevronUp, SlidersHorizontal, Video as VideoIcon, Target } from "lucide-react";
import { Subject, subjectMap, NoteType, typeMap, Video, Problem } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import type { RichTextEditorRef } from "@/components/editor/RichTextEditor";
import { LazyRichTextEditor } from "@/components/editor/LazyRichTextEditor";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { uploadImage, generateFileName } from "@/lib/supabase-storage";
import { splitMath3PracticeTags } from "@/lib/math3-practice";
import { AdminGate } from "@/components/auth/AdminGate";
import { ProblemReferencePicker } from "@/components/problems/ProblemReferencePicker";
import { useCoverUpload } from "@/hooks/useCoverUpload";
import { useNoteSave } from "@/hooks/useNoteSave";
import { type ImportDraft, type NoteEditorDraft, useNoteEditorRoute } from "@/hooks/useNoteEditorRoute";

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
  const toast = useToast();
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
  const [showProblemReferencePicker, setShowProblemReferencePicker] = useState(false);
  const [viewMode, setViewMode] = useState<"split" | "editor" | "preview">("editor");
  const editorRef = useRef<RichTextEditorRef>(null);
  const [toolbarEditor, setToolbarEditor] = useState<Editor | null>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);

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
    setCoverImageUrl("");
  }, [setCoverImageUrl]);

  const {
    routeReady,
    isEditMode,
    editingId,
    isLoadingExistingNote,
    loadNotice,
    loadError,
  } = useNoteEditorRoute({
    initialImportDraft,
    applyDraft,
    resetDraft,
  });

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

  const handleSave = async () => {
    const result = await saveNote({
      isEditMode,
      editingId,
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

    if (!result) return;
    setHasProblemChanges(false);
    router.push("/notes/" + result.id);
  };

  const handleClear = () => {
    if (isSaving) return;
    resetDraft();
    setHasProblemChanges(true);
  };

  // Editor toolbar handlers - only complex operations remain
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
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        const path = generateFileName("note", ext);
        const url = await uploadImage(file, path);
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

  const isEssay = noteType === "essay";
  const isProblem = noteType === "problem";

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
              onClick={() => router.push("/notes")}
              className="control-button px-4 py-2 text-sm"
            >
              返回笔记列表
            </button>
          </div>
        </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface pb-20 pt-24">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="command-bar sticky top-20 z-30 mb-5 p-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-on-surface-variant">
                {isEditMode ? "正在编辑" : "新建内容"} · {typeMap[noteType]}
              </p>
              <h1 className="truncate font-headline text-2xl font-bold text-on-surface">
                {title.trim() || `${isEditMode ? "未命名" : "创建新"}${typeMap[noteType]}`}
              </h1>
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
                {isSaving ? "保存中" : isEditMode ? "更新" : "发布"}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Type Selector */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="surface-toolbar mb-4 p-2"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="px-2 text-sm font-medium text-on-surface-variant">类型</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["note", "problem", "essay"] as NoteType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setNoteType(type)}
                  className={`control-button h-9 min-h-0 px-4 text-sm ${
                    noteType === type ? "control-button-primary" : ""
                  }`}
                >
                  {typeMap[type]}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Title Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-4"
        >
          <label className="mb-2 block text-sm font-medium text-on-surface-variant">
            标题
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入标题..."
            className="field-control h-12 w-full px-4 text-base placeholder:text-on-surface-variant/40"
          />
        </motion.div>

        {/* Metadata & Cover */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="foldout-panel mb-6 p-2"
        >
          <button
            type="button"
            onClick={() => setShowMetaSection((value) => !value)}
            className="foldout-trigger px-3"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              属性与封面
            </span>
            <span className="compact-meta-row justify-end">
              {!isEssay && <span>{subjectMap[subject]}</span>}
              {tagInput.trim() && <span>{tagInput.split(/[,，]/).filter((tag) => tag.trim()).length} 个标签</span>}
              {coverImage && <span>有封面</span>}
              {showMetaSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>

          {showMetaSection && (
            <div className="mt-2 space-y-4 border-t border-outline-variant/10 p-3">
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
          )}
        </motion.section>

        {/* Content Editor / Problem Editor */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
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
                problems={problems}
                onChange={handleProblemsChange}
                noteId={isEditMode ? editingId : undefined}
                subject={subject}
                hasUnsavedChanges={isEditMode && hasProblemChanges}
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
                  >
                    <Target className="h-3.5 w-3.5" />
                    题目引用
                    {showProblemReferencePicker ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {/* Mode Toggle */}
                  <div className="grid w-full grid-cols-3 overflow-hidden rounded-lg border border-outline-variant/20 sm:flex sm:w-auto">
                    <button
                      onClick={() => setViewMode("split")}
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
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
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
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
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
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

              <ProblemReferencePicker
                isOpen={showProblemReferencePicker}
                onInsert={handleInsertProblemReference}
              />

              {viewMode === "split" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Editor Panel */}
                  <div
                    className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-low lg:max-h-[calc(100vh-500px)]"
                  >
                    {/* Sticky Toolbar */}
                    {editorReady && (
                      <div className="sticky top-0 z-10 shrink-0 border-b border-outline-variant/20">
                        <EditorToolbar
                          editor={toolbarEditor}
                          onImageUpload={handleEditorImageUpload}
                        />
                      </div>
                    )}
                    {/* Scrollable Editor */}
                    <div
                      ref={editorScrollRef}
                      onScroll={handleEditorScroll}
                      className="overflow-y-auto flex-1 min-h-0
                        [&::-webkit-scrollbar]:w-1.5
                        [&::-webkit-scrollbar-thumb]:bg-outline-variant/30
                        [&::-webkit-scrollbar-thumb]:rounded-full"
                    >
                      <LazyRichTextEditor
                        ref={editorRef}
                        content={content}
                        onChange={setContent}
                        onReady={(editor) => {
                          setEditorReady(true);
                          setToolbarEditor(editor);
                        }}
                        placeholder={isEssay ? "记录你的想法..." : "在此输入内容，支持 Markdown 语法..."}
                      />
                      {/* Character Count */}
                      <div className="flex justify-between items-center px-6 pb-3 text-xs text-on-surface-variant/60">
                        <span>
                          字数: {content.replace(/\s/g, "").length.toLocaleString()} |
                          字符: {content.length.toLocaleString()}
                        </span>
                        <span>Markdown</span>
                      </div>
                    </div>
                  </div>

                  {/* Preview Panel */}
                  <div
                    className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-low lg:max-h-[calc(100vh-500px)]"
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
                        <ContentPreview content={content} className="text-on-surface-variant" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {viewMode === "editor" && (
                <div
                  className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-low lg:max-h-[calc(100vh-400px)]"
                >
                  {editorReady && (
                    <div className="sticky top-0 z-10 shrink-0 border-b border-outline-variant/20">
                      <EditorToolbar
                        editor={toolbarEditor}
                        onImageUpload={handleEditorImageUpload}
                      />
                    </div>
                  )}
                  <div
                    ref={editorScrollRef}
                    className="overflow-y-auto flex-1 min-h-0
                      [&::-webkit-scrollbar]:w-1.5
                      [&::-webkit-scrollbar-thumb]:bg-outline-variant/30
                      [&::-webkit-scrollbar-thumb]:rounded-full"
                  >
                    <LazyRichTextEditor
                      ref={editorRef}
                      content={content}
                      onChange={setContent}
                      onReady={(editor) => {
                        setEditorReady(true);
                        setToolbarEditor(editor);
                      }}
                      placeholder={isEssay ? "记录你的想法..." : "在此输入内容，支持 Markdown 语法..."}
                    />
                    <div className="flex justify-between items-center px-6 pb-3 text-xs text-on-surface-variant/60">
                      <span>
                        字数: {content.replace(/\s/g, "").length.toLocaleString()} |
                        字符: {content.length.toLocaleString()}
                      </span>
                      <span>Markdown</span>
                    </div>
                  </div>
                </div>
              )}

              {viewMode === "preview" && (
                <div className="py-6">
                  <ContentPreview content={content} className="text-on-surface-variant text-lg leading-relaxed" />
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* Video Section (hidden for essay) */}
        {!isEssay && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="foldout-panel mb-8 p-2"
          >
            <button
              type="button"
              onClick={() => setShowVideoSection((value) => !value)}
              className="foldout-trigger px-3"
            >
              <span className="inline-flex items-center gap-2">
                <VideoIcon className="h-4 w-4" />
                关联视频
              </span>
              <span className="compact-meta-row justify-end">
                {videos.length > 0 && <span>{videos.length} 个视频</span>}
                {showVideoSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>

            {showVideoSection && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-2 border-t border-outline-variant/10 p-3 overscroll-contain"
              >
                <Playlist
                  videos={videos}
                  onChange={setVideos}
                  editable={true}
                />
              </motion.div>
            )}
          </motion.div>
        )}

        <div className="h-6" />
      </div>
      {/* Chapter Manager Modal */}
      {showChapterManager && (
        <ChapterManager
          isOpen={showChapterManager}
          onClose={() => setShowChapterManager(false)}
          noteId={isEditMode ? editingId : undefined}
          onChapterDeleted={handleChapterDeleted}
        />
      )}
    </main>
  );
}

export default function CreatePage() {
  return (
    <AdminGate>
      <CreateEditorPage />
    </AdminGate>
  );
}
