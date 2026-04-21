"use client";

import { motion } from "framer-motion";
import { NoteType, Subject, subjectMap, typeMap, Difficulty, ProblemType, difficultyMap, problemTypeMap } from "@/lib/types";

interface TagFilterProps {
  selectedType: NoteType | "all";
  selectedSubject: Subject | "all";
  selectedDifficulty: Difficulty | "all";
  selectedProblemType: ProblemType | "all";
  onTypeChange: (type: NoteType | "all") => void;
  onSubjectChange: (subject: Subject | "all") => void;
  onDifficultyChange: (difficulty: Difficulty | "all") => void;
  onProblemTypeChange: (problemType: ProblemType | "all") => void;
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

const difficulties: { value: Difficulty | "all"; label: string }[] = [
  { value: "all", label: "全部难度" },
  { value: "easy", label: "基础" },
  { value: "medium", label: "中等" },
  { value: "hard", label: "困难" },
];

const problemTypes: { value: ProblemType | "all"; label: string }[] = [
  { value: "all", label: "全部题型" },
  { value: "choice", label: "选择题" },
  { value: "fill", label: "填空题" },
  { value: "calculation", label: "计算题" },
  { value: "proof", label: "证明题" },
  { value: "proofEssay", label: "论述题" },
];

export function TagFilter({
  selectedType,
  selectedSubject,
  selectedDifficulty,
  selectedProblemType,
  onTypeChange,
  onSubjectChange,
  onDifficultyChange,
  onProblemTypeChange,
}: TagFilterProps) {
  const showProblemFilters = selectedType === "problem" || selectedType === "all";

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

      {/* Problem Filters (only show when problem type is selected or all) */}
      {showProblemFilters && (
        <>
          {/* Difficulty Filter */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-on-surface-variant/60 flex items-center mr-1">难度</span>
            {difficulties.map((diff) => (
              <motion.button
                key={diff.value}
                whileTap={{ scale: 0.95 }}
                onClick={() => onDifficultyChange(diff.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                  selectedDifficulty === diff.value
                    ? "bg-amber-100 text-amber-700 shadow-ambient"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {diff.label}
              </motion.button>
            ))}
          </div>

          {/* Problem Type Filter */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-on-surface-variant/60 flex items-center mr-1">题型</span>
            {problemTypes.map((pt) => (
              <motion.button
                key={pt.value}
                whileTap={{ scale: 0.95 }}
                onClick={() => onProblemTypeChange(pt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                  selectedProblemType === pt.value
                    ? "bg-primary-container/30 text-primary-container shadow-ambient"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {pt.label}
              </motion.button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
