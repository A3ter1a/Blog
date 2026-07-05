import {
  economicsGraphTemplates,
  getEconomicsGraphTemplate,
  type EconomicsGraphSpec,
  type EconomicsGraphTemplateId,
} from "@/lib/economics-graphs";

export interface EconomicsGraphAIDraft {
  spec: EconomicsGraphSpec;
  rationale: string;
  reviewNotes: string[];
}

export type EconomicsGraphAIDraftResult =
  | { ok: true; draft: EconomicsGraphAIDraft }
  | { ok: false; message: string };

export const economicsGraphTemplateSummaries = economicsGraphTemplates.map((template) => ({
  id: template.id,
  title: template.title,
  elements: template.elements.map((element) => ({
    id: element.id,
    kind: element.kind,
    label: element.label,
  })),
}));

const templateIds = new Set(economicsGraphTemplates.map((template) => template.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeTemplateId(value: unknown): EconomicsGraphTemplateId | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return templateIds.has(trimmed as EconomicsGraphTemplateId)
    ? trimmed as EconomicsGraphTemplateId
    : null;
}

function normalizeTitle(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const title = value.replace(/\s+/g, " ").trim();
  return title ? title.slice(0, 90) : fallback;
}

function normalizeFocus(value: unknown, templateId: EconomicsGraphTemplateId): string[] {
  const template = getEconomicsGraphTemplate(templateId);
  if (!template) return [];

  const allowedIds = new Set(template.elements.map((element) => element.id));
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const normalized: string[] = [];

  rawValues.forEach((item) => {
    if (typeof item !== "string") return;
    const id = item.trim();
    if (!allowedIds.has(id) || normalized.includes(id)) return;
    normalized.push(id);
  });

  return normalized.slice(0, 6);
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .map((item) => typeof item === "string" ? item.replace(/\s+/g, " ").trim() : "")
    .filter(Boolean)
    .map((item) => item.slice(0, 140))
    .slice(0, 5);

  return normalized.length > 0 ? normalized : fallback;
}

export function normalizeEconomicsGraphAIDraft(value: unknown): EconomicsGraphAIDraftResult {
  if (!isRecord(value)) {
    return { ok: false, message: "AI 返回的内容不是结构化对象。" };
  }

  const template = normalizeTemplateId(value.template);
  if (!template) {
    return { ok: false, message: "AI 返回了不支持的图像模板。" };
  }

  const templateDefinition = getEconomicsGraphTemplate(template);
  if (!templateDefinition) {
    return { ok: false, message: "找不到对应的图像模板。" };
  }

  const spec: EconomicsGraphSpec = {
    template,
    title: normalizeTitle(value.title, templateDefinition.title),
    focus: normalizeFocus(value.focus ?? value.highlight ?? value.highlights, template),
  };

  const rationale = typeof value.rationale === "string" && value.rationale.trim()
    ? value.rationale.replace(/\s+/g, " ").trim().slice(0, 500)
    : `已选择「${templateDefinition.title}」模板。`;

  return {
    ok: true,
    draft: {
      spec,
      rationale,
      reviewNotes: normalizeStringList(value.reviewNotes, [
        "检查标题是否贴合这段笔记。",
        "检查高亮曲线是否覆盖你想说明的核心关系。",
      ]),
    },
  };
}

export function buildEconomicsGraphMarkdown(spec: EconomicsGraphSpec): string {
  const payload: Record<string, unknown> = {
    template: spec.template,
    title: spec.title,
  };

  if (spec.focus.length > 0) {
    payload.focus = spec.focus;
  }

  return `\n\n\`\`\`econgraph\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\n`;
}
