"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Check, X, Zap, Clock, BookOpen, Loader2 } from "lucide-react";
import { flashcardsApi, notesApi } from "@/lib/supabase";
import { Flashcard, ReviewQuality } from "@/lib/types";
import { MarkdownContent } from "@/components/ui/MarkdownContent";

// SM-2 Algorithm: Calculate next review based on quality
function calculateSM2(
  card: Flashcard,
  quality: ReviewQuality
): { interval: number; repetition: number; easeFactor: number; nextReview: Date } {
  let { interval, repetition, easeFactor } = card;

  if (quality >= 3) {
    // Correct answer
    if (repetition === 0) {
      interval = 1;
    } else if (repetition === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetition += 1;
  } else {
    // Wrong answer - reset
    repetition = 0;
    interval = 1;
  }

  // Update ease factor
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  // Calculate next review date
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return { interval, repetition, easeFactor, nextReview };
}

export default function FlashcardPage() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [noteTitles, setNoteTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    loadDueCards();
  }, []);

  const loadDueCards = async () => {
    try {
      setLoading(true);
      const dueCards = await flashcardsApi.getDue(20);
      setCards(dueCards);

      // Load note titles in parallel
      const uniqueNoteIds = [...new Set(dueCards.map(c => c.noteId))];
      const noteResults = await Promise.all(
        uniqueNoteIds.map(id => notesApi.getById(id))
      );
      const titles: Record<string, string> = {};
      noteResults.forEach(note => {
        if (note) titles[note.id] = note.title;
      });
      setNoteTitles(titles);
    } catch (error) {
      console.error("Failed to load flashcards:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (quality: ReviewQuality) => {
    const current = cards[currentIndex];
    if (!current) return;

    const next = calculateSM2(current, quality);

    await flashcardsApi.update(current.id, {
      interval: next.interval,
      repetition: next.repetition,
      easeFactor: next.easeFactor,
      nextReview: next.nextReview,
      lastReview: new Date(),
    });

    setReviewed(prev => prev + 1);

    // Move to next card
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    } else {
      // All cards reviewed
      setCurrentIndex(cards.length);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setReviewed(0);
    loadDueCards();
  };

  const current = cards[currentIndex];
  const totalCards = cards.length;

  return (
    <div className="min-h-screen bg-surface pt-24">
      {/* Header */}
      <div className="bg-surface-container-low border-b border-outline-variant/20">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Link
            href="/tools"
            className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            返回工具页
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold font-headline text-on-surface flex items-center gap-2">
                <Zap className="w-6 h-6 text-amber-500" />
                抽卡复习
              </h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                基于 SM-2 间隔重复算法
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">{totalCards}</div>
              <div className="text-xs text-on-surface-variant">待复习</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="text-on-surface-variant">加载卡片中...</p>
          </div>
        ) : totalCards === 0 || currentIndex >= totalCards ? (
          // Empty or completed state
          <div className="flex flex-col items-center justify-center py-24">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-on-surface mb-2">
                {currentIndex >= totalCards ? "复习完成！" : "暂无待复习卡片"}
              </h2>
              <p className="text-on-surface-variant mb-8">
                {currentIndex >= totalCards
                  ? `本次复习了 ${reviewed} 张卡片，继续保持！`
                  : "当你添加更多卡片后，它们会出现在这里"}
              </p>
              <button
                onClick={handleRestart}
                className="px-6 py-3 rounded-xl bg-primary text-on-primary font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 mx-auto"
              >
                <RotateCcw className="w-4 h-4" />
                刷新
              </button>
            </motion.div>
          </div>
        ) : (
          // Card review
          <div>
            {/* Progress */}
            <div className="mb-6">
              <div className="flex justify-between text-sm text-on-surface-variant mb-2">
                <span>进度 {currentIndex + 1} / {totalCards}</span>
                <span>已复习 {reviewed}</span>
              </div>
              <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>

            {/* Note reference */}
            {current && noteTitles[current.noteId] && (
              <div className="mb-4 flex items-center gap-2 text-sm text-on-surface-variant">
                <BookOpen className="w-4 h-4" />
                <span>来自：{noteTitles[current.noteId]}</span>
              </div>
            )}

            {/* Flashcard */}
            <AnimatePresence mode="wait">
              {current && (
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.3 }}
                  className="mb-8"
                >
                  <div
                    className="relative cursor-pointer"
                    style={{ perspective: "1000px" }}
                    onClick={() => setIsFlipped(!isFlipped)}
                  >
                    <motion.div
                      className="w-full min-h-[300px]"
                      animate={{ rotateY: isFlipped ? 180 : 0 }}
                      transition={{ duration: 0.4, type: "tween" }}
                      style={{ transformStyle: "preserve-3d" }}
                    >
                      {/* Front */}
                      <div
                        className="absolute inset-0 bg-surface-container-lowest rounded-2xl shadow-ambient p-8 flex flex-col items-center justify-center"
                        style={{ backfaceVisibility: "hidden" }}
                      >
                        <span className="text-xs text-on-surface-variant/60 mb-4 uppercase tracking-wider">
                          问题
                        </span>
                        <div className="text-center">
                          <MarkdownContent
                            content={current.question}
                            className="text-xl text-on-surface leading-relaxed"
                          />
                        </div>
                        <span className="mt-8 text-sm text-on-surface-variant/60">
                          点击翻转查看答案
                        </span>
                      </div>

                      {/* Back */}
                      <div
                        className="absolute inset-0 bg-surface-container-lowest rounded-2xl shadow-ambient p-8 flex flex-col items-center justify-center"
                        style={{
                          backfaceVisibility: "hidden",
                          transform: "rotateY(180deg)",
                        }}
                      >
                        <span className="text-xs text-on-surface-variant/60 mb-4 uppercase tracking-wider">
                          答案
                        </span>
                        <div className="text-center">
                          <MarkdownContent
                            content={current.answer}
                            className="text-xl text-on-surface leading-relaxed"
                          />
                        </div>
                        <span className="mt-8 text-sm text-on-surface-variant/60">
                          点击翻转返回问题
                        </span>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Review Buttons */}
            <AnimatePresence>
              {isFlipped && current && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="space-y-4"
                >
                  <p className="text-center text-sm text-on-surface-variant mb-4">
                    你对这道题的掌握程度如何？
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => handleReview(1)}
                      className="p-4 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-colors flex flex-col items-center gap-2"
                    >
                      <X className="w-6 h-6" />
                      <span className="text-sm font-medium">忘记了</span>
                      <span className="text-xs opacity-70">1 天后</span>
                    </button>
                    <button
                      onClick={() => handleReview(3)}
                      className="p-4 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors flex flex-col items-center gap-2"
                    >
                      <Clock className="w-6 h-6" />
                      <span className="text-sm font-medium">有点模糊</span>
                      <span className="text-xs opacity-70">
                        {calculateSM2(current, 3).interval} 天后
                      </span>
                    </button>
                    <button
                      onClick={() => handleReview(5)}
                      className="p-4 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors flex flex-col items-center gap-2"
                    >
                      <Check className="w-6 h-6" />
                      <span className="text-sm font-medium">完全掌握</span>
                      <span className="text-xs opacity-70">
                        {calculateSM2(current, 5).interval} 天后
                      </span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
