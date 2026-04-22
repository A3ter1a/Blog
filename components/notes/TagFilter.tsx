"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { NoteType, Subject, subjectMap } from "@/lib/types";
import { ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";

interface TagFilterProps {
  selectedType: NoteType | "all";
  selectedSubject: Subject | "all";
  sortOrder: "desc" | "asc";
  onTypeChange: (type: NoteType | "all") => void;
  onSubjectChange: (subject: Subject | "all") => void;
  onSortOrderChange: (order: "desc" | "asc") => void;
}

const types: { value: NoteType | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "note", label: "笔记" },
  { value: "problem", label: "题集" },
  { value: "essay", label: "随笔" },
];

const subjects: { value: Subject | "all"; label: string }[] = [
  { value: "all", label: "全部科目" },
  { value: "math", label: subjectMap.math },
  { value: "english", label: subjectMap.english },
  { value: "politics", label: subjectMap.politics },
  { value: "economics", label: subjectMap.economics },
];

export function TagFilter({
  selectedType,
  selectedSubject,
  sortOrder,
  onTypeChange,
  onSubjectChange,
  onSortOrderChange,
}: TagFilterProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <div className="space-y-3">
      {/* Type Filter */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-on-surface-variant/60 flex items-center mr-1">类型</span>
        {types.map((type) => (
          <motion.button
            key={type.value}
            whileTap={{ scale: 0.95 }}
            onClick={() => onTypeChange(type.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
              selectedType === type.value
                ? "editorial-gradient text-on-primary shadow-ambient"
                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {type.label}
          </motion.button>
        ))}
      </div>

      {/* Advanced Filters Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface-variant text-sm hover:bg-surface-container-high transition-colors"
        >
          {isAdvancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          高级筛选
        </button>
      </div>

      {/* Collapsible Advanced Filters */}
      <AnimatePresence>
        {isAdvancedOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-1">
              {/* Sort Order */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-on-surface-variant/60 flex items-center mr-1">
                  <ArrowUpDown className="w-3 h-3 mr-1" />
                  排序
                </span>
                <button
                  onClick={() => onSortOrderChange("desc")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                    sortOrder === "desc"
                      ? "bg-primary-container/30 text-primary-container shadow-ambient"
                      : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  最新优先
                </button>
                <button
                  onClick={() => onSortOrderChange("asc")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                    sortOrder === "asc"
                      ? "bg-primary-container/30 text-primary-container shadow-ambient"
                      : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  最早优先
                </button>
              </div>

              {/* Subject Filter */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-on-surface-variant/60 flex items-center mr-1">科目</span>
                {subjects.map((subject) => (
                  <motion.button
                    key={subject.value}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSubjectChange(subject.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                      selectedSubject === subject.value
                        ? "bg-surface-container-highest text-primary shadow-ambient"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {subject.label}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
