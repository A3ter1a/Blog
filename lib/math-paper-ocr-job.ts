export type MathPaperOcrSourceAsset = {
  path: string;
  pageId: string;
  name: string;
  sourceFingerprint: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type MathPaperOcrCapture = {
  pageIndex: number;
  pageCount: number;
  pageId: string;
  fileName: string;
  sourceFingerprint: string;
  text: string;
  model: string;
};

export type MathPaperOcrJobResult = {
  resultVersion: 1;
  totalPages: number;
  pages: MathPaperOcrCapture[];
};

export function isOwnedMathPaperOcrAssetPath(path: string, userId: string): boolean {
  const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^math-paper-ocr/${escapedUserId}/[0-9a-f-]{36}/\\d{2}\\.(?:jpg|png|webp)$`, "i").test(path);
}

export function buildMathPaperOcrJobResult(captures: MathPaperOcrCapture[]): MathPaperOcrJobResult {
  const ordered = [...captures].sort((left, right) => left.pageIndex - right.pageIndex);
  if (ordered.length === 0) throw new Error("数学答题纸 OCR 没有可恢复的页面结果");
  const expectedCount = ordered[0].pageCount;
  if (expectedCount !== ordered.length) throw new Error("数学答题纸 OCR 页面结果不完整");
  const pageIds = new Set<string>();
  for (let index = 0; index < ordered.length; index += 1) {
    const capture = ordered[index];
    if (
      capture.pageIndex !== index + 1
      || capture.pageCount !== expectedCount
      || !capture.pageId
      || pageIds.has(capture.pageId)
      || !capture.fileName
      || !capture.sourceFingerprint
      || !capture.text.trim()
      || !capture.model
    ) throw new Error(`数学答题纸 OCR 第 ${index + 1} 页结果不完整`);
    pageIds.add(capture.pageId);
  }
  return { resultVersion: 1, totalPages: ordered.length, pages: ordered };
}
