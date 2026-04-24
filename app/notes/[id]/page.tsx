"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Calendar, Tag, Edit2, Trash2, AlertTriangle, ChevronDown, ChevronUp, BookOpen, BookMarked, Loader2, Clock } from "lucide-react";
import { notesApi } from "@/lib/supabase";
import { subjectMap, typeMap, Note } from "@/lib/types";
import { estimateReadingTime } from "@/lib/utils";
import { Playlist } from "@/components/video/Playlist";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { ProblemCard } from "@/components/problems/ProblemCard";
import { ProblemStats } from "@/components/problems/ProblemStats";
import { ProblemList } from "@/components/problems/ProblemList";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { TableOfContents } from "@/components/ui/TableOfContents";
import { useReadingPreferences } from "@/lib/useReadingPreferences";
import { ReadingProgress } from "@/components/ui/ReadingProgress";

export default function NoteReaderPage() {
  const router = useRouter();
  const params = useParams();
  const { preferences } = useReadingPreferences();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isCoverExpanded, setIsCoverExpanded] = useState(false);
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  const [inlineVideoIndex, setInlineVideoIndex] = useState<number | null>(null);

  // Load note from Supabase
  useEffect(() => {
    loadNote();
  }, [params.id]);

  const loadNote = async () => {
    try {
      setLoading(true);
      const data = await notesApi.getById(params.id as string);
      setNote(data);
    } catch (error) {
      console.error("Failed to load note:", error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-expand cover image when note is loaded
  useEffect(() => {
    if (note && note.coverImage) {
      setIsCoverExpanded(true);
    }
  }, [note]);

  const handleDelete = async () => {
    try {
      await notesApi.delete(params.id as string);
      setShowDeleteConfirm(false);
      router.push("/notes");
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  };

  if (loading) {
    return (
      <main className="pt-32 pb-20 px-6 min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-on-surface-variant">加载笔记中...</span>
        </div>
      </main>
    );
  }

  if (!note) {
    return (
      <main className="pt-32 pb-20 px-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-on-surface mb-4">笔记不存在</h1>
          <Link
            href="/notes"
            className="text-primary hover:underline font-medium"
          >
            返回笔记列表
          </Link>
        </div>
      </main>
    );
  }

  const isProblem = note.type === "problem";
  const isEssay = note.type === "essay";

  return (
    <main className="pt-24 pb-20 min-h-screen">
      {/* Reading Progress Bar */}
      {preferences.showProgressBar && <ReadingProgress />}

      {/* Top Bar with Breadcrumb and Immersive Mode Button */}
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link
          href="/notes"
          className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors duration-300"
        >
          <ArrowLeft className="w-4 h-4" />
          返回笔记列表
        </Link>
        
        {/* Immersive Reading Button - Only for notes and essays */}
        {!isProblem && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            onClick={() => setIsImmersiveMode(true)}
            className="p-2.5 rounded-xl bg-surface-container-low text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-all duration-300 shadow-ambient"
            title="沉浸阅读模式"
          >
            <BookMarked className="w-5 h-5" />
          </motion.button>
        )}
      </div>

      {/* Cover Image (Collapsible) */}
      {note.coverImage && (
        <div className="max-w-7xl mx-auto px-6 mb-6">
          <motion.div
            initial={false}
            animate={{ height: isCoverExpanded ? "auto" : 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl overflow-hidden shadow-elevated">
              <img
                src={note.coverImage}
                alt={note.title}
                className="w-full object-cover max-h-[480px]"
              />
            </div>
          </motion.div>
          <button
            onClick={() => setIsCoverExpanded(!isCoverExpanded)}
            className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors mt-2"
          >
            {isCoverExpanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                收起封面
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                展开封面
              </>
            )}
          </button>
        </div>
      )}

      {/* Main Layout: Content + Sidebar */}
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Article Content */}
        <div className={preferences.tocPosition === "hidden" ? "lg:col-span-12" : "lg:col-span-9"}>
          {/* Article Header */}
          <motion.header
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="pb-6 border-l-2 border-primary-container pl-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  isProblem
                    ? "bg-primary-container text-on-primary"
                    : isEssay
                    ? "bg-amber-100 text-amber-800"
                    : "bg-surface-container-highest text-on-surface"
                }`}
              >
                {typeMap[note.type]}
              </span>
              {note.subject && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-surface-container-low text-on-surface-variant">
                  {subjectMap[note.subject]}
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-on-surface mb-4 font-headline">
              {note.title}
            </h1>

            <div className="flex items-center gap-6 text-sm text-on-surface-variant">
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {note.createdAt.toLocaleDateString("zh-CN")}
              </span>
              {!isProblem && (
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  预计阅读 {estimateReadingTime(note.content)} 分钟
                </span>
              )}
              <span className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                <div className="flex items-center gap-2 flex-wrap">
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 rounded-md bg-surface-container-high text-on-surface-variant text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6 pt-6 border-t border-outline-variant/10">
              <Link
                href={`/create?edit=${note.id}`}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors duration-200 text-sm font-medium"
              >
                <Edit2 className="w-4 h-4" />
                编辑
              </Link>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors duration-200 text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" />
                删除
              </button>
            </div>
          </motion.header>

          {/* Delete Confirmation Modal */}
          <AnimatePresence>
            {showDeleteConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                onClick={() => setShowDeleteConfirm(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-surface-container-lowest rounded-xl shadow-elevated p-6 max-w-sm w-full mx-4"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <h3 className="text-lg font-bold text-on-surface">确认删除</h3>
                  </div>
                  <p className="text-sm text-on-surface-variant mb-6">
                    确定要删除「{note.title}」吗？此操作不可撤销。
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors text-sm font-medium"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                      确认删除
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline Video Player (shown when clicking play in sidebar) */}
          <AnimatePresence>
            {inlineVideoIndex !== null && note.videos && note.videos[inlineVideoIndex] && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="mb-8"
              >
                <VideoPlayer 
                  video={note.videos[inlineVideoIndex]} 
                  autoPlay={true}
                  inlineMode={true}
                  onExitInline={() => setInlineVideoIndex(null)}
                />
              </motion.section>
            )}
          </AnimatePresence>

          {/* Article Content */}
          <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="py-8"
          >
            {isProblem && note.problems && note.problems.length > 0 ? (
              <>
                {/* Problem Stats */}
                <ProblemStats problems={note.problems} />
                {/* Problem List */}
                <div className="space-y-6">
                  {note.problems.map((problem, index) => (
                    <ProblemCard key={problem.id} problem={problem} index={index} />
                  ))}
                </div>
              </>
            ) : (
              <>
                <MarkdownContent 
                  content={note.content} 
                  className="text-on-surface-variant" 
                  style={{ fontSize: `${preferences.fontSize}px` }}
                />
              </>
            )}
          </motion.article>
        </div>

        {/* Sidebar: Video Player + TOC (hidden when TOC is hidden) */}
        {preferences.tocPosition !== "hidden" && (
          <aside className="lg:col-span-3 space-y-6 min-w-[280px]">
            <AnimatePresence>
              {note.videos && note.videos.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="lg:sticky lg:top-24 bg-surface-container-lowest rounded-xl p-4 shadow-ambient overscroll-contain"
                >
                  <Playlist 
                    videos={note.videos} 
                    editable={false}
                    onPlay={(index) => setInlineVideoIndex(index)}
                  />
                </motion.section>
              )}
            </AnimatePresence>

            {/* Table of Contents for notes/essays, or Problem Stats for problems */}
            <AnimatePresence>
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: 0.35, duration: 0.5 }}
                className="lg:sticky lg:top-24 bg-surface-container-lowest rounded-xl p-4 shadow-ambient"
              >
                {isProblem && note.problems && note.problems.length > 0 ? (
                  <ProblemList problems={note.problems} />
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-outline-variant/10">
                      <BookOpen className="w-4 h-4 text-on-surface-variant" />
                      <h3 className="text-sm font-bold text-on-surface">目录</h3>
                    </div>
                    <TableOfContents content={note.content} />
                  </>
                )}
              </motion.section>
            </AnimatePresence>
          </aside>
        )}
      </div>

      {/* Immersive Reading Mode */}
      <AnimatePresence>
        {isImmersiveMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[100] bg-surface-container-lowest overflow-y-auto"
            onClick={() => setIsImmersiveMode(false)}
          >
            {/* Immersive Header */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="sticky top-0 bg-surface-container-lowest/80 backdrop-blur-xl border-b border-outline-variant/10 z-10"
            >
              <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
                <button
                  onClick={() => setIsImmersiveMode(false)}
                  className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors duration-300"
                >
                  <ArrowLeft className="w-4 h-4" />
                  退出沉浸模式
                </button>
                <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                  <span className="px-2 py-1 rounded-md bg-surface-container-high">
                    {typeMap[note.type]}
                  </span>
                  {note.subject && (
                    <span>{subjectMap[note.subject]}</span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Immersive Content */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
              className="max-w-3xl mx-auto px-6 py-12"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="text-4xl md:text-5xl font-bold text-on-surface mb-8 font-headline leading-tight"
              >
                {note.title}
              </motion.h1>

              {/* Meta Info */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="flex items-center gap-4 text-sm text-on-surface-variant mb-12 pb-8 border-b border-outline-variant/10"
              >
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {note.createdAt.toLocaleDateString("zh-CN")}
                </span>
                {!isProblem && (
                  <>
                    <span className="text-on-surface-variant/30">·</span>
                    <span className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      预计阅读 {estimateReadingTime(note.content)} 分钟
                    </span>
                  </>
                )}
                {note.tags.length > 0 && (
                  <>
                    <span className="text-on-surface-variant/30">·</span>
                    <span className="flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      {note.tags.join("、")}
                    </span>
                  </>
                )}
              </motion.div>

              {/* Content */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="prose prose-lg max-w-none"
              >
                {isProblem && note.problems && note.problems.length > 0 ? (
                  <div className="space-y-8">
                    {note.problems.map((problem, index) => (
                      <ProblemCard key={problem.id} problem={problem} index={index} />
                    ))}
                  </div>
                ) : (
                  <MarkdownContent 
                    content={note.content} 
                    className="text-on-surface leading-relaxed text-lg" 
                  />
                )}
              </motion.div>

              {/* Bottom spacer */}
              <div className="h-32" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
