"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Note, subjectMap, typeMap, NoteType } from "@/lib/types";
import { FileText, BookOpen, Calendar, Eye, Bookmark, ChevronDown, Check } from "lucide-react";
import { useState } from "react";

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
  const [isCoverExpanded, setIsCoverExpanded] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    if (selectMode && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(note.id);
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      onClick={handleClick}
      className={`group rounded-xl overflow-hidden transition-all duration-300 cursor-pointer ${
        selectMode
          ? isSelected
            ? "bg-surface-container-high ring-2 ring-primary"
            : "bg-surface-container-low hover:bg-surface-container-high"
          : "bg-surface-container-low hover:bg-surface-container-high"
      }`}
    >
      <Link href={`/notes/${note.id}`} className="block" onClick={selectMode ? (e) => e.preventDefault() : undefined}>
        {/* Cover Image or Placeholder */}
        <div className="relative">
          {note.coverImage ? (
            // Has cover image
            <div className="relative">
              <motion.div
                initial={false}
                animate={{ height: isCoverExpanded ? "auto" : "12rem" }}
                className="overflow-hidden"
              >
                <img
                  src={note.coverImage}
                  alt={note.title}
                  className="w-full object-cover"
                />
              </motion.div>
              {/* Expand/Collapse Button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsCoverExpanded(!isCoverExpanded);
                }}
                className="absolute bottom-2 right-2 p-1.5 rounded-full bg-surface-container-lowest/80 backdrop-blur-sm text-on-surface-variant hover:text-primary transition-colors"
              >
                <motion.div
                  animate={{ rotate: isCoverExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-4 h-4" />
                </motion.div>
              </button>
            </div>
          ) : (
            // No cover image - show placeholder
            <div className="relative h-48 bg-surface-container overflow-hidden">
              <div className="absolute inset-0 editorial-gradient opacity-10" />
              <div className="absolute inset-0 flex items-center justify-center">
                {isProblem ? (
                  <BookOpen className="w-12 h-12 text-primary/30" />
                ) : isEssay ? (
                  <span className="text-4xl opacity-30">✦</span>
                ) : (
                  <FileText className="w-12 h-12 text-primary/30" />
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
            <div className="absolute top-4 left-4">
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
            </div>
          )}
          {/* Subject Badge */}
          {!isEssay && note.subject && (
            <div className="absolute top-4 right-4">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-surface-container-lowest/80 backdrop-blur-sm text-on-surface-variant">
                {subjectMap[note.subject]}
              </span>
            </div>
          )}
        </div>

        {/* Card Content */}
        <div className="p-6">
          <h3 className="text-xl font-bold text-on-surface mb-3 font-headline line-clamp-2 group-hover:text-primary-container transition-colors duration-300">
            {note.title}
          </h3>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {note.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 rounded-md text-xs bg-surface-container-highest text-on-surface-variant"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Meta Info */}
          <div className="flex items-center justify-between text-sm text-on-surface-variant/60">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {note.createdAt.toLocaleDateString("zh-CN")}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
