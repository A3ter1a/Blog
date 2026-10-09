"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { ArrowLeft, Check, ClipboardCheck, Loader2, PenLine, RotateCcw, Save, X } from "lucide-react";
import type { EnglishAttemptAnswerInput } from "@/lib/english-training-api";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { EnglishGradingFeedback } from "@/components/jobs/EnglishGradingFeedback";
import { useToast } from "@/components/ui/Toast";
import { dialogMotion, dropdownMotion, uiMotion } from "@/lib/motion";
import { parseEnglishManualScore } from "@/lib/english-scoring";
import type { EnglishTrainingPersistenceMode } from "@/lib/english-training-core";
import type { EnglishSubjectiveGradeSuggestion } from "@/lib/english-subjective-grade";
import {
  ENGLISH_ORDERING_DISPLAY_ORDER,
  ENGLISH_ORDERING_FIXED_ANSWERS,
  isEnglishObjectiveSection,
  cleanEnglishPassageContent,
  cleanEnglishQuestionStem,
  extractEnglishPromptImages,
  getEnglishNewTypeKind,
  getEnglishNewTypePresentation,
  getEnglishOrderingSlots,
  hasEnglishPassageOriginal,
  normalizeEnglishObjectiveAnswer,
  removeEnglishPromptImages,
  type EnglishAttempt,
  type EnglishNewTypeKind,
  type EnglishPassage,
  type EnglishQuestion,
} from "@/lib/english-training";
import type { EnglishRoundRecord, EnglishRoundRevision } from "@/lib/english-round-history";

function InlineAnswerPanel({ children, className, questionNo, onClose, listbox = false }: {
  children: ReactNode;
  className: string;
  questionNo: string;
  onClose: () => void;
  listbox?: boolean;
}) {
  const present = useIsPresent();
  const reducedMotion = usePrefersReducedMotion();
  const panelRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!present || !panel) return;
    const pane = panel.closest(".english-article-page") ?? panel.closest(".english-article-pane");
    const fitPanel = () => {
      panel.style.left = "";
      panel.style.right = "";
      panel.style.width = "";
      panel.style.top = "";
      panel.style.maxHeight = "";
      panel.style.overflowY = "";
      const paneRect = pane?.getBoundingClientRect();
      const leftEdge = Math.max(12, (paneRect?.left ?? 0) + 8);
      const paneRight = paneRect && pane ? Math.min(paneRect.right, paneRect.left + pane.clientWidth) : window.innerWidth;
      const rightEdge = Math.min(window.innerWidth - 12, paneRight - 8);
      const availableWidth = rightEdge - leftEdge;
      if (availableWidth <= 0) return;
      if (panel.offsetWidth > availableWidth) panel.style.width = `${availableWidth}px`;
      const topEdge = Math.max(12, (paneRect?.top ?? 0) + 8);
      const bottomEdge = Math.min(window.innerHeight - 12, (paneRect?.bottom ?? window.innerHeight) - 8);
      const availableHeight = bottomEdge - topEdge;
      if (availableHeight > 0 && panel.offsetHeight > availableHeight) {
        panel.style.maxHeight = `${availableHeight}px`;
        panel.style.overflowY = "auto";
      }
      const rect = panel.getBoundingClientRect();
      const computed = window.getComputedStyle(panel);
      const matrix = new DOMMatrixReadOnly(computed.transform === "none" ? undefined : computed.transform);
      // Remove the entrance scale's center offset before clamping the layout position.
      const layoutLeft = rect.left - matrix.m41 - (panel.offsetWidth - rect.width) / 2;
      const desiredLeft = Math.max(leftEdge, Math.min(layoutLeft, rightEdge - panel.offsetWidth));
      const cssLeft = Number.parseFloat(computed.left) || 0;
      panel.style.left = `${cssLeft + desiredLeft - layoutLeft}px`;
      panel.style.right = "auto";
      if (availableHeight > 0) {
        const layoutTop = rect.top - matrix.m42 - (panel.offsetHeight - rect.height) / 2;
        const desiredTop = Math.max(topEdge, Math.min(layoutTop, bottomEdge - panel.offsetHeight));
        const cssTop = Number.parseFloat(computed.top) || 0;
        panel.style.top = `${cssTop + desiredTop - layoutTop}px`;
      }
    };
    fitPanel();
    const observer = new ResizeObserver(fitPanel);
    if (pane) observer.observe(pane);
    window.addEventListener("resize", fitPanel);
    return () => { observer.disconnect(); window.removeEventListener("resize", fitPanel); };
  }, [present]);
  return <motion.span
    ref={panelRef}
    className={className}
    style={{ textIndent: 0 }}
    role={listbox ? "listbox" : undefined}
    aria-label={listbox ? `${questionNo} 题选项` : undefined}
    inert={!present || undefined}
    aria-hidden={!present || undefined}
    variants={dropdownMotion}
    initial={reducedMotion ? false : "initial"}
    animate="animate"
    exit="exit"
    transition={{ duration: reducedMotion ? 0 : uiMotion.duration.fast, ease: uiMotion.ease.standard }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    }}
  >{children}</motion.span>;
}

function EnglishFeedbackOverlay({ children, className }: { children: ReactNode; className: string }) {
  const present = useIsPresent();
  const reducedMotion = usePrefersReducedMotion();
  return <motion.div
    className={`${className} english-feedback-surface`}
    data-reduced-motion={reducedMotion}
    style={{ pointerEvents: present ? "auto" : "none" }}
    inert={!present || undefined}
    aria-hidden={!present || undefined}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: reducedMotion ? 0 : uiMotion.duration.fast, ease: uiMotion.ease.standard }}
  >{children}</motion.div>;
}

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
  inlineSentence = false,
  directScoreMode = false,
  onToggle,
  onChange,
  onScoreChange,
  onReset,
  usedOptionLabels,
  emptyLabel,
}: {
  question: EnglishQuestion;
  value: string;
  open: boolean;
  readOnly: boolean;
  compact?: boolean;
  inlineSentence?: boolean;
  directScoreMode?: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onScoreChange?: (value: string) => void;
  onReset?: () => void;
  usedOptionLabels?: ReadonlySet<string>;
  emptyLabel?: string;
}) {
  const toast = useToast();
  const triggerRef = useRef<HTMLButtonElement | HTMLSpanElement>(null);
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
        {onReset && <button type="button" aria-disabled={!value.trim()} className="english-inline-answer-reset" onClick={() => value.trim() ? onReset() : toast.info("这题还没有作答。")} aria-label={`重置第 ${question.questionNo} 题`}><RotateCcw className="h-3.5 w-3.5" /><span>重置</span></button>}
      </span>
    );
  }

  const selected = getSelectedOption(question, value);
  const display = selected ? (compact ? selected.label : selected.content) : (emptyLabel ?? question.questionNo);
  const showAsSentence = inlineSentence && Boolean(selected);
  const Trigger = inlineSentence ? "span" : "button";

  return (
    <span className={`english-inline-answer ${compact ? "is-compact" : "is-inline-flow"} ${showAsSentence ? "is-sentence" : ""} ${open ? "is-open" : ""}`} data-inline-question={question.id}>
      <Trigger
        ref={(node) => { triggerRef.current = node; }}
        type={inlineSentence ? undefined : "button"}
        role={inlineSentence ? "button" : undefined}
        tabIndex={inlineSentence ? 0 : undefined}
        className={`english-inline-answer-trigger ${selected ? "has-value" : ""}`}
        aria-haspopup="listbox"
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) { event.preventDefault(); onToggle(); triggerRef.current?.focus(); }
          if (inlineSentence && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            if (readOnly) toast.info("这题已提交，请先进入修改模式再作答。");
            else onToggle();
          }
        }}
        aria-expanded={open}
        aria-disabled={readOnly}
        aria-label={`${question.questionNo} 题${selected ? `，已选 ${selected.label}` : "，选择答案"}`}
        onClick={() => {
          if (readOnly) toast.info("这题已提交，请先进入修改模式再作答。");
          else onToggle();
        }}
      >
        {selected ? (
          <span className="english-inline-answer-value">{display}</span>
        ) : (
          <span className="english-inline-answer-number">{display}</span>
        )}
      </Trigger>
      <AnimatePresence initial={false}>
      {open && !readOnly && (
        <InlineAnswerPanel className="english-inline-answer-menu" questionNo={question.questionNo} listbox onClose={() => { onToggle(); triggerRef.current?.focus(); }}>
          {onReset && <span className="english-inline-answer-menu-header"><span>第 {question.questionNo} 题</span><button type="button" aria-disabled={!value.trim()} onClick={() => value.trim() ? onReset() : toast.info("这题还没有作答。")} aria-label={`重置第 ${question.questionNo} 题`}><RotateCcw className="h-3.5 w-3.5" />重置</button></span>}
          {question.options.map((option) => (
            <button
              key={`${question.id}-${option.label}`}
              type="button"
              role="option"
              aria-selected={option.label === selected?.label}
              aria-disabled={Boolean(usedOptionLabels?.has(option.label) && option.label !== selected?.label)}
              className={`${option.label === selected?.label ? "is-selected" : ""} ${usedOptionLabels?.has(option.label) && option.label !== selected?.label ? "is-used" : ""}`.trim()}
              onClick={() => {
                if (usedOptionLabels?.has(option.label) && option.label !== selected?.label) {
                  toast.info("这个选项已被占用，请选择其他项。");
                  return;
                }
                onChange(option.label);
                onToggle();
                triggerRef.current?.focus();
              }}
            >
              <strong>{option.label}</strong>
              <span>{option.content}</span>
            </button>
          ))}
        </InlineAnswerPanel>
      )}
      </AnimatePresence>
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
  const toast = useToast();
  const triggerRef = useRef<HTMLButtonElement>(null);
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
        ref={triggerRef}
        type="button"
        className={`english-inline-answer-trigger ${value.trim() ? "has-value" : ""}`}
        aria-expanded={open}
        aria-disabled={readOnly}
        aria-label={`${question.questionNo} 题${value.trim() ? "，已填写翻译" : "，填写翻译"}`}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) { event.preventDefault(); onToggle(); triggerRef.current?.focus(); }
        }}
        onClick={() => {
          if (readOnly) toast.info("这题已提交，请先进入修改模式再作答。");
          else onToggle();
        }}
      >
        <span className="english-inline-answer-number">({question.questionNo})</span>
        <span className="english-inline-answer-value">{value.trim() || "点击填写译文"}</span>
      </button>
      <AnimatePresence initial={false}>
      {open && !readOnly && (
        <InlineAnswerPanel className="english-inline-text-editor" questionNo={question.questionNo} onClose={() => { onToggle(); triggerRef.current?.focus(); }}>
          <textarea
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
            className="field-control w-full resize-y px-3 py-2 text-sm leading-6"
            placeholder="输入这处划线句的中文翻译"
            aria-label={`${question.questionNo} 题翻译`}
          />
          <span className="english-inline-text-hint">点击文章其他位置收起</span>
        </InlineAnswerPanel>
      )}
      </AnimatePresence>
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
  onResetQuestion?: (questionId: string) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(?:\((\d{1,2})\)|\[(\d{1,2})\]|(?<!\w)(\d{1,2})(?!\w))/g;
  let lastIndex = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    const blankNo = match[1] ?? match[2] ?? match[3];
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
          onReset={() => onResetQuestion?.(question.id)}
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

function renderNewTypeParagraph(
  content: string,
  kind: EnglishNewTypeKind | undefined,
  questionsByNo: Map<string, EnglishQuestion>,
  answers: Record<string, string>,
  openQuestionId: string | null,
  readOnly: boolean,
  directScoreMode: boolean,
  onToggle: (questionId: string) => void,
  onChange: (questionId: string, answer: string) => void,
  onScoreChange: (questionId: string, score: string) => void,
  onResetQuestion?: (questionId: string) => void,
): ReactNode[] {
  const renderChoice = (question: EnglishQuestion) => <InlineChoiceBlank
    key={`${question.id}-${content.slice(0, 12)}`}
    question={question}
    value={answers[question.id] ?? ""}
    inlineSentence={kind === "insertion" || kind === "statement_matching"}
    open={openQuestionId === question.id}
    readOnly={readOnly}
    directScoreMode={directScoreMode}
    onToggle={() => onToggle(question.id)}
    onChange={(answer) => onChange(question.id, answer)}
    onScoreChange={(score) => onScoreChange(question.id, score)}
    onReset={() => onResetQuestion?.(question.id)}
    usedOptionLabels={kind === "insertion" || kind === "heading"
      ? new Set(Object.entries(answers).filter(([questionId]) => questionId !== question.id).map(([, answer]) => normalizeEnglishObjectiveAnswer(answer)))
      : undefined}
  />;
  if (kind === "statement_matching") {
    const nameMatch = content.match(/^[\[（(](1[1-5]|4[1-5])[\]）)]\s*([^\n]+)$/);
    const question = nameMatch ? questionsByNo.get(nameMatch[1]) : undefined;
    if (!nameMatch || !question) return [content];
    return [`${nameMatch[2].trim()}：`, renderChoice(question)];
  }

  if (kind === "insertion") {
    return renderMarkedParagraph(
      content,
      /[\[（(](1[1-5]|4[1-5])[\]）)](?:[ \t]*_{2,})?/g,
      (questionNo) => questionsByNo.get(questionNo),
      renderChoice,
    );
  }

  if (kind === "heading") {
    const headingMatch = content.match(/^(Paragraph\s+)([1-5])([.:]?\s*)/i);
    if (!headingMatch) return [content];
    const question = questionsByNo.get(String(Number(headingMatch[2]) + 10));
    if (!question) return [content];
    return [
      <span key={`heading-answer-${question.id}`} className="english-new-type-heading-answer-line">{renderChoice(question)}</span>,
      <span key={`heading-body-${question.id}`} className="english-new-type-heading-body">{content.slice(headingMatch[0].length).trim()}</span>,
    ];
  }

  return [content];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findFlexibleTextRange(content: string, start: number, target: string): { start: number; end: number } | null {
  const normalized = target.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const pattern = normalized.split(" ").map(escapeRegExp).join("\\s+");
  const match = new RegExp(pattern, "i").exec(content.slice(start));
  return match
    ? { start: start + match.index, end: start + match.index + match[0].length }
    : null;
}

function renderTranslationContent(
  content: string,
  questions: EnglishQuestion[],
  answers: Record<string, string>,
  openQuestionId: string | null,
  readOnly: boolean,
  directScoreMode: boolean,
  onToggleQuestion: (questionId: string) => void,
  onAnswerChange: (questionId: string, value: string) => void,
  onScoreChange: (questionId: string, value: string) => void,
  onResetQuestion?: (questionId: string) => void,
): ReactNode[] {
  const questionsByNo = new Map(questions.map((question) => [question.questionNo, question]));
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return paragraphs.map((paragraph, paragraphIndex) => {
    const matches = [...paragraph.matchAll(/\((4[6-9]|50)\)/g)];
    if (matches.length === 0) return <p key={`translation-paragraph-${paragraphIndex}`}>{paragraph}</p>;

    const nodes: ReactNode[] = [];
    let cursor = 0;
    matches.forEach((match, index) => {
      const markerStart = match.index ?? 0;
      const question = questionsByNo.get(match[1]);
      if (!question) return;
      const segmentStart = markerStart + match[0].length;
      const nextMarkerStart = matches[index + 1]?.index ?? paragraph.length;
      const range = findFlexibleTextRange(paragraph, segmentStart, question.stem);
      const sourceStart = range?.start ?? segmentStart;
      const sourceEnd = range?.end ?? nextMarkerStart;
      const prefix = paragraph.slice(cursor, sourceStart).replace(/\((4[6-9]|50)\)/g, "");
      if (prefix) nodes.push(prefix);
      nodes.push(
        <InlineTranslationSentence
          key={`translation-${question.id}`}
          question={question}
          sourceText={paragraph.slice(sourceStart, sourceEnd)}
          value={answers[question.id] ?? ""}
          open={openQuestionId === question.id}
          readOnly={readOnly}
          directScoreMode={directScoreMode}
          onToggle={() => onToggleQuestion(question.id)}
          onChange={(value) => onAnswerChange(question.id, value)}
          onScoreChange={(score) => onScoreChange(question.id, score)}
          onReset={() => onResetQuestion?.(question.id)}
        />,
      );
      cursor = sourceEnd;
    });
    const tail = paragraph.slice(cursor).replace(/\((4[6-9]|50)\)/g, "");
    if (tail) nodes.push(tail);
    return <p key={`translation-paragraph-${paragraphIndex}`}>{nodes}</p>;
  });
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
  onResetQuestion,
  translationMarkerMode = "interactive",
  newTypeKind,
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
  onResetQuestion?: (questionId: string) => void;
  translationMarkerMode?: "interactive" | "anchor";
  newTypeKind?: EnglishNewTypeKind;
}) {
  const paragraphs = content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const questionsByNo = new Map(questions.map((question) => [question.questionNo, question]));
  if (passage.section === "translation" && translationMarkerMode === "interactive") {
    return <div className="english-passage-content english-translation-flow text-on-surface">
      {renderTranslationContent(content, questions, answers, openQuestionId, readOnly, directScoreMode, onToggleQuestion, onAnswerChange, onScoreChange, onResetQuestion)}
    </div>;
  }
  return <div className="english-passage-content text-on-surface">{paragraphs.map((paragraph, index) => (
    <p key={`${index}-${paragraph.slice(0, 12)}`}>
      {passage.section === "cloze"
        ? renderClozeParagraph(paragraph, questionsByNo, answers, openQuestionId, readOnly, directScoreMode, onToggleQuestion, onAnswerChange, onScoreChange, onResetQuestion)
        : passage.section === "translation" && translationMarkerMode === "anchor"
          ? renderMarkedParagraph(
              paragraph,
              /\((4[6-9]|50)\)/g,
              (questionNo) => questionsByNo.get(questionNo),
              (question) => <span key={`${index}-${question.id}`} className="english-translation-anchor">第 {question.questionNo} 题</span>,
            )
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
          ? renderNewTypeParagraph(paragraph, newTypeKind, questionsByNo, answers, openQuestionId, readOnly, directScoreMode, onToggleQuestion, onAnswerChange, onScoreChange, onResetQuestion)
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
  onResetQuestion,
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
  onResetQuestion?: (questionId: string) => void;
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
            onReset={() => onResetQuestion?.(question.id)}
          />
        ))}
      </div>
    </section>
  );
}

function NewTypeOrderingArticle({
  sourceContent,
  questions,
  choices,
  answers,
  openQuestionId,
  readOnly,
  directScoreMode,
  onToggleQuestion,
  onAnswerChange,
  onScoreChange,
  onResetQuestion,
}: {
  sourceContent: string;
  questions: EnglishQuestion[];
  choices: EnglishQuestion["options"];
  answers: Record<string, string>;
  openQuestionId: string | null;
  readOnly: boolean;
  directScoreMode: boolean;
  onToggleQuestion: (questionId: string) => void;
  onAnswerChange: (questionId: string, value: string) => void;
  onScoreChange: (questionId: string, value: string) => void;
  onResetQuestion?: (questionId: string) => void;
}) {
  const printedSlots = getEnglishOrderingSlots(sourceContent);
  const questionsByNo = new Map(questions.map((question) => [question.questionNo, question]));
  const hasPrintedSlots = printedSlots.length > 0;
  const questionsByLabel = new Map(["A", "B", "D", "E", "G"].map((label, index) => [label, questions[index]] as const));
  const choicesByLabel = new Map(choices.map((choice) => [choice.label, choice.content]));
  const fixedLabelToPosition = hasPrintedSlots
    ? new Map(printedSlots.filter((slot) => slot.label).map((slot) => [slot.label!, slot.position]))
    : new Map<string, number>(Object.entries(ENGLISH_ORDERING_FIXED_ANSWERS).map(([position, label]) => [label, Number(position)]));
  const usedOptionLabels = hasPrintedSlots
    ? new Set(printedSlots.filter((slot) => slot.label || (slot.questionNo && answers[questionsByNo.get(slot.questionNo)?.id ?? ""]?.trim())).map((slot) => String(slot.position)))
    : new Set([...Object.keys(ENGLISH_ORDERING_FIXED_ANSWERS), ...Object.values(answers).map((answer) => normalizeEnglishObjectiveAnswer(answer))]);
  const displayLabels = hasPrintedSlots ? choices.map((choice) => choice.label).sort() : ENGLISH_ORDERING_DISPLAY_ORDER;

  return (
    <section className="english-new-type-ordering-article" aria-label="段落排序文章">
      <header className="english-new-type-ordering-article-header">
        <strong>段落排序 · {choices.length} 段原文</strong>
        <span>每段开头选择它在完整文章中的顺序；已给出的 {fixedLabelToPosition.size} 个段落显示固定数字。</span>
      </header>
      <div className="english-passage-content english-ordering-passage">
        {displayLabels.map((label) => {
          const assignedQuestion = questions.find((question) => normalizeEnglishObjectiveAnswer(answers[question.id] ?? "") === label);
          const assignedPosition = assignedQuestion
            ? printedSlots.find((slot) => slot.questionNo === assignedQuestion.questionNo)?.position
            : undefined;
          const question = hasPrintedSlots && questions[0] ? {
            ...questions[0],
            id: `${questions[0].passageId}-ordering-${label}`,
            questionNo: label,
            options: printedSlots.map((slot) => ({ label: String(slot.position), content: `第 ${slot.position} 段` })),
          } : questionsByLabel.get(label);
          const selectedPosition = hasPrintedSlots ? (assignedPosition ? String(assignedPosition) : "") : (question ? answers[question.id] ?? "" : "");
          const fixedPosition = fixedLabelToPosition.get(label);
          const content = choicesByLabel.get(label) ?? "";
          return (
            <p key={label} className="english-ordering-paragraph">
              <span className="english-ordering-paragraph-marker">
                {fixedPosition ? (
                  <span className="english-ordering-fixed-number" aria-label={`第 ${fixedPosition} 段`}>{fixedPosition}</span>
                ) : question ? (
                  <InlineChoiceBlank
                    question={question}
                    value={selectedPosition}
                    compact
                    open={openQuestionId === question.id}
                    readOnly={readOnly}
                    directScoreMode={directScoreMode}
                    onToggle={() => onToggleQuestion(question.id)}
                    onChange={(answer) => {
                      if (!hasPrintedSlots) { onAnswerChange(question.id, answer); return; }
                      const slot = printedSlots.find((item) => item.position === Number(answer));
                      const target = slot?.questionNo ? questionsByNo.get(slot.questionNo) : undefined;
                      if (!target || usedOptionLabels.has(answer) && answer !== selectedPosition) return;
                      if (assignedQuestion && assignedQuestion.id !== target.id) onAnswerChange(assignedQuestion.id, "");
                      onAnswerChange(target.id, label);
                    }}
                    onScoreChange={(score) => onScoreChange(question.id, score)}
                    onReset={() => onResetQuestion?.(hasPrintedSlots ? assignedQuestion?.id ?? "" : question.id)}
                    usedOptionLabels={new Set([...usedOptionLabels].filter((value) => value !== selectedPosition))}
                    emptyLabel="序号"
                  />
                ) : null}
                <strong>{label}</strong>
              </span>
              {content}
            </p>
          );
        })}
      </div>
    </section>
  );
}

function InlineTranslationSentence({
  question,
  sourceText,
  value,
  open,
  readOnly,
  directScoreMode,
  onToggle,
  onChange,
  onScoreChange,
  onReset,
}: {
  question: EnglishQuestion;
  sourceText: string;
  value: string;
  open: boolean;
  readOnly: boolean;
  directScoreMode: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onScoreChange: (value: string) => void;
  onReset?: () => void;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const toast = useToast();
  const manualScore = parseEnglishManualScore(value, question.score);
  const cleanSource = sourceText.replace(/\s+/g, " ").trim();

  return (
    <span data-inline-question={question.id} className={`english-translation-sentence ${open ? "is-open" : ""} ${value.trim() ? "has-answer" : ""}`}>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={readOnly ? -1 : 0}
        className="english-translation-sentence-trigger"
        aria-expanded={open}
        aria-disabled={readOnly}
        aria-label={`${question.questionNo} 题，${value.trim() ? "已填写译文，" : "填写译文，"}点击${open ? "收起" : "展开"}`}
        onClick={() => {
          if (readOnly) toast.info("这题已提交，请先进入修改模式再作答。");
          else { onToggle(); if (open) triggerRef.current?.focus(); }
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !readOnly) {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="english-translation-sentence-number">({question.questionNo})</span>
        <span>{cleanSource}</span>
        {value.trim() && <small>已填写</small>}
      </span>
      <AnimatePresence initial={false}>
        {open && !readOnly && (
          <InlineAnswerPanel className="english-translation-sentence-editor" questionNo={question.questionNo} onClose={() => { onToggle(); triggerRef.current?.focus(); }}>
            {onReset && <span className="english-translation-sentence-editor-header"><span>第 {question.questionNo} 题译文</span><button type="button" aria-disabled={!value.trim()} onClick={() => value.trim() ? onReset() : toast.info("这题还没有作答。")} aria-label={`重置第 ${question.questionNo} 题`}><RotateCcw className="h-3.5 w-3.5" />重置</button></span>}
            {directScoreMode ? (
              <label className="english-translation-sentence-score">
                <span>纸笔得分 · {question.score} 分</span>
                <input
                  type="number"
                  min={0}
                  max={question.score}
                  step={0.5}
                  value={manualScore === null ? "" : manualScore}
                  onChange={(event) => onScoreChange(event.target.value)}
                  className="field-control english-question-score-input px-3 py-2 text-sm"
                  placeholder="0"
                  aria-label={`${question.questionNo} 题得分`}
                />
              </label>
            ) : (
              <textarea
                autoFocus
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={3}
                className="field-control w-full resize-y px-3 py-2 text-sm leading-6"
                placeholder="输入这处划线句的中文翻译"
                aria-label={`${question.questionNo} 题翻译`}
              />
            )}
          </InlineAnswerPanel>
        )}
      </AnimatePresence>
    </span>
  );
}

function NewTypeChoiceBank({
  kind,
  choices,
}: {
  kind: EnglishNewTypeKind;
  choices: { label: string; content: string }[];
}) {
  const labels = {
    heading: "标题备选",
    insertion: "待插入句段",
    ordering: "待排序段落",
    statement_matching: "观点选项",
  } as const;

  if (choices.length === 0) return null;

  return (
    <section className="english-new-type-choice-bank" aria-label={labels[kind]}>
      <div className="english-new-type-choice-bank-heading">
        <div>
          <strong>{labels[kind]}</strong>
          <span>候选内容独立展示，可点击文章中的题号或排序位置进行选择。</span>
        </div>
        <span>{choices.length} 个选项</span>
      </div>
      <div className="english-new-type-choice-grid">
        {choices.map((choice) => (
          <article key={choice.label} className="english-new-type-choice-card">
            <span className="english-new-type-choice-label">{choice.label}</span>
            <p>{choice.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TranslationPracticeContent({
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
  onResetQuestion,
}: {
  passage: EnglishPassage;
  content: string;
  questions: EnglishQuestion[];
  answers: Record<string, string>;
  openQuestionId: string | null;
  readOnly: boolean;
  directScoreMode: boolean;
  onToggleQuestion: (questionId: string) => void;
  onAnswerChange: (questionId: string, value: string) => void;
  onScoreChange: (questionId: string, value: string) => void;
  onResetQuestion?: (questionId: string) => void;
}) {
  return (
    <div className="english-translation-workspace" aria-label="翻译原文与作答">
      <PassagePageContent
        passage={passage}
        content={content}
        questions={questions}
        answers={answers}
        openQuestionId={openQuestionId}
        readOnly={readOnly}
        directScoreMode={directScoreMode}
        onToggleQuestion={onToggleQuestion}
        onAnswerChange={onAnswerChange}
        onScoreChange={onScoreChange}
        onResetQuestion={onResetQuestion}
      />
    </div>
  );
}

type WritingDataRow = {
  label: string;
  values: string[];
};

type WritingDataGroup = {
  label: string;
  rows: Array<{ label: string; value: string }>;
};

type WritingData = {
  rows: WritingDataRow[];
  groups: WritingDataGroup[];
  columns: string[];
  cells: string[][];
  percentages: string[];
  prompt: string;
};

function parseWritingData(prompt: string): WritingData {
  const rows: WritingDataRow[] = [];
  const groups = new Map<string, Array<{ label: string; value: string }>>();
  let columns: string[] = [];
  let cells: string[][] = [];
  const lines = prompt.split(/\r?\n/);
  let tableStart = -1;
  let tableEnd = -1;
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!/^\s*\|/.test(lines[index]) || !/^\s*\|/.test(lines[index + 1]) || !/---/.test(lines[index + 1])) continue;
    tableStart = index;
    tableEnd = index + 2;
    while (tableEnd < lines.length && /^\s*\|/.test(lines[tableEnd])) tableEnd += 1;
    columns = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
    cells = lines.slice(index + 2, tableEnd).map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim())).filter((row) => row.length === columns.length);
    const tableRows = lines.slice(index + 2, tableEnd).map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim())).filter((cells) => cells.length >= 3);
    tableRows.forEach(([groupLabel, rowLabel, value]) => {
      if (!groupLabel || !rowLabel || !value || !/%$/.test(value)) return;
      const current = groups.get(groupLabel) ?? [];
      current.push({ label: rowLabel, value });
      groups.set(groupLabel, current);
    });
    break;
  }
  const yearPattern = /\b(20\d{2})\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/g;
  for (const match of prompt.matchAll(yearPattern)) {
    rows.push({ label: match[1], values: [match[2], match[3], match[4]] });
  }
  const percentages = [...prompt.matchAll(/\b\d+(?:\.\d+)?%/g)].map((match) => match[0]);
  const promptWithoutData = tableStart >= 0 && tableEnd > tableStart
    ? [...lines.slice(0, tableStart), ...lines.slice(tableEnd)].join("\n").replace(/\n{3,}/g, "\n\n").trim()
    : prompt;
  return { rows, groups: [...groups.entries()].map(([label, groupRows]) => ({ label, rows: groupRows })), columns, cells, percentages, prompt: promptWithoutData };
}

function WritingDataTable({ data }: { data: WritingData }) {
  const { rows, groups, columns, cells, percentages } = data;
  if (rows.length === 0 && groups.length === 0 && cells.length === 0 && percentages.length === 0) return null;
  if (groups.length > 0) {
    return (
      <div className="english-writing-data-visual english-writing-data-visual-groups" role="group" aria-label="作文题目数据表">
        {groups.map((group) => (
          <section key={group.label} className="english-writing-data-group">
            <h4>{group.label}</h4>
            <table>
              <thead><tr><th>项目</th><th>占比</th></tr></thead>
              <tbody>{group.rows.map((row) => <tr key={`${group.label}-${row.label}`}><th>{row.label}</th><td>{row.value}</td></tr>)}</tbody>
            </table>
          </section>
        ))}
      </div>
    );
  }
  if (cells.length > 0) {
    return <div className="english-writing-data-visual" role="group" aria-label="作文题目数据表"><table>
      <thead><tr>{columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead>
      <tbody>{cells.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0 ? <th key={column}>{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody>
    </table></div>;
  }
  if (rows.length > 0) {
    return (
      <div className="english-writing-data-visual" role="group" aria-label="作文题目数据表">
        <table>
          <thead><tr><th>年份</th><th>数据一</th><th>数据二</th><th>数据三</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.label}><th>{row.label}</th>{row.values.map((value, index) => <td key={`${row.label}-${index}`}>{value}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="english-writing-data-visual english-writing-data-visual-percent" role="group" aria-label="作文题目数据">
      <div>{percentages.map((value, index) => <span key={`${value}-${index}`}>{value}</span>)}</div>
    </div>
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
  const promptSource = question?.stem || passage.content;
  const promptImages = extractEnglishPromptImages(promptSource);
  const prompt = cleanEnglishQuestionStem("writing", questionNo, removeEnglishPromptImages(promptSource));
  const writingData = parseWritingData(prompt);
  const promptText = writingData.prompt
    .replace(/(?:^|\n|[ \t])\s*([1-4])[\).、：:][ \t]+/g, "\n\n$1. ")
    .replace(/(?:^|\n|[ \t])\s*[•●▪][ \t]+/g, "\n\n- ")
    .replace(/([.;])[ \t]+(Write your answer\b)/g, "$1\n\n$2");
  const hasWritingData = writingData.rows.length > 0 || writingData.groups.length > 0 || writingData.cells.length > 0 || writingData.percentages.length > 0;
  const score = question?.score ?? passage.totalScore;
  const manualScore = parseEnglishManualScore(value, score);

  return (
    <div className="english-writing-workspace">
      <section className="english-writing-prompt" aria-labelledby="english-writing-prompt-title">
        <div className="english-writing-prompt-meta">
          <span id="english-writing-prompt-title">写作题目 · {questionNo}</span>
          <span>{score} 分</span>
        </div>
        {promptImages.length > 0 && hasWritingData ? (
          <div className="english-writing-prompt-visual-row">
            <figure className="english-writing-prompt-visuals">
              {promptImages.map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={image.src} src={image.src} alt={image.alt} loading="eager" decoding="async" />
              ))}
            </figure>
            <WritingDataTable data={writingData} />
          </div>
        ) : promptImages.length > 0 ? (
          <figure className="english-writing-prompt-visuals">
            {promptImages.map((image) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={image.src} src={image.src} alt={image.alt} loading="eager" decoding="async" />
            ))}
          </figure>
        ) : hasWritingData ? (
          <WritingDataTable data={writingData} />
        ) : passage.passageNo === "big_writing" ? (
          <div className="english-writing-image-missing" role="status">当前题目没有随数据导入原图；重新抽取时请使用解析版 PDF。</div>
        ) : null}
        <div className="english-writing-prompt-instructions">
          <span className="english-writing-prompt-instructions-label">作答要求</span>
          <div className="english-writing-prompt-content">
            <MarkdownContent content={promptText} compact className="english-writing-prompt-markdown" />
          </div>
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
  if (passage.section === "new_type") {
    const template = /七选五|插入/.test(passage.title)
      ? "七选五"
      : /排序/.test(passage.title)
        ? "段落排序"
        : /标题/.test(passage.title)
          ? "小标题"
          : "新题型";
    return `${passage.year} 新题型 · ${template}`;
  }
  if (passage.section === "translation") return `${passage.year} 翻译`;
  return `${passage.year}`;
}

export function EnglishPracticeWorkspace({
  passage, questions, attempt, roundRecord, roundRevision, editingSubmitted,
  answers, saving, subjectiveBusy, persistenceMode, reviewMode, loading, directScoreMode, onDirectScoreChange, onBack, onAnswerChange,
  onResetQuestion, onResetPassage, onStartEditingSubmitted, onCancelEditingSubmitted, onSave, onSubmit, onConfirmSubjectiveGrade,
}: {
  passage: EnglishPassage | null;
  questions: EnglishQuestion[];
  attempt?: EnglishAttempt;
  roundRecord?: EnglishRoundRecord;
  roundRevision?: EnglishRoundRevision;
  editingSubmitted: boolean;
  answers: EnglishAttemptAnswerInput;
  saving: "save" | "submit" | null;
  subjectiveBusy: "suggest" | "confirm" | null;
  persistenceMode: EnglishTrainingPersistenceMode;
  reviewMode: boolean;
  loading: boolean;
  directScoreMode: boolean;
  onDirectScoreChange: (questionId: string, value: string) => void;
  onBack: () => void;
  onAnswerChange: (questionId: string, answer: string) => void;
  onResetQuestion: (questionId: string) => void;
  onResetPassage: () => void;
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
  const toast = useToast();
  const articlePageRef = useRef<HTMLDivElement | null>(null);
  const questionDockRef = useRef<HTMLElement | null>(null);
  const questionDockCloseRef = useRef<HTMLButtonElement | null>(null);
  const questionDockTriggerRef = useRef<HTMLButtonElement | null>(null);
  const subjectiveReviewCloseRef = useRef<HTMLButtonElement | null>(null);
  const subjectiveReviewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const subjectiveReviewDialogRef = useRef<HTMLDivElement | null>(null);
  const [questionDockOpen, setQuestionDockOpen] = useState(false);
  const [subjectiveReviewOpen, setSubjectiveReviewOpen] = useState(true);
  const [openInlineQuestionId, setOpenInlineQuestionId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const showingSubjectiveReview = Boolean(subjectiveReviewOpen && passage
    && !isEnglishObjectiveSection(passage.section) && !editingSubmitted
    && roundRevision?.grades?.some((grade) => grade.origin === "ai_suggested"));

  useEffect(() => {
    articlePageRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [passage?.id]);

  useEffect(() => {
    if (!questionDockOpen || passage?.section !== "reading") return;

    const questionDockTrigger = questionDockTriggerRef.current;
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
      questionDockTrigger?.focus();
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

  useEffect(() => {
    if (!showingSubjectiveReview) return;
    const focusTimer = window.setTimeout(() => subjectiveReviewCloseRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSubjectiveReviewOpen(false);
        return;
      }
      if (event.key !== "Tab" || !subjectiveReviewDialogRef.current) return;
      const focusable = subjectiveReviewDialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]",
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      subjectiveReviewTriggerRef.current?.focus();
    };
  }, [showingSubjectiveReview]);

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
  const isReading = passage.section === "reading";
  const isWriting = passage.section === "writing";
  const newTypeKind = passage.section === "new_type" ? getEnglishNewTypeKind(passage.content, passage.title, passage.year) : null;
  const newTypePresentation = passage.section === "new_type" && newTypeKind
    ? getEnglishNewTypePresentation(cleanedContent, newTypeKind, questions[0]?.options ?? [])
    : null;
  const displayContent = newTypePresentation?.body ?? cleanedContent;
  const articlePages = passage.section === "writing"
    ? paginatePassageContent(displayContent, 720)
    : displayContent ? [displayContent] : [];
  const currentPage = 0;
  const readOnly = submitted && !editingSubmitted;
  const subjectiveSubmissionBlocked = !reviewMode && !directScoreMode && !objective && persistenceMode === "legacy";
  const busy = Boolean(saving) || Boolean(subjectiveBusy);
  const canonicalMaxScore = passage.totalScore;
  const recordedScore = Math.min(canonicalMaxScore, roundRevision?.score ?? attempt?.score ?? 0);
  const currentScore = directScoreMode
    ? questions.reduce((sum, question) => sum + (parseEnglishManualScore(answers[question.id] ?? "", question.score) ?? 0), 0)
    : objective
      ? questions.reduce((sum, question) => sum + (normalizeEnglishObjectiveAnswer(answers[question.id] ?? "") === normalizeEnglishObjectiveAnswer(question.standardAnswer) ? question.score : 0), 0)
      : 0;
  const displayedScore = submitted ? recordedScore : Number(currentScore.toFixed(1));
  const requestSubmit = () => {
    if (subjectiveSubmissionBlocked) {
      toast.info("AI 批改尚未启用，当前作答可以先保存。");
      return;
    }
    if (!objective && !Object.values(answers).some((answer) => answer.trim())) {
      toast.info("请先填写作答，再获取 AI 建议。");
      return;
    }
    onSubmit();
  };

  return (
    <section className="english-practice-shell">
      <div className="english-practice-toolbar">
        <div className="english-practice-titlebar">
          <button type="button" onClick={onBack} className="control-button h-9 px-3 text-sm"><ArrowLeft className="h-4 w-4" />返回题组</button>
          <h2 className="english-practice-title">{getPassageDisplayTitle(passage)}</h2>
          <p className="english-practice-score">{submitted ? `${editingSubmitted ? "正在修改 · 原得分" : roundRevision?.gradeOrigin === "ai_suggested" ? "AI 建议" : "正式得分"} ${displayedScore}/${canonicalMaxScore}` : `当前得分 ${displayedScore}/${canonicalMaxScore}`}</p>
        </div>
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
          {!objective && suggestion && !editingSubmitted && <button
            ref={subjectiveReviewTriggerRef}
            type="button"
            onClick={() => setSubjectiveReviewOpen(true)}
            className="control-button h-10 px-3 text-sm"
          >
            <Check className="h-4 w-4" />批改建议
          </button>}
          <div className="english-practice-action-group" aria-label="题组操作" aria-busy={busy}>
            {subjectiveBusy === "confirm" && <span role="status" className="inline-flex items-center gap-2 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" />确认评分中…</span>}
            {questions.length > 0 && <button
              type="button"
              onClick={() => {
                if (!Object.values(answers).some((answer) => answer.trim()) && !roundRevision) toast.info("当前题组还没有作答，不需要重置。");
                else onResetPassage();
              }}
              disabled={busy}
              aria-disabled={busy || !Object.values(answers).some((answer) => answer.trim()) && !roundRevision}
              className="control-button h-10 px-3 text-sm"
              aria-label="重置当前题组状态"
            >
              <RotateCcw className="h-4 w-4" />重置状态
            </button>}
            {submitted ? editingSubmitted ? <>
              <button type="button" onClick={onCancelEditingSubmitted} disabled={busy} className="control-button h-10 px-3 text-sm"><X className="h-4 w-4" />取消修改</button>
              <button type="button" onClick={requestSubmit} disabled={busy || questions.length === 0} aria-disabled={busy || questions.length === 0 || subjectiveSubmissionBlocked} className="control-button control-button-primary h-10 px-3 text-sm">{saving === "submit" || subjectiveBusy === "suggest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving === "submit" ? "保存修改中…" : subjectiveBusy === "suggest" ? "正在创建批改任务…" : directScoreMode ? "保存得分" : objective ? "保存修改" : "重新获取 AI 建议"}</button>
            </> : <button type="button" onClick={() => subjectiveSubmissionBlocked ? toast.info("AI 批改尚未启用，当前作答可以先保存。") : onStartEditingSubmitted()} disabled={busy || questions.length === 0} aria-disabled={busy || questions.length === 0 || subjectiveSubmissionBlocked} className="control-button control-button-primary h-10 px-3 text-sm"><PenLine className="h-4 w-4" />{directScoreMode ? "修改得分" : objective ? "修改结果" : "修改答案"}</button> : <>
              <button type="button" onClick={onSave} disabled={busy} className="control-button h-10 px-3 text-sm">{saving === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving === "save" ? "保存中…" : "保存"}</button>
              <button type="button" onClick={requestSubmit} disabled={busy || questions.length === 0} aria-disabled={busy || questions.length === 0 || subjectiveSubmissionBlocked} className="control-button control-button-primary h-10 px-3 text-sm">{saving === "submit" || subjectiveBusy === "suggest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving === "submit" ? "提交中…" : subjectiveBusy === "suggest" ? "正在创建批改任务…" : directScoreMode ? "记录得分" : objective ? "提交本篇" : "获取 AI 建议"}</button>
            </>}
          </div>
        </div>
      </div>

      {typeof document !== "undefined" && suggestion && !editingSubmitted && createPortal(
        <AnimatePresence initial={false}>
          {subjectiveReviewOpen && (
            <EnglishFeedbackOverlay key="english-subjective-review-overlay" className="english-subjective-review-overlay modal-glass-backdrop">
              <button
                type="button"
                className="english-subjective-review-scrim"
                aria-label="关闭主观题批改"
                onClick={() => setSubjectiveReviewOpen(false)}
              />
              <motion.div
                ref={subjectiveReviewDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="english-subjective-review-title"
                className="english-subjective-review-dialog modal-glass-panel"
                variants={dialogMotion}
                initial={reducedMotion ? false : "initial"}
                animate="animate"
                exit="exit"
                transition={{ duration: reducedMotion ? 0 : uiMotion.duration.standard, ease: uiMotion.ease.standard }}
              >
                <header className="english-subjective-review-header">
                  <div>
                    <span>主观题批改</span>
                    <h3 id="english-subjective-review-title">{getPassageDisplayTitle(passage)}</h3>
                  </div>
                  <button
                    ref={subjectiveReviewCloseRef}
                    type="button"
                    className="english-subjective-review-close"
                    onClick={() => setSubjectiveReviewOpen(false)}
                    aria-label="关闭主观题批改"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </header>
                <SubjectiveGradeReview
                  key={`${roundRevision?.id}-${suggestionGrade?.id}-${finalGrade?.id ?? "pending"}`}
                  revisionId={roundRevision?.id ?? ""}
                  suggestion={suggestion}
                  finalGrade={finalGrade}
                  busy={busy}
                  confirming={subjectiveBusy === "confirm"}
                  onConfirm={onConfirmSubjectiveGrade}
                />
              </motion.div>
            </EnglishFeedbackOverlay>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <div className={`english-practice-grid ${isReading ? "english-practice-grid-reading" : "english-practice-grid-single"}`}>
        <motion.article
          className="english-article-pane"
          aria-label={isWriting ? "英语作文题目与作答" : "英语真题原文"}
          initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : uiMotion.duration.fast, ease: uiMotion.ease.standard }}
        >
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
          ) : passage.section === "new_type" && newTypeKind && newTypePresentation ? (
            <>
              <div ref={articlePageRef} className="english-article-page">
                {newTypeKind === "ordering" && <NewTypeOrderingArticle
                    sourceContent={passage.content}
                    questions={questions}
                    choices={newTypePresentation.choices}
                    answers={answers}
                    openQuestionId={openInlineQuestionId}
                    readOnly={readOnly}
                    directScoreMode={directScoreMode}
                    onToggleQuestion={(questionId) => setOpenInlineQuestionId((current) => current === questionId ? null : questionId)}
                    onAnswerChange={onAnswerChange}
                    onScoreChange={onDirectScoreChange}
                    onResetQuestion={onResetQuestion}
                  />}
                {newTypeKind === "statement_matching" && !/[（(]4[1-5][）)]/.test(displayContent) && <NewTypeAnswerStrip
                    kind={newTypeKind}
                    questions={questions}
                    answers={answers}
                    openQuestionId={openInlineQuestionId}
                    readOnly={readOnly}
                    directScoreMode={directScoreMode}
                    onToggleQuestion={(questionId) => setOpenInlineQuestionId((current) => current === questionId ? null : questionId)}
                    onAnswerChange={onAnswerChange}
                    onScoreChange={onDirectScoreChange}
                    onResetQuestion={onResetQuestion}
                  />}
                {newTypeKind === "ordering" ? null : articlePages.length > 0 ? (
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
                    onResetQuestion={onResetQuestion}
                    newTypeKind={newTypeKind}
                  />
                ) : (
                  <div className="english-new-type-context-empty">这类题型以候选段落直接组成题面，已将所有段落移到上方候选区。</div>
                )}
                {newTypeKind !== "ordering" && <NewTypeChoiceBank kind={newTypeKind} choices={newTypePresentation.choices} />}
              </div>
            </>
          ) : passage.section === "translation" && hasOriginalContent && articlePages.length > 0 ? (
            <>
              <div ref={articlePageRef} className="english-article-page">
                <TranslationPracticeContent
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
                  onResetQuestion={onResetQuestion}
                />
              </div>
            </>
          ) : hasOriginalContent && articlePages.length > 0 ? (
            <>
              <div ref={articlePageRef} className="english-article-page">
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
                  onResetQuestion={onResetQuestion}
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
        </motion.article>

        {typeof document !== "undefined" && createPortal(
          <AnimatePresence initial={false}>
          {isReading && questionDockOpen && (
            <EnglishFeedbackOverlay key="english-question-dock-overlay" className="english-question-dock-overlay">
              <button type="button" className="english-question-dock-scrim" aria-label="关闭答题栏" onClick={() => setQuestionDockOpen(false)} />
              <motion.aside
                id="english-question-dock"
                ref={questionDockRef}
                className="english-question-dock"
                role="dialog"
                aria-modal="true"
                aria-labelledby="english-question-dock-title"
                initial={{ x: reducedMotion ? 0 : "100%" }}
                animate={{ x: 0 }}
                exit={{ x: reducedMotion ? 0 : "100%" }}
                transition={{ duration: reducedMotion ? 0 : uiMotion.duration.standard, ease: uiMotion.ease.standard }}
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
                    return <QuestionBlock key={question.id} passage={passage} question={question} value={answers[question.id] ?? ""} savedAnswer={savedAnswer} submitted={submitted} readOnly={readOnly} objective directScoreMode={directScoreMode} onChange={(answer) => onAnswerChange(question.id, answer)} onScoreChange={(score) => onDirectScoreChange(question.id, score)} onReset={() => onResetQuestion(question.id)} />;
                  })}</div>}
                </div>
              </motion.aside>
            </EnglishFeedbackOverlay>
          )}
          </AnimatePresence>,
          document.body,
        )}
      </div>
    </section>
  );
}

function SubjectiveGradeReview({ revisionId, suggestion, finalGrade, busy, confirming, onConfirm }: {
  revisionId: string;
  suggestion: EnglishSubjectiveGradeSuggestion;
  finalGrade?: { id: string; score: number; feedback?: string };
  busy: boolean;
  confirming: boolean;
  onConfirm: (revisionId: string, score: number, feedback: string, suggestion: EnglishSubjectiveGradeSuggestion) => void;
}) {
  return <section className="english-subjective-grade-content"><EnglishGradingFeedback suggestion={suggestion} finalGrade={finalGrade} confirming={confirming} verifying={busy && !confirming} onConfirm={revisionId ? (score, feedback) => onConfirm(revisionId, score, feedback, suggestion) : undefined} /></section>;
}

function QuestionBlock({ passage, question, value, savedAnswer, submitted, readOnly, objective, directScoreMode, onChange, onScoreChange, onReset }: {
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
  onReset: () => void;
}) {
  const toast = useToast();
  const manualScore = parseEnglishManualScore(value, question.score);
  const directScore = savedAnswer?.isManual === true || manualScore !== null;
  const showResults = submitted && readOnly;
  const correct = showResults && !directScore && savedAnswer?.isCorrect === true;
  const wrong = showResults && !directScore && savedAnswer?.isCorrect === false;
  const questionTitle = passage.section === "cloze" ? `Blank ${question.questionNo}` : question.stem || `第 ${question.questionNo} 题`;
  return <div className={`english-question-card ${correct ? "english-question-card-correct" : ""} ${wrong ? "english-question-card-wrong" : ""}`}>
    <div className="english-question-meta">
      <span>第 {question.questionNo} 题</span>
      <div className="flex items-center gap-2">
        {directScore && showResults
          ? <span className="text-primary">已记分 · {savedAnswer?.score ?? manualScore ?? 0}/{question.score}</span>
          : (correct || wrong) && <span className={correct ? "text-green-700" : "text-red-700"}>{correct ? "正确" : "错误"} · {savedAnswer?.score ?? 0}/{question.score}</span>}
        <button type="button" aria-disabled={!value.trim()} onClick={() => value.trim() ? onReset() : toast.info("这题还没有作答。")} className="english-question-reset" aria-label={`重置第 ${question.questionNo} 题`}><RotateCcw className="h-3.5 w-3.5" />重置</button>
      </div>
    </div>
    {questionTitle.trim() && <p className="english-question-stem">{questionTitle}</p>}
    {(directScoreMode || directScore) ? <label className="english-question-score-entry"><span>本题得分<small className="ml-1 font-normal">（满分 {question.score}）</small></span><input type="number" min={0} max={question.score} step={0.5} value={manualScore === null ? "" : manualScore} onChange={(event) => onScoreChange(event.target.value)} readOnly={readOnly} className="field-control english-question-score-input px-3 py-2 text-sm" placeholder="0" /></label> : question.options.length > 0 ? <div className="mt-4 grid gap-2.5">{question.options.map((option) => <button key={`${question.id}-${option.label}`} type="button" onClick={() => { if (readOnly) toast.info("这题已提交，请先进入修改模式再作答。"); else onChange(option.label); }} aria-pressed={value === option.label} aria-disabled={readOnly} className={`english-option-button ${value === option.label ? "english-option-button-selected" : ""} ${readOnly ? "english-option-button-readonly" : ""}`}><span className="english-option-label">{option.label}</span><span className="english-option-content">{option.content}</span></button>)}</div> : <textarea value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} rows={objective ? 2 : 8} className="field-control english-written-answer mt-3 w-full resize-y px-3 py-2" placeholder={objective ? "填写答案" : "记录你的作答"} />}
    {showResults && objective && <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900"><span className="font-semibold">标准答案：</span>{question.standardAnswer || "未导入"}</div>}
  </div>;
}

function WorkspaceMessage({ icon, text }: { icon?: ReactNode; text: string }) {
  return <section className="surface-panel flex min-h-[32rem] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-on-surface-variant">{icon ?? <ClipboardCheck className="h-8 w-8 opacity-50" />}<p>{text}</p></section>;
}
