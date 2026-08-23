"use client";

import { NoteType, Subject, subjectMap } from "@/lib/types";
import { ArrowUpDown } from "lucide-react";

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
  return (
    <div className="space-y-3">
      {/* Type Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-on-surface-variant/60 flex items-center mr-1">类型</span>
        {types.map((type) => (
          <button
            type="button"
            key={type.value}
            onClick={() => onTypeChange(type.value)}
            className={`control-button min-h-11 px-3 text-sm ${
              selectedType === type.value
                ? "control-button-primary"
                : ""
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 pt-1">
              {/* Sort Order */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-on-surface-variant/60 flex items-center mr-1">
                  <ArrowUpDown className="w-3 h-3 mr-1" />
                  排序
                </span>
                <button
                  type="button"
                  onClick={() => onSortOrderChange("desc")}
                  className={`control-button min-h-11 px-3 text-sm ${
                    sortOrder === "desc"
                      ? "control-button-selected"
                      : ""
                  }`}
                >
                  最新优先
                </button>
                <button
                  type="button"
                  onClick={() => onSortOrderChange("asc")}
                  className={`control-button min-h-11 px-3 text-sm ${
                    sortOrder === "asc"
                      ? "control-button-selected"
                      : ""
                  }`}
                >
                  最早优先
                </button>
              </div>

              {/* Subject Filter */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-on-surface-variant/60 flex items-center mr-1">科目</span>
                {subjects.map((subject) => (
                  <button
                    type="button"
                    key={subject.value}
                    onClick={() => onSubjectChange(subject.value)}
                    className={`control-button min-h-11 px-3 text-sm ${
                      selectedSubject === subject.value
                        ? "control-button-selected"
                        : ""
                    }`}
                  >
                    {subject.label}
                  </button>
                ))}
              </div>
      </div>
    </div>
  );
}
