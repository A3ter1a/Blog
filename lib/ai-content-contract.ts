import { normalizeMarkdownSource, type MarkdownRisk } from "./content-contract.ts";

export const AI_CONTENT_SELF_CHECK_VERSION = "ai-content-self-check-v1";
export const AI_CONTENT_MAX_CHARS = 240_000;
export const AI_CONTENT_MAX_TITLE_CHARS = 200;
export const AI_CONTENT_MAX_TAGS = 40;
export const AI_CONTENT_MAX_TAG_CHARS = 80;
export const AI_REVIEW_QUEUE_CHANGED_EVENT = "asteroid:review-queue-changed";

export type AiContentReviewStatus =
  | "draft"
  | "self_checked"
  | "pending_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "rejected";

export type AiSelfCheckIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

export type AiSelfCheck = {
  version: typeof AI_CONTENT_SELF_CHECK_VERSION;
  passed: boolean;
  checkedAt?: string;
  characterCount: number;
  headingCount: number;
  checks: {
    markdown: boolean;
    layout: boolean;
    headings: boolean;
  };
  issues: AiSelfCheckIssue[];
};

export type AiContentSelfCheckResult = {
  content: string;
  selfCheck: AiSelfCheck;
};

type MarkdownHeading = {
  level: number;
  text: string;
  line: number;
};

function getHeadings(markdown: string): MarkdownHeading[] {
  return markdown.split("\n").flatMap((line, index) => {
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) return [];
    return [{ level: match[1].length, text: match[2].trim(), line: index + 1 }];
  });
}

function getFenceMarkerCount(markdown: string): number {
  const withoutInlineCode = markdown.replace(/`[^`\n]*`/g, "");
  return (withoutInlineCode.match(/^\s{0,3}(```|~~~)/gm) ?? []).length;
}

function getMarkdownLayoutIssues(markdown: string): AiSelfCheckIssue[] {
  const issues: AiSelfCheckIssue[] = [];
  const lines = markdown.split("\n");

  if (getFenceMarkerCount(markdown) % 2 !== 0) {
    issues.push({
      code: "unbalanced_code_fence",
      severity: "error",
      message: "代码块围栏没有闭合。",
    });
  }

  if (/!\[[^\]\n]*\]\(\s*\)/.test(markdown)) {
    issues.push({
      code: "empty_image_url",
      severity: "error",
      message: "存在没有链接地址的图片标记。",
    });
  }

  lines.forEach((line, index) => {
    if (/^\s{0,3}#{1,6}\s*$/.test(line)) {
      issues.push({
        code: "empty_heading",
        severity: "error",
        message: `第 ${index + 1} 行标题没有文字。`,
      });
    }
  });

  return issues;
}

function getHeadingIssues(headings: MarkdownHeading[], characterCount: number): AiSelfCheckIssue[] {
  const issues: AiSelfCheckIssue[] = [];
  const h1Count = headings.filter((heading) => heading.level === 1).length;
  if (h1Count > 1) {
    issues.push({
      code: "multiple_h1",
      severity: "error",
      message: "正文包含多个 H1 标题，请保留一个最上层标题。",
    });
  }

  for (let index = 1; index < headings.length; index += 1) {
    const previous = headings[index - 1];
    const current = headings[index];
    if (current.level > previous.level + 1) {
      issues.push({
        code: "heading_level_jump",
        severity: "error",
        message: `第 ${current.line} 行从 H${previous.level} 跳到 H${current.level}，缺少中间层级。`,
      });
    }
  }

  if (headings.length === 0) {
    issues.push({
      code: "missing_heading",
      severity: characterCount > 1200 ? "error" : "warning",
      message: characterCount > 1200
        ? "长篇正文没有分级标题，不能提交审核。"
        : "正文没有分级标题；短笔记可以接受，长讲义需要补充标题层级。",
    });
  }

  return issues;
}

function mapMarkdownRisk(risk: MarkdownRisk): AiSelfCheckIssue {
  return {
    code: risk.code,
    severity: risk.severity === "high" ? "error" : "warning",
    message: risk.message,
  };
}

export function normalizeAiContentTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, AI_CONTENT_MAX_TAGS)
    .map((tag) => tag.slice(0, AI_CONTENT_MAX_TAG_CHARS))));
}

export function runAiContentSelfCheck(source: string): AiContentSelfCheckResult {
  const normalizedSource = source.replace(/\r\n?/g, "\n").trim();
  const normalizedResult = normalizeMarkdownSource(normalizedSource, "ai");
  const content = normalizedResult.normalized.trim();
  const headings = getHeadings(content);
  const issues = [
    ...normalizedResult.risks.map(mapMarkdownRisk),
    ...getMarkdownLayoutIssues(content),
    ...getHeadingIssues(headings, content.length),
  ];
  const hasErrors = issues.some((issue) => issue.severity === "error");

  return {
    content,
    selfCheck: {
      version: AI_CONTENT_SELF_CHECK_VERSION,
      passed: Boolean(content) && !hasErrors,
      characterCount: content.length,
      headingCount: headings.length,
      checks: {
        markdown: normalizedResult.risks.every((risk) => risk.severity !== "high"),
        layout: getMarkdownLayoutIssues(content).every((issue) => issue.severity !== "error"),
        headings: getHeadingIssues(headings, content.length).every((issue) => issue.severity !== "error"),
      },
      issues,
    },
  };
}

export function validateAiContentInput(title: string, content: string): string | null {
  if (!title.trim()) return "请输入文章标题。";
  if (title.trim().length > AI_CONTENT_MAX_TITLE_CHARS) {
    return `文章标题不能超过 ${AI_CONTENT_MAX_TITLE_CHARS} 个字符。`;
  }
  if (!content.trim()) return "Markdown 正文不能为空。";
  if (content.length > AI_CONTENT_MAX_CHARS) {
    return `单篇 Markdown 不能超过 ${AI_CONTENT_MAX_CHARS.toLocaleString()} 个字符，请按章节拆分。`;
  }
  return null;
}
