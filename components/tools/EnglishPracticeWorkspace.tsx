"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ChevronRight, ClipboardCheck, Loader2, PenLine, Save, X } from "lucide-react";
import type { EnglishAttemptAnswerInput } from "@/lib/english-training-api";
import { parseEnglishManualScore } from "@/lib/english-scoring";
import type { EnglishTrainingPersistenceMode } from "@/lib/english-training-core";
import type { EnglishSubjectiveGradeSuggestion } from "@/lib/english-subjective-grade";
import {
  isEnglishObjectiveSection,
  cleanEnglishPassageContent,
  cleanEnglishQuestionStem,
  getEnglishNewTypeKind,
  hasEnglishPassageOriginal,
  normalizeEnglishObjectiveAnswer,
  type EnglishAttempt,
  type EnglishNewTypeKind,
  type EnglishPassage,
  type EnglishQuestion,
} from "@/lib/english-training";
import {
  getEnglishRound,
  type EnglishPassageRoundLedger,
  type EnglishRoundRecord,
  type EnglishRoundRevision,
} from "@/lib/english-round-history";

function countWords(text: string): number {
  return text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)?|\d+/g)?.length ?? 0;
}

function shouldMergeDisplayBlock(current: string, next: string): boolean {
  const currentText = current.trim();
  const nextText = next.trim();
  if (!currentText || !nextText) return false;
  if (/[,;:—-]$/.test(currentText)) return true;
  if (/\b(and|or|but|nor|for|so|yet|to|of|in|on|at|by|with|from|as|than|that|which|who|whose|when|where)$/i.test(currentText)) return true;
  if (!/[.!?]["')\]]?$/.test(currentText)) return true;
  if (/^[a-z,.;:)\]]/.test(nextText)) return true;
  return /\b[a-z]\)$/.test(currentText) && countWords(currentText) < 36;
}

function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length < 980) return [paragraph];
  const parts: string[] = [];
  let current = "";
  const sentences = paragraph.match(/[^.!?]+[.!?]["')\]]?|[^.!?]+$/g) ?? [paragraph];
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence.trim()}` : sentence.trim();
    if (current && next.length > 760) {
      parts.push(current);
      current = sentence.trim();
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts.length > 0 ? parts : [paragraph];
}

function normalizePassageParagraphs(content: string): string[] {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (blocks.length <= 1) return blocks.length === 0 ? [] : splitLongParagraph(content.replace(/\s+/g, " ").trim());
  const paragraphs: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (!current) current = block;
    else if (shouldMergeDisplayBlock(current, block)) current = `${current} ${block}`;
    else {
      paragraphs.push(current);
      current = block;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs.flatMap(splitLongParagraph);
}

function splitParagraphIntoChunks(paragraph: string, targetWords: number): string[] {
  if (countWords(paragraph) <= targetWords) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]["')\]]?|[^.!?]+$/g) ?? [paragraph];
  const chunks: string[] = [];
  let current = "";
  let currentWords = 0;
  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();
    const sentenceWords = countWords(cleanSentence);
    if (sentenceWords > targetWords) {
      if (current) chunks.push(current);
      current = "";
      currentWords = 0;
      const words = cleanSentence.split(/\s+/).filter(Boolean);
      for (let index = 0; index < words.length; index += targetWords) chunks.push(words.slice(index, index + targetWords).join(" "));
    } else if (current && currentWords + sentenceWords > targetWords) {
      chunks.push(current);
      current = cleanSentence;
      currentWords = sentenceWords;
    } else {
      current = current ? `${current} ${cleanSentence}` : cleanSentence;
      currentWords += sentenceWords;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function paginatePassageContent(content: string, targetWords = 380): string[] {
  const paragraphs = normalizePassageParagraphs(content);
  const pages: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  for (const paragraph of paragraphs) {
    const pieces = countWords(paragraph) > targetWords + 120 ? splitParagraphIntoChunks(paragraph, targetWords) : [paragraph];
    for (const piece of pieces) {
      const pieceWords = countWords(piece);
      if (current.length > 0 && currentWords + pieceWords > targetWords) {
        pages.push(current.join("\n\n"));
        current = [];
        currentWords = 0;
      }
      current.push(piece);
      currentWords += pieceWords;
    }
  }
  if (current.length > 0) pages.push(current.join("\n\n"));
  return pages;
}

function getSelectedOption(question: EnglishQuestion, value: string) {
  const normalized = normalizeEnglishObjectiveAnswer(value);
  return question.options.find((option) => normalizeEnglishObjectiveAnswer(option.label) === normalized);
}

function InlineChoiceBlank({
  question,
  value,
  open,
  readOnly,
  compact = false,
  directScoreMode = false,
  onToggle,
  onChange,
  onScoreChange,
}: {
  question: EnglishQuestion;
  value: string;
  open: boolean;
  readOnly: boolean;
  compact?: boolean;
  directScoreMode?: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onScoreChange?: (value: string) => void;
}) {
  if (directScoreMode) {
    const score = parseEnglishManualScore(value, question.score);
    return (
      <span className="english-inline-score" data-inline-question={question.id}>
        <span className="english-inline-score-number">{question.questionNo}</span>
        <input
          type="number"
          min={0}
          max={question.score}
          step={0.5}
          value={score === null ? "" : score}
          onChange={(event) => onScoreChange?.(event.target.value)}
          readOnly={readOnly}
          className="field-control english-inline-score-input px-2 py-1 text-sm"
          placeholder="得分"
          aria-label={`${question.questionNo} 题得分`}
        />
      </span>
    );
  }

  const selected = getSelectedOption(question, value);
  const display = selected ? (compact ? selected.label : selected.content) : `空 ${question.questionNo}`;

  return (
    <span className={`english-inline-answer ${open ? "is-open" : ""}`} data-inline-question={question.id}>
      <button
        type="button"
        className={`english-inline-answer-trigger ${selected ? "has-value" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${question.questionNo} 题${selected ? `，已选 ${selected.label}` : "，选择答案"}`}
        onClick={() => {
          if (!readOnly) onToggle();
        }}
      >
        <span className="english-inline-answer-number">{question.questionNo}</span>
        <span className="english-inline-answer-value">{display}</span>
      </button>
      {open && !readOnly && (
        <span className="english-inline-answer-menu" role="listbox" aria-label={`${question.questionNo} 题选项`}>
          {question.options.map((option) => (
            <button
              key={`${question.id}-${option.label}`}
              type="button"
              role="option"
              aria-selected={option.label === selected?.label}
              className={option.label === selected?.label ? "is-selected" : ""}
              onClick={() => {
                onChange(option.label);
                onToggle();
              }}
            >
              <strong>{option.label}</strong>
              <span>{option.content}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function InlineTextAnswer({
  question,
  value,
  open,
  readOnly,
  directScoreMode = false,
  onToggle,
  onChange,
  onScoreChange,
}: {
  question: EnglishQuestion;
  value: string;
  open: boolean;
  readOnly: boolean;
  directScoreMode?: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onScoreChange?: (value: string) => void;
}) {
  if (directScoreMode) {
    const score = parseEnglishManualScore(value, question.score);
    return (
      <span className="english-inline-score" data-inline-question={question.id}>
        <span className="english-inline-score-number">{question.questionNo}</span>
        <input
          type="number"
          min={0}
          max={question.score}
          step={0.5}
          value={score === null ? "" : score}
          onChange={(event) => onScoreChange?.(event.target.value)}
          readOnly={readOnly}
          className="field-control english-inline-score-input px-2 py-1 text-sm"
          placeholder="得分"
          aria-label={`${question.questionNo} 题得分`}
        />
      </span>
    );
  }

  return (
    <span className={`english-inline-answer english-inline-text-answer ${open ? "is-open" : ""}`} data-inline-question={question.id}>
      <button
        type="button"
        className={`english-inline-answer-trigger ${value.trim() ? "has-value" : ""}`}
        aria-expanded={open}
        aria-label={`${question.questionNo} 题${value.trim() ? "，已填写翻译" : "，填写翻译"}`}
        onClick={() => {
          if (!readOnly) onToggle();
        }}
      >
        <span className="english-inline-answer-number">({question.questionNo})</span>
        <span className="english-inline-answer-value">{value.trim() || "点击填写译文"}</span>
      </button>
      {open && !readOnly && (
        <span className="english-inline-text-editor">
          <textarea
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onToggle();
            }}
            rows={3}
            className="field-control w-full resize-y px-3 py-2 text-sm leading-6"
            placeholder="输入这处划线句的中文翻译"
            aria-label={`${question.questionNo} 题翻译`}
          />
          <span className="english-inline-text-hint">点击文章其他位置收起</span>
        </span>
      )}
    </span>
  );
}

function renderClozeParagraph(
  content: string,
  questionsByNo: Map<string, EnglishQuestion>,
  answers: Record<string, string>,
  openQuestionId: string | null,
  readOnly: boolean,
  directScoreMode: boolean,
  onToggle: (questionId: string) => void,
  onChange: (questionId: string, answer: string) => void,
  onScoreChange: (questionId: string, score: string) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(?<!\w)(\d{1,2})(?!\w)/g;
  let lastIndex = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    const blankNo = match[1];
    const value = Number(blankNo);
    const nextText = content.slice(index + match[0].length).trimStart().toLowerCase();
    if (index > lastIndex) nodes.push(content.slice(lastIndex, index));
    const question = value >= 1 && value <= 20 ? questionsByNo.get(blankNo) : undefined;
    nodes.push(question && !nextText.startsWith("point")
      ? <InlineChoiceBlank
          key={`${index}-${blankNo}`}
          question={question}
          value={answers[question.id] ?? ""}
          open={openQuestionId === question.id}
          readOnly={readOnly}
          directScoreMode={directScoreMode}
          onToggle={() => onToggle(question.id)}
          onChange={(answer) => onChange(question.id, answer)}
          onScoreChange={(score) => onScoreChange(question.id, score)}
        />
      : match[0]);
    lastIndex = index + match[0].length;
  }
  if (lastIndex < content.length) nodes.push(content.slice(lastIndex));
  return nodes;
}

function renderMarkedParagraph(
  content: string,
  pattern: RegExp,
  getQuestion: (questionNo: string) => EnglishQuestion | undefined,
  renderQuestion: (question: EnglishQuestion) => ReactNode,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    const questionNo = match[1];
    const question = getQuestion(questionNo);
    if (!question) continue;
    if (index > lastIndex) nodes.push(content.slice(lastIndex, index));
    nodes.push(renderQuestion(question));
    lastIndex = index + match[0].length;
  }
  if (lastIndex < content.length) nodes.push(content.slice(lastIndex));
  return nodes;
}

function PassagePageContent({
  passage,
  content,
  questions,
  answers,
  openQuestionId,
  readOnly,
  directScoreMode,
  onToggleQuestion,
  onAnswerChange,
  onScoreChange,
}: {
  passage: EnglishPassage;
  content: string;
  questions: EnglishQuestion[];
  answers: Record<string, string>;
  openQuestionId: string | null;
  readOnly: boolean;
  directScoreMode: boolean;
  onToggleQuestion: (questionId: string) => void;
  onAnswerChange: (questionId: string, answer: string) => void;
  onScoreChange: (questionId: string, score: string) => void;
}) {
  const paragraphs = content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const questionsByNo = new Map(questions.map((question) => [question.questionNo, question]));
  return <div className="english-passage-content text-on-surface">{paragraphs.map((paragraph, index) => (
    <p key={`${index}-${paragraph.slice(0, 12)}`}>
      {passage.section === "cloze"
        ? renderClozeParagraph(paragraph, questionsByNo, answers, openQuestionId, readOnly, directScoreMode, onToggleQuestion, onAnswerChange, onScoreChange)
        : passage.section === "translation"
          ? renderMarkedParagraph(
              paragraph,
              /\((4[6-9]|50)\)/g,
              (questionNo) => questionsByNo.get(questionNo),
              (question) => <InlineTextAnswer
                key={`${index}-${question.id}`}
                question={question}
                value={answers[question.id] ?? ""}
                open={openQuestionId === question.id}
                readOnly={readOnly}
                directScoreMode={directScoreMode}
                onToggle={() => onToggleQuestion(question.id)}
                onChange={(answer) => onAnswerChange(question.id, answer)}
                onScoreChange={(score) => onScoreChange(question.id, score)}
              />,
            )
          : passage.section === "new_type"
            ? paragraph
            : paragraph}
    </p>
  ))}</div>;
}

function NewTypeAnswerStrip({
  kind,
  questions,
  answers,
  openQuestionId,
  readOnly,
  directScoreMode,
  onToggleQuestion,
  onAnswerChange,
  onScoreChange,
}: {
  kind: EnglishNewTypeKind;
  questions: EnglishQuestion[];
  answers: Record<string, string>;
  openQuestionId: string | null;
  readOnly: boolean;
  directScoreMode: boolean;
  onToggleQuestion: (questionId: string) => void;
  onAnswerChange: (questionId: string, answer: string) => void;
  onScoreChange: (questionId: string, score: string) => void;
}) {
  const labels = {
    heading: "段落匹配标题",
    insertion: "句子插入",
    ordering: "段落排序",
    statement_matching: "观点匹配",
  } as const;

  return (
    <section className="english-new-type-answer-strip" aria-label="新题型作答区">
      <div className="english-new-type-answer-heading">
        <div>
          <strong>{labels[kind]}</strong>
          <span>点击题号选择答案，已选答案会直接显示在题号上。</span>
        </div>
        <span className="english-answer-mode-chip">{readOnly ? "已提交" : "可作答"}</span>
      </div>
      <div className="english-new-type-answer-slots">
        {questions.map((question) => (
          <InlineChoiceBlank
            key={question.id}
            question={question}
            value={answers[question.id] ?? ""}
            compact
            open={openQuestionId === question.id}
            readOnly={readOnly}
            directScoreMode={directScoreMode}
            onToggle={() => onToggleQuestion(question.id)}
            onChange={(answer) => onAnswerChange(question.id, answer)}
            onScoreChange={(score) => onScoreChange(question.id, score)}
          />
        ))}
      </div>
    </section>
  );
}

function WritingPracticeContent({
  passage,
  question,
  value,
  directScoreMode,
  readOnly,
  onAnswerChange,
  onScoreChange,
}: {
  passage: EnglishPassage;
  question?: EnglishQuestion;
  value: string;
  directScoreMode: boolean;
  readOnly: boolean;
  onAnswerChange: (value: string) => void;
  onScoreChange: (value: string) => void;
}) {
  const questionNo = question?.questionNo ?? (passage.passageNo === "small_writing" ? "51" : "52");
  const prompt = cleanEnglishQuestionStem("writing", questionNo, question?.stem || passage.content);
  const paragraphs = prompt.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const score = question?.score ?? passage.totalScore;
  const manualScore = parseEnglishManualScore(value, score);

  return (
    <div className="english-writing-workspace">
      <section className="english-writing-prompt" aria-labelledby="english-writing-prompt-title">
        <div className="english-writing-prompt-meta">
          <span id="english-writing-prompt-title">写作题目 · {questionNo}</span>
          <span>{score} 分</span>
        </div>
        <div className="english-writing-prompt-content">
          {paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>)}
        </div>
      </section>
      <section className="english-writing-answer" aria-label="作文作答区">
        <div className="english-writing-answer-heading">
          <div>
            <strong>{directScoreMode ? "直接记录纸笔得分" : "我的作文"}</strong>
            <span>{directScoreMode ? `本题满分 ${score} 分` : "写完后可保存草稿，提交时再获取 AI 建议。"}</span>
          </div>
          {!directScoreMode && <span className="english-writing-word-hint">建议按题目要求完成字数</span>}
        </div>
        {directScoreMode ? (
          <label className="english-writing-score-entry">
            <span>本题得分</span>
            <input
              type="number"
              min={0}
              max={score}
              step={0.5}
              value={manualScore === null ? "" : manualScore}
              onChange={(event) => onScoreChange(event.target.value)}
              readOnly={readOnly}
              className="field-control english-question-score-input px-3 py-2 text-sm"
              placeholder="0"
            />
          </label>
        ) : (
          <textarea
            value={value}
            onChange={(event) => onAnswerChange(event.target.value)}
            readOnly={readOnly}
            rows={16}
            className="field-control english-writing-textarea w-full resize-y px-4 py-3 text-base leading-8"
            placeholder="在这里输入你的作文……"
          />
        )}
      </section>
    </div>
  );
}

function MissingPassageContent({
  questions,
  directScoreMode,
  readOnly,
  answers,
  onScoreChange,
}: {
  questions: EnglishQuestion[];
  directScoreMode: boolean;
  readOnly: boolean;
  answers: Record<string, string>;
  onScoreChange: (questionId: string, score: string) => void;
}) {
  return (
    <div className="english-missing-passage" role="status">
      <strong>这篇真题原文还未导入</strong>
      <span>当前数据只包含题目和选项，未补录原文前不会显示空白文章。</span>
      {directScoreMode && questions.length > 0 && (
        <div className="english-missing-score-list">
          <strong>仍可按题记录纸笔得分</strong>
          {questions.map((question) => {
            const score = parseEnglishManualScore(answers[question.id] ?? "", question.score);
            return (
              <label key={question.id} className="english-question-score-entry">
                <span>第 {question.questionNo} 题<small>（满分 {question.score}）</small></span>
                <input
                  type="number"
                  min={0}
                  max={question.score}
                  step={0.5}
                  value={score === null ? "" : score}
                  onChange={(event) => onScoreChange(question.id, event.target.value)}
                  readOnly={readOnly}
                  className="field-control english-question-score-input px-3 py-2 text-sm"
                  placeholder="0"
                  aria-label={`${question.questionNo} 题得分`}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function getPassageDisplayTitle(passage: EnglishPassage): string {
  if (passage.section === "reading" && passage.passageNo.startsWith("text")) return `${passage.year} 阅读 ${passage.passageNo.replace("text", "")}`;
  if (passage.passageNo === "small_writing") return `${passage.year} 小作文`;
  if (passage.passageNo === "big_writing") return `${passage.year} 大作文`;
  if (passage.section === "cloze") return `${passage.year} 完形`;
  if (passage.section === "new_type") return `${passage.year} 新题型`;
  if (passage.section === "translation") return `${passage.year} 翻译`;
  return `${passage.year}`;
}

export function EnglishPracticeWorkspace({
  passage, questions, attempt, ledger, activeRound, roundRecord, roundRevision, editingSubmitted,
  answers, saving, subjectiveBusy, startingNext, persistenceMode, loading, articlePage, onArticlePageChange, directScoreMode, onDirectScoreModeChange, onDirectScoreChange, onBack, onAnswerChange, onRoundChange,
  onStartNextRound, onStartEditingSubmitted, onCancelEditingSubmitted, onSave, onSubmit, onConfirmSubjectiveGrade,
}: {
  passage: EnglishPassage | null;
  questions: EnglishQuestion[];
  attempt?: EnglishAttempt;
  ledger?: EnglishPassageRoundLedger;
  activeRound: 1 | 2 | 3;
  roundRecord?: EnglishRoundRecord;
  roundRevision?: EnglishRoundRevision;
  editingSubmitted: boolean;
  answers: EnglishAttemptAnswerInput;
  saving: "save" | "submit" | null;
  subjectiveBusy: "suggest" | "confirm" | null;
  startingNext: boolean;
  persistenceMode: EnglishTrainingPersistenceMode;
  loading: boolean;
  articlePage: number;
  onArticlePageChange: (page: number) => void;
  directScoreMode: boolean;
  onDirectScoreModeChange: (enabled: boolean) => void;
  onDirectScoreChange: (questionId: string, value: string) => void;
  onBack: () => void;
  onAnswerChange: (questionId: string, answer: string) => void;
  onRoundChange: (round: 1 | 2 | 3) => void;
  onStartNextRound: () => void;
  onStartEditingSubmitted: () => void;
  onCancelEditingSubmitted: () => void;
  onSave: () => void;
  onSubmit: () => void;
  onConfirmSubjectiveGrade: (
    revisionId: string,
    score: number,
    feedback: string,
    suggestion: EnglishSubjectiveGradeSuggestion,
  ) => void;
}) {
  const articlePageRef = useRef<HTMLDivElement | null>(null);
  const questionDockRef = useRef<HTMLElement | null>(null);
  const questionDockCloseRef = useRef<HTMLButtonElement | null>(null);
  const questionDockTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [questionDockOpen, setQuestionDockOpen] = useState(false);
  const [openInlineQuestionId, setOpenInlineQuestionId] = useState<string | null>(null);

  useEffect(() => {
    articlePageRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [articlePage]);

  useEffect(() => {
    if (!questionDockOpen || passage?.section !== "reading") return;

    const focusTimer = window.setTimeout(() => questionDockCloseRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setQuestionDockOpen(false);
        return;
      }
      if (event.key !== "Tab" || !questionDockRef.current) return;
      const focusable = questionDockRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]",
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      questionDockTriggerRef.current?.focus();
    };
  }, [passage?.section, questionDockOpen]);

  useEffect(() => {
    if (!openInlineQuestionId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(`[data-inline-question="${openInlineQuestionId}"]`)) {
        setOpenInlineQuestionId(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openInlineQuestionId]);

  useEffect(() => {
    if (!questionDockOpen || !window.matchMedia("(max-width: 760px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [questionDockOpen]);

  if (loading) return <WorkspaceMessage icon={<Loader2 className="h-6 w-6 animate-spin text-primary" />} text="正在加载英语真题训练。" />;
  if (!passage) return <WorkspaceMessage text="没有找到当前题组。" />;

  const submitted = roundRecord?.status === "submitted" || roundRecord?.status === "sealed";
  const objective = isEnglishObjectiveSection(passage.section);
  const suggestionGrade = [...(roundRevision?.grades ?? [])]
    .filter((grade) => grade.origin === "ai_suggested")
    .sort((left, right) => right.gradeSeq - left.gradeSeq)[0];
  const finalGrade = [...(roundRevision?.grades ?? [])]
    .filter((grade) => grade.origin === "user_final")
    .sort((left, right) => right.gradeSeq - left.gradeSeq)[0];
  const suggestionBreakdown = suggestionGrade?.breakdown ?? {};
  const suggestion: EnglishSubjectiveGradeSuggestion | null = suggestionGrade ? {
    score: suggestionGrade.score,
    maxScore: suggestionGrade.maxScore,
    feedback: suggestionGrade.feedback ?? "AI 已给出建议，请人工核对。",
    strengths: Array.isArray(suggestionBreakdown.strengths) ? suggestionBreakdown.strengths.filter((item): item is string => typeof item === "string") : [],
    issues: Array.isArray(suggestionBreakdown.issues) ? suggestionBreakdown.issues.filter((item): item is string => typeof item === "string") : [],
    suggestions: Array.isArray(suggestionBreakdown.suggestions) ? suggestionBreakdown.suggestions.filter((item): item is string => typeof item === "string") : [],
    confidence: typeof suggestionBreakdown.confidence === "number" ? suggestionBreakdown.confidence : 0,
  } : null;
  const cleanedContent = cleanEnglishPassageContent(passage.section, passage.content);
  const hasOriginalContent = hasEnglishPassageOriginal(passage.section, passage.content);
  const articlePages = paginatePassageContent(cleanedContent, passage.section === "writing" ? 720 : 280);
  const currentPage = Math.min(articlePage, Math.max(articlePages.length - 1, 0));
  const isReading = passage.section === "reading";
  const isWriting = passage.section === "writing";
  const newTypeKind = passage.section === "new_type" ? getEnglishNewTypeKind(passage.content) : null;
  const readOnly = submitted && !editingSubmitted;
  const latestRound = ledger?.rounds.reduce((latest, round) => Math.max(latest, round.round) as 1 | 2 | 3, 1) ?? 1;
  const hasFormalSubjectiveGrade = objective || roundRevision?.gradeOrigin !== "ai_suggested";
  const canStartNextRound = activeRound === latestRound && activeRound < 3
    && (roundRecord?.status === "abandoned" || (roundRecord?.status === "submitted" && hasFormalSubjectiveGrade));
  const busy = Boolean(saving) || startingNext || Boolean(subjectiveBusy);

  return (
    <section className="english-practice-shell">
      <div className="english-practice-toolbar">
        <div className="english-practice-titlebar">
          <button type="button" onClick={onBack} className="control-button h-9 px-3 text-sm"><ArrowLeft className="h-4 w-4" />返回题组</button>
          <h2 className="english-practice-title">{getPassageDisplayTitle(passage)}</h2>
          {submitted && <p className="english-practice-score">{editingSubmitted ? "正在修改 · 原得分" : roundRevision?.gradeOrigin === "ai_suggested" ? "AI 建议" : "正式得分"} {roundRevision?.score ?? attempt?.score ?? 0}/{roundRevision?.maxScore ?? attempt?.maxScore ?? 0}</p>}
        </div>
        {questions.length > 0 && <div className="english-direct-score-card">
          <div><strong>已有纸笔结果？</strong><span>按题记录得分，无需重新输入答案。</span></div>
          <button type="button" className="english-direct-score-toggle" aria-pressed={directScoreMode} onClick={() => onDirectScoreModeChange(!directScoreMode)}>{directScoreMode ? "返回作答" : "直接记分"}</button>
        </div>}
        <div className="english-practice-actions">
          {isReading && questions.length > 0 && <button
            ref={questionDockTriggerRef}
            type="button"
            onClick={() => setQuestionDockOpen(true)}
            className="control-button h-10 px-3 text-sm"
            aria-controls="english-question-dock"
            aria-expanded={questionDockOpen}
          >
            <ClipboardCheck className="h-4 w-4" />答题栏
          </button>}
          {submitted ? editingSubmitted ? <>
            <button type="button" onClick={onCancelEditingSubmitted} disabled={busy} className="control-button h-10 px-3 text-sm"><X className="h-4 w-4" />取消修改</button>
            <button type="button" onClick={onSubmit} disabled={busy || questions.length === 0 || (!directScoreMode && !objective && persistenceMode === "legacy")} className="control-button control-button-primary h-10 px-3 text-sm">{saving === "submit" || subjectiveBusy === "suggest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{directScoreMode ? "保存得分" : objective ? "保存修改" : "重新获取 AI 建议"}</button>
          </> : <button type="button" onClick={onStartEditingSubmitted} disabled={busy || questions.length === 0 || (!directScoreMode && !objective && persistenceMode === "legacy")} className="control-button control-button-primary h-10 px-3 text-sm"><PenLine className="h-4 w-4" />{directScoreMode ? "修改得分" : objective ? "修改结果" : "修改答案"}</button> : <>
            <button type="button" onClick={onSave} disabled={busy} className="control-button h-10 px-3 text-sm">{saving === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存</button>
            <button type="button" onClick={onSubmit} disabled={busy || questions.length === 0 || (!directScoreMode && !objective && persistenceMode === "legacy")} className="control-button control-button-primary h-10 px-3 text-sm">{saving === "submit" || subjectiveBusy === "suggest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{directScoreMode ? "记录得分" : objective ? "提交本篇" : "获取 AI 建议"}</button>
          </>}
        </div>
      </div>

      {!objective && suggestion && !editingSubmitted && (
        <SubjectiveGradeReview
          key={`${roundRevision?.id}-${suggestionGrade?.id}-${finalGrade?.id ?? "pending"}`}
          revisionId={roundRevision?.id ?? ""}
          suggestion={suggestion}
          finalGrade={finalGrade}
          busy={busy}
          confirming={subjectiveBusy === "confirm"}
          onConfirm={onConfirmSubjectiveGrade}
        />
      )}

      <div className="border-b border-outline-variant/20 bg-surface-container-lowest px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" aria-label="训练轮次">{([1, 2, 3] as const).map((round) => {
            const record = getEnglishRound(ledger, round);
            const label = record?.status === "sealed" ? "已封存" : record?.status === "submitted" ? "已提交" : record?.status === "in_progress" ? "作答中" : record?.status === "abandoned" ? "已放弃" : "未开始";
            return <button key={round} type="button" disabled={!record || startingNext} onClick={() => onRoundChange(round)} className={`control-button h-9 px-3 text-xs ${activeRound === round ? "control-button-selected" : ""}`}>R{round} · {label}</button>;
          })}</div>
          {canStartNextRound && <button type="button" onClick={onStartNextRound} disabled={startingNext || Boolean(saving)} className="control-button control-button-primary h-9 px-3 text-xs">{startingNext ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}开始 R{activeRound + 1}<ChevronRight className="h-3.5 w-3.5" /></button>}
        </div>
        <p className="mt-2 text-xs leading-5 text-on-surface-variant">{persistenceMode === "legacy"
          ? "三轮与纠正历史暂保存在本机浏览器；旧数据库仍保存最近一次正式结果，待生产迁移后再开启跨设备同步。"
          : persistenceMode === "dual"
            ? "共享三轮历史已开启跨设备同步；旧数据库仅保留可回退的最近正式结果投影。"
            : "共享三轮历史已开启跨设备同步；所有新记录只写入共享训练核。"}</p>
      </div>

      <div className={`english-practice-grid ${isReading ? "english-practice-grid-reading" : "english-practice-grid-single"}`}>
        <article className="english-article-pane" aria-label={isWriting ? "英语作文题目与作答" : "英语真题原文"}>
          {isWriting ? (
            <div ref={articlePageRef} className="english-article-page">
              <WritingPracticeContent
                passage={passage}
                question={questions[0]}
                value={questions[0] ? answers[questions[0].id] ?? "" : ""}
                directScoreMode={directScoreMode}
                readOnly={readOnly}
                onAnswerChange={(value) => {
                  if (questions[0]) onAnswerChange(questions[0].id, value);
                }}
                onScoreChange={(value) => {
                  if (questions[0]) onDirectScoreChange(questions[0].id, value);
                }}
              />
            </div>
          ) : hasOriginalContent && articlePages.length > 0 ? (
            <>
              <div className="english-article-pager flex items-center justify-between gap-3 text-xs text-on-surface-variant">
                <span>文章 {currentPage + 1} / {articlePages.length}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => onArticlePageChange(Math.max(currentPage - 1, 0))} disabled={currentPage === 0} aria-label="上一页文章" className="control-button english-article-nav-button min-h-11 px-3 text-xs"><ArrowLeft className="h-3.5 w-3.5" /><span className="sr-only">上一页</span></button>
                  <button type="button" onClick={() => onArticlePageChange(Math.min(currentPage + 1, articlePages.length - 1))} disabled={currentPage >= articlePages.length - 1} aria-label="下一页文章" className="control-button english-article-nav-button min-h-11 px-3 text-xs"><ArrowRight className="h-3.5 w-3.5" /><span className="sr-only">下一页</span></button>
                </div>
              </div>
              <div ref={articlePageRef} className="english-article-page">
                {passage.section === "new_type" && newTypeKind && <NewTypeAnswerStrip
                  kind={newTypeKind}
                  questions={questions}
                  answers={answers}
                  openQuestionId={openInlineQuestionId}
                  readOnly={readOnly}
                  directScoreMode={directScoreMode}
                  onToggleQuestion={(questionId) => setOpenInlineQuestionId((current) => current === questionId ? null : questionId)}
                  onAnswerChange={onAnswerChange}
                  onScoreChange={onDirectScoreChange}
                />}
                <PassagePageContent
                  passage={passage}
                  content={articlePages[currentPage]}
                  questions={questions}
                  answers={answers}
                  openQuestionId={openInlineQuestionId}
                  readOnly={readOnly}
                  directScoreMode={directScoreMode}
                  onToggleQuestion={(questionId) => setOpenInlineQuestionId((current) => current === questionId ? null : questionId)}
                  onAnswerChange={onAnswerChange}
                  onScoreChange={onDirectScoreChange}
                />
              </div>
            </>
          ) : (
            <MissingPassageContent
              questions={questions}
              directScoreMode={directScoreMode}
              readOnly={readOnly}
              answers={answers}
              onScoreChange={onDirectScoreChange}
            />
          )}
        </article>

        {typeof document !== "undefined" && createPortal(
          <AnimatePresence initial={false}>
          {isReading && questionDockOpen && (
            <motion.div
              key="english-question-dock-overlay"
              className="english-question-dock-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <button type="button" className="english-question-dock-scrim" aria-label="关闭答题栏" onClick={() => setQuestionDockOpen(false)} />
              <motion.aside
                id="english-question-dock"
                ref={questionDockRef}
                className="english-question-dock"
                role="dialog"
                aria-modal="true"
                aria-labelledby="english-question-dock-title"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <header className="english-question-dock-header">
                  <div>
                    <p className="english-question-dock-eyebrow">阅读作答</p>
                    <h3 id="english-question-dock-title">{getPassageDisplayTitle(passage)}</h3>
                    <span>{questions.length} 题 · 选择后自动保存到当前草稿</span>
                  </div>
                  <button ref={questionDockCloseRef} type="button" className="english-question-dock-close" onClick={() => setQuestionDockOpen(false)} aria-label="关闭答题栏"><X className="h-5 w-5" /></button>
                </header>
                <div className="english-question-dock-body">
                  {questions.length === 0 ? <p className="py-4 text-sm text-on-surface-variant">这篇的题目和评分来源还未导入。</p> : <div className="grid gap-4">{questions.map((question) => {
                    const submittedAnswer = roundRevision?.answers[question.id] ?? "";
                    const manualScore = parseEnglishManualScore(submittedAnswer, question.score);
                    const correct = Boolean(manualScore === null && normalizeEnglishObjectiveAnswer(question.standardAnswer) && normalizeEnglishObjectiveAnswer(submittedAnswer)
                      && normalizeEnglishObjectiveAnswer(question.standardAnswer) === normalizeEnglishObjectiveAnswer(submittedAnswer));
                    const savedAnswer = manualScore !== null
                      ? { isManual: true, score: manualScore }
                      : roundRevision ? { isCorrect: correct, score: correct ? question.score : 0 } : attempt?.answers.find((answer) => answer.questionId === question.id);
                    return <QuestionBlock key={question.id} passage={passage} question={question} value={answers[question.id] ?? ""} savedAnswer={savedAnswer} submitted={submitted} readOnly={readOnly} objective directScoreMode={directScoreMode} onChange={(answer) => onAnswerChange(question.id, answer)} onScoreChange={(score) => onDirectScoreChange(question.id, score)} />;
                  })}</div>}
                </div>
              </motion.aside>
            </motion.div>
          )}
          </AnimatePresence>,
          document.body,
        )}
      </div>
    </section>
  );
}

function SuggestionList({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3"><div className="font-semibold text-on-surface">{title}</div>{items.length > 0 ? <ul className="mt-1 list-disc space-y-1 pl-4">{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <p className="mt-1">暂无</p>}</div>;
}

function SubjectiveGradeReview({ revisionId, suggestion, finalGrade, busy, confirming, onConfirm }: {
  revisionId: string;
  suggestion: EnglishSubjectiveGradeSuggestion;
  finalGrade?: { id: string; score: number; feedback?: string };
  busy: boolean;
  confirming: boolean;
  onConfirm: (revisionId: string, score: number, feedback: string, suggestion: EnglishSubjectiveGradeSuggestion) => void;
}) {
  const [reviewScore, setReviewScore] = useState(String(finalGrade?.score ?? suggestion.score));
  const [reviewFeedback, setReviewFeedback] = useState(finalGrade?.feedback ?? suggestion.feedback);
  const numericScore = Number(reviewScore);

  return <section className="border-b border-outline-variant/20 bg-surface-container-low px-4 py-4 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-headline text-base font-bold text-on-surface">{finalGrade ? "终分已确认，可继续修订" : "AI 建议待你确认"}</h3><p className="mt-1 text-xs leading-5 text-on-surface-variant">AI 分数不进入统计。只有你点击确认后，user_final 才是正式成绩。</p></div>
      <span className="text-xs text-on-surface-variant">建议置信度 {Math.round(suggestion.confidence * 100)}%</span>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)]">
      <label className="text-xs font-semibold text-on-surface-variant">最终分<input type="number" min={0} max={suggestion.maxScore} step={0.5} value={reviewScore} onChange={(event) => setReviewScore(event.target.value)} className="field-control mt-1 w-full px-3 py-2 text-sm" /></label>
      <label className="text-xs font-semibold text-on-surface-variant">确认反馈<textarea rows={3} value={reviewFeedback} onChange={(event) => setReviewFeedback(event.target.value)} className="field-control mt-1 w-full resize-y px-3 py-2 text-sm" /></label>
    </div>
    <div className="mt-3 grid gap-2 text-xs leading-5 text-on-surface-variant md:grid-cols-3"><SuggestionList title="做得较好" items={suggestion.strengths} /><SuggestionList title="需要修正" items={suggestion.issues} /><SuggestionList title="修改建议" items={suggestion.suggestions} /></div>
    <div className="mt-4 flex justify-end"><button type="button" disabled={busy || !revisionId || !reviewFeedback.trim() || !Number.isFinite(numericScore) || numericScore < 0 || numericScore > suggestion.maxScore} onClick={() => onConfirm(revisionId, numericScore, reviewFeedback.trim(), suggestion)} className="control-button control-button-primary h-10 px-4 text-sm">{confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{finalGrade ? "更新正式终分" : "确认正式终分"}</button></div>
  </section>;
}

function QuestionBlock({ passage, question, value, savedAnswer, submitted, readOnly, objective, directScoreMode, onChange, onScoreChange }: {
  passage: EnglishPassage;
  question: EnglishQuestion;
  value: string;
  savedAnswer?: { isCorrect?: boolean; isManual?: boolean; score: number };
  submitted: boolean;
  readOnly: boolean;
  objective: boolean;
  directScoreMode: boolean;
  onChange: (value: string) => void;
  onScoreChange: (value: string) => void;
}) {
  const manualScore = parseEnglishManualScore(value, question.score);
  const directScore = savedAnswer?.isManual === true || manualScore !== null;
  const correct = submitted && !directScore && savedAnswer?.isCorrect === true;
  const wrong = submitted && !directScore && savedAnswer?.isCorrect === false;
  const questionTitle = passage.section === "cloze" ? `Blank ${question.questionNo}` : question.stem || `第 ${question.questionNo} 题`;
  return <div className={`english-question-card ${correct ? "english-question-card-correct" : ""} ${wrong ? "english-question-card-wrong" : ""}`}>
    <div className="english-question-meta"><span>第 {question.questionNo} 题</span>{directScore && submitted ? <span className="text-primary">已记分 · {savedAnswer?.score ?? manualScore ?? 0}/{question.score}</span> : (correct || wrong) && <span className={correct ? "text-green-700" : "text-red-700"}>{correct ? "正确" : "错误"} · {savedAnswer?.score ?? 0}/{question.score}</span>}</div>
    {questionTitle.trim() && <p className="english-question-stem">{questionTitle}</p>}
    {(directScoreMode || directScore) ? <label className="english-question-score-entry"><span>本题得分<small className="ml-1 font-normal">（满分 {question.score}）</small></span><input type="number" min={0} max={question.score} step={0.5} value={manualScore === null ? "" : manualScore} onChange={(event) => onScoreChange(event.target.value)} readOnly={readOnly} className="field-control english-question-score-input px-3 py-2 text-sm" placeholder="0" /></label> : question.options.length > 0 ? <div className="mt-4 grid gap-2.5">{question.options.map((option) => <button key={`${question.id}-${option.label}`} type="button" onClick={() => { if (!readOnly) onChange(option.label); }} aria-disabled={readOnly} className={`english-option-button ${value === option.label ? "english-option-button-selected" : ""} ${readOnly ? "english-option-button-readonly" : ""}`}><span className="english-option-label">{option.label}</span><span className="english-option-content">{option.content}</span></button>)}</div> : <textarea value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} rows={objective ? 2 : 8} className="field-control english-written-answer mt-3 w-full resize-y px-3 py-2" placeholder={objective ? "填写答案" : "记录你的作答"} />}
    {submitted && objective && <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900"><span className="font-semibold">标准答案：</span>{question.standardAnswer || "未导入"}</div>}
  </div>;
}

function WorkspaceMessage({ icon, text }: { icon?: ReactNode; text: string }) {
  return <section className="surface-panel flex min-h-[32rem] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-on-surface-variant">{icon ?? <ClipboardCheck className="h-8 w-8 opacity-50" />}<p>{text}</p></section>;
}
