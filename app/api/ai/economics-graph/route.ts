import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import {
  buildEconomicsGraphMarkdown,
  economicsGraphTemplateSummaries,
  normalizeEconomicsGraphAIDraft,
} from "@/lib/economics-graph-ai";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";

export const runtime = "nodejs";
export const maxDuration = 90;

function getPrompt(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 1200);
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 没有返回 JSON 对象");
    return JSON.parse(match[0]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const body: unknown = await req.json().catch(() => ({}));
    const record = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};

    const prompt = getPrompt(record.prompt);
    if (!prompt) {
      return NextResponse.json({ error: "请输入曲线需求", success: false }, { status: 400 });
    }

    const apiKey = resolveAIKey("deepseek", record.apiKey);
    const model = typeof record.model === "string" && record.model.trim()
      ? record.model.trim()
      : DEFAULT_DEEPSEEK_MODEL;

    if (!apiKey) {
      return NextResponse.json({ error: "DeepSeek API key 未配置", success: false }, { status: 400 });
    }

    const systemPrompt = `你是微观经济学图像结构化助手。你只为博客的 econgraph 交互图选择模板，不生成 SVG、HTML、React 代码。

可用模板和元素：
${JSON.stringify(economicsGraphTemplateSummaries, null, 2)}

必须只返回 JSON 对象，格式：
{
  "template": "demand-supply | monopoly-mr-mc | cost-curves",
  "title": "不超过 30 个汉字的图名",
  "focus": ["元素 id"],
  "rationale": "为什么选择这个模板，1 到 2 句话",
  "reviewNotes": ["用户插入前应检查的点"]
}

规则：
- template 必须来自可用模板 id。
- focus 只能使用该模板下存在的元素 id，最多 6 个。
- 如果需求涉及供给、需求、均衡、税收、补贴或比较静态，优先 demand-supply。
- 如果需求涉及垄断、MR、MC、AR、利润最大化或价格歧视基础图，优先 monopoly-mr-mc。
- 如果需求涉及 MC、AC、AVC、AFC、停产点或短期成本，优先 cost-curves。
- 不确定时选择最接近的模板，并在 reviewNotes 里提醒用户审查。`;

    const userPrompt = `曲线需求：${prompt}`;

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.18, maxTokens: 1100, responseFormat: "json_object" },
    );

    const normalized = normalizeEconomicsGraphAIDraft(parseJsonObject(content));
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.message, success: false }, { status: 422 });
    }

    return NextResponse.json({
      draft: normalized.draft,
      markdown: buildEconomicsGraphMarkdown(normalized.draft.spec),
      tokensUsed,
      success: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "曲线生成失败";
    console.error("[EconomicsGraphAI] Error:", message);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
