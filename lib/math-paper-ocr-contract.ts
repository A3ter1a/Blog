export type MathPaperOcrRevision = {
  id: string;
  revisionNo: number;
  sourceFingerprint: string;
  rawText: string;
  confirmedText?: string;
  createdAt: string;
  confirmedAt?: string;
};

export type MathPaperGradeRevision = {
  id: string;
  gradeSeq: number;
  ocrRevisionId: string;
  origin: "ai_suggested" | "user_final";
  score: number;
  maxScore: number;
  feedback: string;
  createdAt: string;
};

export type MathPaperOcrPage = {
  id: string;
  fileName: string;
  ocrRevisions: MathPaperOcrRevision[];
  gradeRevisions: MathPaperGradeRevision[];
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function appendMathPaperOcrRevision(
  page: MathPaperOcrPage,
  input: { sourceFingerprint: string; rawText: string; now: string },
): MathPaperOcrPage {
  if (!input.sourceFingerprint.trim() || !input.rawText.trim()) throw new Error("OCR 原图指纹和识别文本不能为空");
  const revisionNo = page.ocrRevisions.reduce((max, item) => Math.max(max, item.revisionNo), 0) + 1;
  return {
    ...page,
    ocrRevisions: [...page.ocrRevisions, {
      id: createId("math-ocr"),
      revisionNo,
      sourceFingerprint: input.sourceFingerprint,
      rawText: input.rawText.trim(),
      createdAt: input.now,
    }],
  };
}

export function confirmMathPaperOcrRevision(
  page: MathPaperOcrPage,
  revisionId: string,
  confirmedText: string,
  now: string,
): MathPaperOcrPage {
  if (!confirmedText.trim()) throw new Error("确认文本不能为空");
  const latest = page.ocrRevisions.at(-1);
  if (!latest || latest.id !== revisionId) throw new Error("只能确认最新 OCR 版本");
  return {
    ...page,
    ocrRevisions: page.ocrRevisions.map((revision) => revision.id === revisionId ? {
      ...revision,
      confirmedText: confirmedText.trim(),
      confirmedAt: now,
    } : revision),
  };
}

export function canGradeMathPaperOcrPage(page: MathPaperOcrPage): boolean {
  const latest = page.ocrRevisions.at(-1);
  return Boolean(latest?.confirmedAt && latest.confirmedText?.trim());
}

export function appendMathPaperGradeRevision(
  page: MathPaperOcrPage,
  input: Omit<MathPaperGradeRevision, "id" | "gradeSeq" | "ocrRevisionId">,
): MathPaperOcrPage {
  const latestOcr = page.ocrRevisions.at(-1);
  if (!latestOcr || !canGradeMathPaperOcrPage(page)) throw new Error("OCR 文本确认前禁止评分");
  if (!Number.isFinite(input.score) || !Number.isFinite(input.maxScore) || input.maxScore <= 0 || input.score < 0 || input.score > input.maxScore) {
    throw new Error("评分数值超出有效范围");
  }
  if (input.origin === "user_final" && !page.gradeRevisions.some((grade) => (
    grade.ocrRevisionId === latestOcr.id && grade.origin === "ai_suggested"
  ))) {
    throw new Error("必须先生成 AI 建议，再由用户确认最终分");
  }
  const gradeSeq = page.gradeRevisions.reduce((max, item) => Math.max(max, item.gradeSeq), 0) + 1;
  return {
    ...page,
    gradeRevisions: [...page.gradeRevisions, {
      ...input,
      id: createId("math-grade"),
      gradeSeq,
      ocrRevisionId: latestOcr.id,
    }],
  };
}

export function getEffectiveMathPaperGrade(page: MathPaperOcrPage): MathPaperGradeRevision | undefined {
  const latestOcr = page.ocrRevisions.at(-1);
  if (!latestOcr?.confirmedAt) return undefined;
  return [...page.gradeRevisions].reverse().find((grade) => (
    grade.ocrRevisionId === latestOcr.id && grade.origin === "user_final"
  ));
}
