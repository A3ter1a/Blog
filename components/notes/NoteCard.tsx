"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { subjectMap, typeMap, type Note } from "@/lib/types";
import { FileText, BookOpen, Calendar, Check, Clock } from "lucide-react";
import { estimateReadingTime } from "@/lib/utils";
import { getVisibleNoteTags } from "@/lib/math3-practice";

interface NoteCardProps {
  note: Note;
  index: number;
  isSelected?: boolean;
  onToggleSelect?: (noteId: string) => void;
  selectMode?: boolean;
}

export function NoteCard({ note, index, isSelected = false, onToggleSelect, selectMode = false }: NoteCardProps) {
  const isProblem = note.type === "problem";
  const isEssay = note.type === "essay";
  const createdAt = note.createdAt instanceof Date ? note.createdAt : new Date(String(note.createdAt));
  const updatedAt = note.updatedAt instanceof Date ? note.updatedAt : new Date(String(note.updatedAt));
  const animationDelay = Math.min(index * 0.04, 0.32);
  const visibleTags = getVisibleNoteTags(note.tags);
  const hasReadableContent = !isProblem && Boolean(note.content?.trim());

  const handleClick = (e: React.MouseEvent) => {
    if (selectMode && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(note.id);
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: animationDelay, duration: 0.25 }}
      whileHover={{ y: -2, transition: { duration: 0.16 } }}
      onClick={handleClick}
      className={`surface-card group h-full cursor-pointer overflow-hidden ${
        selectMode
          ? isSelected
            ? "border-primary/50 bg-primary/5 ring-2 ring-primary/15"
            : ""
          : ""
      }`}
    >
      <Link href={`/notes/${note.id}`} className="flex h-full flex-col" onClick={selectMode ? (e) => e.preventDefault() : undefined}>
        {/* Cover Image or Placeholder */}
        <div className="relative h-32 overflow-hidden bg-surface-container-low">
          {note.coverImage ? (
            // Has cover image
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- Saved cover images can be data URLs or arbitrary user-provided URLs. */}
              <img
                src={note.coverImage}
                alt={note.title}
                loading={index < 3 ? "eager" : "lazy"}
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            </>
          ) : (
            // No cover image - show placeholder
            <div className="relative h-full overflow-hidden bg-surface-container-low">
              <div className="absolute inset-0 bg-primary/[0.03]" />
              <div className="absolute inset-0 flex items-center justify-center">
                {isProblem ? (
                  <BookOpen className="h-10 w-10 text-primary/30" />
                ) : isEssay ? (
                  <span className="font-headline text-4xl text-primary/25">A</span>
                ) : (
                  <FileText className="h-10 w-10 text-primary/30" />
                )}
              </div>
            </div>
          )}
          
          {/* Selection Checkbox (visible in select mode) */}
          {selectMode && (
            <div className="absolute top-4 left-4 z-10">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleSelect?.(note.id);
                }}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 ${
                  isSelected
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-lowest/80 backdrop-blur-sm border-2 border-outline-variant"
                }`}
              >
                {isSelected && <Check className="w-4 h-4" />}
              </button>
            </div>
          )}

          {/* Type Badge (hidden in select mode, replaced by checkbox) */}
          {!selectMode && (
            <div className="absolute left-3 top-3">
              <span
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  isProblem
                    ? "border-primary/20 bg-primary text-on-primary"
                    : isEssay
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "text-on-surface"
                }`}
              >
                {typeMap[note.type]}
              </span>
            </div>
          )}
          {/* Subject Badge */}
          {!isEssay && note.subject && (
            <div className="absolute right-3 top-3">
              <span className="tag-chip bg-surface-container-lowest/85 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                {subjectMap[note.subject]}
              </span>
            </div>
          )}
        </div>

        {/* Card Content */}
        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-headline text-lg font-bold leading-snug text-on-surface line-clamp-2 transition-colors duration-200 group-hover:text-primary">
            {note.title}
          </h3>

          {/* Tags */}
          <div className="mt-3 flex min-h-7 flex-wrap gap-1.5">
            {visibleTags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="tag-chip px-2 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
            {visibleTags.length > 3 && (
              <span className="tag-chip px-2 py-0.5 text-xs">
                +{visibleTags.length - 3}
              </span>
            )}
          </div>

          {/* Meta Info */}
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs text-on-surface-variant/65">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {updatedAt.getTime() !== createdAt.getTime() ? (
                <>更新 {updatedAt.toLocaleDateString("zh-CN")}</>
              ) : (
                <>{createdAt.toLocaleDateString("zh-CN")}</>
              )}
            </span>
            {hasReadableContent && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                  {estimateReadingTime(note.content)} 分钟
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
