import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { parseAIJson } from "@/lib/ai-json";
import { REVIEW_CHUNK_CHAR_LIMIT } from "@/lib/document-markdown-review";
import { normalizeMarkdownImageBlocks } from "@/lib/markdown-format";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";

const MAX_MARKDOWN_CHARS = REVIEW_CHUNK_CHAR_LIMIT + 2000;
const MIN_REVIEW_LENGTH_RATIO = 0.65;

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
    throw new Error("AI 返回内容丢失了图片链接，已中止替换，请重试。");
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeReviewedMarkdown(markdown: string) {
  return normalizeMarkdownImageBlocks(markdown)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

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

function getPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return undefined;
  return value;
}

function buildUserPrompt(markdown: string, chunkIndex?: number, chunkCount?: number) {
  const chunkNotice = chunkIndex && chunkCount && chunkCount > 1
    ? `\n\n这是完整讲义的第 ${chunkIndex}/${chunkCount} 段。只审查本段，不要补写其它段，也不要添加分段说明。`
    : "";

  return `请审查下面这篇讲义 OCR Markdown，只修复公式和标题层级问题。必须返回完整 Markdown，保持原文内容顺序和图片链接完全不变。${chunkNotice}\n\n---BEGIN MARKDOWN---\n${markdown}\n---END MARKDOWN---`;
}

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const markdown = typeof body.markdown === "string" ? body.markdown : "";
    const clientApiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
    const model = typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : DEFAULT_DEEPSEEK_MODEL;
    const chunkIndex = getPositiveInteger(body.chunkIndex);
    const chunkCount = getPositiveInteger(body.chunkCount);

    if (!markdown.trim()) {
      return NextResponse.json({ error: "正文为空，没有可审查的 Markdown。", success: false }, { status: 400 });
    }

    const sourceMarkdown = normalizeReviewedMarkdown(markdown);
    if (sourceMarkdown.length > MAX_MARKDOWN_CHARS) {
      return NextResponse.json(
        { error: `当前单段正文过长（${sourceMarkdown.length.toLocaleString()} 字符），系统已启用自动分段；如果仍看到此提示，说明某个段落本身过长。`, success: false },
        { status: 413 },
      );
    }

    const apiKey = resolveAIKey("deepseek", clientApiKey);
    if (!apiKey) {
      return NextResponse.json({ error: "缺少 DeepSeek API Key，请先在 AI 设置里配置并测试。", success: false }, { status: 400 });
    }

    const result = await callDeepSeek(
      apiKey,
      model,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(sourceMarkdown, chunkIndex, chunkCount) },
      ],
      { temperature: 0, maxTokens: 16000, responseFormat: "json_object" },
    );

    const parsed = parseAIJson(result.content);
    if (!isRecord(parsed) || typeof parsed.markdown !== "string") {
      throw new Error("DeepSeek 没有返回有效的 markdown 字段。");
    }

    const reviewedMarkdown = normalizeReviewedMarkdown(parsed.markdown);
    if (!reviewedMarkdown) {
      throw new Error("DeepSeek 返回了空内容，已中止替换。");
    }

    if (sourceMarkdown.length > 1000 && reviewedMarkdown.length < sourceMarkdown.length * MIN_REVIEW_LENGTH_RATIO) {
      throw new Error("DeepSeek 返回内容明显变短，可能发生误删，已中止替换。");
    }

    assertImageUrlsPreserved(sourceMarkdown, reviewedMarkdown);

    return NextResponse.json({
      success: true,
      markdown: reviewedMarkdown,
      summary: typeof parsed.summary === "string" ? parsed.summary : "已修复公式和标题层级。",
      tokensUsed: result.tokensUsed,
      model,
      chunkIndex,
      chunkCount,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, "Markdown 审查失败");
    console.error("[Document Markdown Review] Error:", message);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
