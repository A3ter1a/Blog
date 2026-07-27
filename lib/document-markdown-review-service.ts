import { callDeepSeek } from "./ai-client.ts";
import { parseAIJson } from "./ai-json.ts";
import { normalizeMarkdownForWrite } from "./content-contract.ts";
import { REVIEW_CHUNK_CHAR_LIMIT } from "./document-markdown-review.ts";

export const DOCUMENT_MARKDOWN_REVIEW_MAX_CHARS = REVIEW_CHUNK_CHAR_LIMIT + 2000;

const MIN_REVIEW_LENGTH_RATIO = 0.65;

const SYSTEM_PROMPT = `你是一个极其克制的 Markdown OCR 校对助手。

你的任务只允许做两类修改：
1. 修复 Markdown 数学公式：补全或规范 $...$、$$...$$、LaTeX 反斜杠、上下标、分式、求和、希腊字母等明显 OCR 格式问题。
2. 修复标题层级：把章节编号对应到合理的 Markdown 标题，例如 2.1 通常是二级标题，2.1.1 通常是三级标题；修复类似 "2. 1.1" 的编号空格错误，并保证标题前后有空行。

严禁做这些事：
- 不要改写正文表达，不要润色、总结、翻译、扩写或删减段落。
- 不要改变任何事实、数字、专有名词、链接、图片 URL、表格内容、代码块内容。
- 不要把普通段落强行改成标题；只处理明显有章节编号或明显标题语义的行。
- 不要处理题目抽取、答案生成、题型分析。

返回 JSON，格式必须是：
{"markdown":"修复后的完整 Markdown","summary":"一句话说明修了什么"}

除 JSON 外不要输出任何其它文字。`;

type DeepSeekCaller = typeof callDeepSeek;

export type DocumentMarkdownReviewResponse = {
  success: true;
  markdown: string;
  summary: string;
  tokensUsed: number;
  model: string;
  chunkIndex?: number;
  chunkCount?: number;
};

type ReviewDocumentMarkdownInput = {
  apiKey: string;
  model: string;
  markdown: string;
  chunkIndex?: number;
  chunkCount?: number;
};

export class DocumentMarkdownReviewError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "DocumentMarkdownReviewError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractMarkdownImageUrls(markdown: string): string[] {
  const urls = Array.from(markdown.matchAll(/!\[[^\]\n]*\]\(((?:\\.|[^)\n])+)\)/g), (match) => {
    return match[1]
      .replace(/\s+"[^"\n]*"$/g, "")
      .replace(/\\([()])/g, "$1")
      .trim();
  });

  return Array.from(new Set(urls.filter(Boolean)));
}

function assertImageUrlsPreserved(source: string, reviewed: string) {
  const missingUrls = extractMarkdownImageUrls(source)
    .filter((url) => !reviewed.includes(url));

  if (missingUrls.length > 0) {
    throw new DocumentMarkdownReviewError("AI 返回内容丢失了图片链接，已中止替换，请重试。");
  }
}

function normalizeReviewedMarkdown(markdown: string) {
  return normalizeMarkdownForWrite(markdown, "ai")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function buildUserPrompt(markdown: string, chunkIndex?: number, chunkCount?: number) {
  const chunkNotice = chunkIndex && chunkCount && chunkCount > 1
    ? `\n\n这是完整讲义的第 ${chunkIndex}/${chunkCount} 段。只审查本段，不要补写其它段，也不要添加分段说明。`
    : "";

  return `请审查下面这篇讲义 OCR Markdown，只修复公式和标题层级问题。必须返回完整 Markdown，保持原文内容顺序和图片链接完全不变。${chunkNotice}\n\n---BEGIN MARKDOWN---\n${markdown}\n---END MARKDOWN---`;
}

export function prepareDocumentMarkdownReviewSource(markdown: string): string {
  if (!markdown.trim()) {
    throw new DocumentMarkdownReviewError("正文为空，没有可审查的 Markdown。", 400);
  }

  const sourceMarkdown = normalizeReviewedMarkdown(markdown);
  if (sourceMarkdown.length > DOCUMENT_MARKDOWN_REVIEW_MAX_CHARS) {
    throw new DocumentMarkdownReviewError(
      `当前单段正文过长（${sourceMarkdown.length.toLocaleString()} 字符），系统已启用自动分段；如果仍看到此提示，说明某个段落本身过长。`,
      413,
    );
  }

  return sourceMarkdown;
}

export async function reviewDocumentMarkdown(
  input: ReviewDocumentMarkdownInput,
  callModel: DeepSeekCaller = callDeepSeek,
): Promise<DocumentMarkdownReviewResponse> {
  const sourceMarkdown = prepareDocumentMarkdownReviewSource(input.markdown);
  const result = await callModel(
    input.apiKey,
    input.model,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(sourceMarkdown, input.chunkIndex, input.chunkCount) },
    ],
    { temperature: 0, maxTokens: 16000, responseFormat: "json_object" },
  );

  const parsed = parseAIJson(result.content);
  if (!isRecord(parsed) || typeof parsed.markdown !== "string") {
    throw new DocumentMarkdownReviewError("DeepSeek 没有返回有效的 markdown 字段。");
  }

  const reviewedMarkdown = normalizeReviewedMarkdown(parsed.markdown);
  if (!reviewedMarkdown) {
    throw new DocumentMarkdownReviewError("DeepSeek 返回了空内容，已中止替换。");
  }

  if (
    sourceMarkdown.length > 1000
    && reviewedMarkdown.length < sourceMarkdown.length * MIN_REVIEW_LENGTH_RATIO
  ) {
    throw new DocumentMarkdownReviewError("DeepSeek 返回内容明显变短，可能发生误删，已中止替换。");
  }

  assertImageUrlsPreserved(sourceMarkdown, reviewedMarkdown);

  return {
    success: true,
    markdown: reviewedMarkdown,
    summary: typeof parsed.summary === "string" ? parsed.summary : "已修复公式和标题层级。",
    tokensUsed: result.tokensUsed,
    model: input.model,
    chunkIndex: input.chunkIndex,
    chunkCount: input.chunkCount,
  };
}
