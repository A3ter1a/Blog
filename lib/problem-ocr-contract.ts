import { normalizeProblemForWrite } from "./content-contract.ts";
import type { Difficulty, Problem, ProblemOption, ProblemType } from "./types.ts";
import { extractOptions } from "./utils.ts";

export type ProblemOcrChapterContextItem = {
  id: string;
  name: string;
};

export type ProblemOcrSourceAsset = {
  path: string;
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type ProblemOcrItemCapture = {
  imageIndex: number;
  imageCount: number;
  imageName: string;
  ocrText: string;
  problems: Partial<Problem>[];
  warning?: string;
  qwenModel: string;
  deepseekModel: string;
  tokensUsed: number;
};

export type ProblemOcrJobResult = {
  resultVersion: 1;
  totalImages: number;
  completedImages: number;
  failedImages: number;
  extractedProblems: Partial<Problem>[];
  imageProgress: Array<{
    index: number;
    name: string;
    status: "complete";
    message: string;
    problemCount: number;
  }>;
  warnings: string[];
  captures: ProblemOcrItemCapture[];
};

export function isOwnedProblemOcrAssetPath(path: string, userId: string): boolean {
  const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^problem-ocr/${escapedUserId}/[0-9a-f-]{36}/\\d{2}\\.(?:jpg|png|webp)$`, "i").test(path);
}

const PROBLEM_TYPES: ProblemType[] = ["choice", "fill", "calculation", "proof", "proofEssay"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function optionalText(value: unknown): string | undefined {
  return cleanText(value) || undefined;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function normalizeOptions(value: unknown): ProblemOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value.flatMap((raw, index): ProblemOption[] => {
    if (!isRecord(raw)) {
      const content = cleanText(raw);
      return content ? [{ label: String.fromCharCode(65 + index), content }] : [];
    }
    const content = cleanText(raw.content);
    return content ? [{ label: cleanText(raw.label) || String.fromCharCode(65 + index), content }] : [];
  });
  return options.length > 0 ? options : undefined;
}

function findChapterId(suggestedChapter: string | undefined, chapterContext: ProblemOcrChapterContextItem[]): string | undefined {
  if (!suggestedChapter) return undefined;
  const normalized = suggestedChapter.trim().toLowerCase();
  return chapterContext.find((chapter) => {
    const name = chapter.name.trim().toLowerCase();
    return name === normalized || name.includes(normalized) || normalized.includes(name);
  })?.id;
}

export function materializeProblemOcrProblem(
  value: unknown,
  ocrText: string,
  chapterContext: ProblemOcrChapterContextItem[] = [],
): Partial<Problem> | null {
  const raw = isRecord(value) ? value : {};
  const question = cleanText(raw.question);
  if (!question) return null;
  const type = PROBLEM_TYPES.includes(raw.type as ProblemType) ? raw.type as ProblemType : "calculation";
  const difficulty = DIFFICULTIES.includes(raw.difficulty as Difficulty) ? raw.difficulty as Difficulty : "medium";
  const confidence = Number(raw.confidence);
  const normalizedConfidence = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5;
  const suggestedChapter = optionalText(raw.suggestedChapter);
  const options = type === "choice" ? normalizeOptions(raw.options) ?? extractOptions(question) : undefined;

  return normalizeProblemForWrite({
    type,
    difficulty,
    question,
    answer: cleanText(raw.answer),
    explanation: "",
    tips: undefined,
    options,
    tags: [],
    chapterId: findChapterId(suggestedChapter, chapterContext),
    aiResult: {
      rawQuestion: ocrText,
      rawAnswer: "",
      rawExplanation: "",
      confidence: normalizedConfidence,
    },
  }, "ocr");
}

export function buildProblemOcrJobResult(captures: ProblemOcrItemCapture[]): ProblemOcrJobResult {
  const sorted = [...captures].sort((left, right) => left.imageIndex - right.imageIndex);
  const totalImages = sorted.length;
  if (sorted.some((capture, index) => capture.imageIndex !== index + 1 || capture.imageCount !== totalImages)) {
    throw new Error("题库 OCR 分块序号或总数不连续，拒绝生成聚合结果。");
  }
  const warnings = sorted.flatMap((capture) => capture.warning
    ? [`第 ${capture.imageIndex} 张图片：${capture.warning}`]
    : capture.problems.length === 0
      ? [`第 ${capture.imageIndex} 张图片识别完成，但没有提取到可用题目`]
      : []);

  return {
    resultVersion: 1,
    totalImages,
    completedImages: totalImages,
    failedImages: 0,
    extractedProblems: sorted.flatMap((capture) => capture.problems),
    imageProgress: sorted.map((capture) => ({
      index: capture.imageIndex - 1,
      name: capture.imageName,
      status: "complete",
      message: capture.problems.length > 0 ? `提取到 ${capture.problems.length} 道题` : "未提取到可用题目",
      problemCount: capture.problems.length,
    })),
    warnings,
    captures: sorted,
  };
}

export function extractProblemOcrJobResult(value: unknown): ProblemOcrJobResult | null {
  if (!isRecord(value) || value.resultVersion !== 1) return null;
  const totalImages = value.totalImages;
  const completedImages = value.completedImages;
  const failedImages = value.failedImages;
  if (
    !isNonNegativeInteger(totalImages)
    || !isNonNegativeInteger(completedImages)
    || !isNonNegativeInteger(failedImages)
    || !Array.isArray(value.extractedProblems)
    || !Array.isArray(value.imageProgress)
    || !Array.isArray(value.warnings)
    || !Array.isArray(value.captures)
  ) return null;
  if (!value.warnings.every((item) => typeof item === "string")) return null;
  if (value.imageProgress.length !== totalImages) return null;
  for (const [index, item] of value.imageProgress.entries()) {
    if (!isRecord(item)) return null;
    if (
      item.index !== index
      || typeof item.name !== "string"
      || item.status !== "complete"
      || typeof item.message !== "string"
      || !isNonNegativeInteger(item.problemCount)
    ) return null;
  }

  const captures: ProblemOcrItemCapture[] = [];
  for (const capture of value.captures) {
    if (!isRecord(capture) || !Array.isArray(capture.problems)) return null;
    const imageIndex = capture.imageIndex;
    const imageCount = capture.imageCount;
    const tokensUsed = capture.tokensUsed;
    if (
      !isPositiveInteger(imageIndex)
      || !isPositiveInteger(imageCount)
      || typeof capture.imageName !== "string"
      || typeof capture.ocrText !== "string"
      || typeof capture.qwenModel !== "string"
      || typeof capture.deepseekModel !== "string"
      || typeof tokensUsed !== "number"
      || !Number.isFinite(tokensUsed)
      || tokensUsed < 0
    ) return null;
    const warning = optionalText(capture.warning);
    captures.push({
      imageIndex,
      imageCount,
      imageName: capture.imageName,
      ocrText: capture.ocrText,
      problems: capture.problems as Partial<Problem>[],
      ...(warning ? { warning } : {}),
      qwenModel: capture.qwenModel,
      deepseekModel: capture.deepseekModel,
      tokensUsed,
    });
  }

  if (totalImages !== captures.length || completedImages !== captures.length || failedImages !== 0) {
    return null;
  }
  if (captures.some((capture, index) => capture.imageIndex !== index + 1 || capture.imageCount !== totalImages)) {
    return null;
  }
  if (value.extractedProblems.length !== captures.reduce((sum, capture) => sum + capture.problems.length, 0)) {
    return null;
  }

  return {
    resultVersion: 1,
    totalImages,
    completedImages,
    failedImages,
    extractedProblems: value.extractedProblems as Partial<Problem>[],
    imageProgress: value.imageProgress as ProblemOcrJobResult["imageProgress"],
    warnings: value.warnings.filter((item): item is string => typeof item === "string"),
    captures,
  };
}
