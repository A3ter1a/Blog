export const AI_REVIEW_MAX_QUOTED_TEXT = 2_000;

export type ReviewSelectionInput = {
  content: string;
  proposalContentVersion: number;
  currentContentVersion: number;
  selectionStart: number;
  selectionEnd: number;
  quotedText: string;
};

export type ReviewSelectionResult =
  | { ok: true; quotedText: string }
  | { ok: false; status: 400 | 409; message: string };

export function validateReviewSelection(input: ReviewSelectionInput): ReviewSelectionResult {
  if (input.proposalContentVersion !== input.currentContentVersion) {
    return { ok: false, status: 409, message: "内容已更新，请重新选择文字后再添加批注。" };
  }
  if (!Number.isInteger(input.selectionStart) || !Number.isInteger(input.selectionEnd)) {
    return { ok: false, status: 400, message: "选区偏移必须是整数。" };
  }
  if (input.selectionStart < 0 || input.selectionEnd < input.selectionStart || input.selectionEnd > input.content.length) {
    return { ok: false, status: 409, message: "选区已经超出当前正文，请重新选择文字。" };
  }
  const expectedQuote = input.content.slice(input.selectionStart, input.selectionEnd);
  if (expectedQuote !== input.quotedText) {
    return { ok: false, status: 409, message: "选中文字已变化，请重新选择后再保存批注。" };
  }
  if (input.quotedText.length > AI_REVIEW_MAX_QUOTED_TEXT) {
    return { ok: false, status: 400, message: `批注引用不能超过 ${AI_REVIEW_MAX_QUOTED_TEXT} 个字符。` };
  }
  return { ok: true, quotedText: expectedQuote };
}
