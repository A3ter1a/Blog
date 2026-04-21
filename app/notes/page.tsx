"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { SearchBar } from "@/components/notes/SearchBar";
import { TagFilter } from "@/components/notes/TagFilter";
import { NoteCard } from "@/components/notes/NoteCard";
import { mockNotes } from "@/lib/mock-data";
import { NoteType, Subject, Difficulty, ProblemType } from "@/lib/types";

export default function NotesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<NoteType | "all">("all");
  const [selectedSubject, setSelectedSubject] = useState<Subject | "all">("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | "all">("all");
  const [selectedProblemType, setSelectedProblemType] = useState<ProblemType | "all">("all");

  const filteredNotes = useMemo(() => {
    return mockNotes.filter((note) => {
      const matchesSearch =
        searchQuery === "" ||
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === "all" || note.type === selectedType;
      const matchesSubject = selectedSubject === "all" || note.subject === selectedSubject || note.type === "essay";

      // Problem-specific filters
      let matchesDifficulty = true;
      let matchesProblemType = true;
      if (note.type === "problem" && note.problems && note.problems.length > 0) {
        if (selectedDifficulty !== "all") {
          matchesDifficulty = note.problems.some((p) => p.difficulty === selectedDifficulty);
        }
        if (selectedProblemType !== "all") {
          matchesProblemType = note.problems.some((p) => p.type === selectedProblemType);
        }
      }

      return matchesSearch && matchesType && matchesSubject && matchesDifficulty && matchesProblemType;
    });
  }, [searchQuery, selectedType, selectedSubject, selectedDifficulty, selectedProblemType]);

  return (
    <main className="pt-32 pb-20 px-6 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4 font-headline">
            知识的沉淀与共鸣
          </h1>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
            在这里，每一篇笔记都是思维的足迹，每一次整理都是认知的升华。
          </p>
        </motion.section>

        {/* Search & Filter Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mb-12 space-y-6"
        >
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <TagFilter
            selectedType={selectedType}
            selectedSubject={selectedSubject}
            selectedDifficulty={selectedDifficulty}
            selectedProblemType={selectedProblemType}
            onTypeChange={setSelectedType}
            onSubjectChange={setSelectedSubject}
            onDifficultyChange={setSelectedDifficulty}
            onProblemTypeChange={setSelectedProblemType}
          />
        </motion.section>

        {/* Notes Grid */}
        <section>
          {filteredNotes.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredNotes.map((note, index) => (
                <NoteCard key={note.id} note={note} index={index} />
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <p className="text-on-surface-variant text-lg">
                没有找到匹配的笔记
              </p>
            </motion.div>
          )}
        </section>
      </div>
    </main>
  );
}
