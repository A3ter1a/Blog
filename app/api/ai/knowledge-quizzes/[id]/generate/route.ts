import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { getAiRequestContext } from "@/lib/server-ai-auth";
import { resolveAIKey } from "@/lib/server-admin-auth";
import { AiKnowledgeQuizError, createAiKnowledgeQuiz } from "@/lib/server-ai-knowledge-quiz";

export const runtime = "nodejs";
export const maxDuration = 90;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new AiKnowledgeQuizError("AI 没有返回可解析的快测 JSON。", 422);
    return JSON.parse(match[0]);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id: proposalId } = await params;
  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const { data: proposal, error } = await auth.context.supabase
      .from("ai_content_proposals")
      .select("id, title, content, owner_user_id, ai_profile_id")
      .eq("id", proposalId)
      .eq("owner_user_id", auth.context.user.id)
      .eq("ai_profile_id", auth.context.profile.id)
      .maybeSingle();
    if (error) throw error;
    if (!proposal) return NextResponse.json({ error: "讲义提案不存在或不属于当前 AI 账号", success: false }, { status: 404 });

    const apiKey = resolveAIKey("deepseek", body.apiKey);
    if (!apiKey) return NextResponse.json({ error: "DeepSeek API key 未配置", success: false }, { status: 400 });
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_DEEPSEEK_MODEL;
    const source = proposal.content.slice(0, 120_000);
    const systemPrompt = `你是学习博客的知识点快测生成器。根据给出的讲义 Markdown 生成可审核的自测题，不修改正文。
只返回 JSON 对象：{"title":"...","items":[{"itemType":"single_choice|multiple_choice|true_false|short_answer","question":"...","options":[{"label":"A","text":"..."}],"answer":"A"或["A"]或true/false,"explanation":"...","knowledgePoints":["..."],"difficulty":"easy|medium|hard","sourceHeading":"..."}]}
规则：
- 只使用讲义中明确出现的知识，不补造来源。
- 每题必须有可判定答案、简明解析和至少一个知识点。
- 优先覆盖核心定义、因果关系、公式条件和常见易错点；题目数量 5 到 12 题。
- 选择题答案必须是选项 label；简答题答案应能用短文本判定。
- 不要把答案或解析写进 question；不要生成 Markdown 正文。`;
    const userPrompt = `讲义标题：${proposal.title}\n\n讲义 Markdown：\n${source}`;
    const result = await callDeepSeek(
      apiKey,
      model,
      [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      { temperature: 0.2, maxTokens: 5200, responseFormat: "json_object" },
    );
    const payload = parseJsonObject(result.content);
    const created = await createAiKnowledgeQuiz(auth.context.supabase, {
      userId: auth.context.user.id,
      profile: auth.context.profile,
      proposalId,
      title: isRecord(payload) ? payload.title : undefined,
      items: isRecord(payload) ? payload.items : payload,
    });
    return NextResponse.json({ success: true, quiz: created.quiz, items: created.items, tokensUsed: result.tokensUsed });
  } catch (error: unknown) {
    const status = error instanceof AiKnowledgeQuizError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测生成失败", success: false }, { status });
  }
}
