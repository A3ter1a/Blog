import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantMemoryCandidate } from "@/lib/assistant-memory";
import { normalizeAssistantMemories } from "@/lib/assistant-memory";
import type { Database } from "@/lib/database.types";

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => RpcResult };

function rpcClient(supabase: SupabaseClient<Database>): RpcClient {
  return supabase as unknown as RpcClient;
}

async function runRpc(
  supabase: SupabaseClient<Database>,
  name: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await rpcClient(supabase).rpc(name, args);
  if (error) throw error;
  return data;
}

function normalizeMemoryRow(value: unknown): AssistantMemoryCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("记忆返回无效");
  const row = value as Record<string, unknown>;
  const normalized = normalizeAssistantMemories([{
    id: row.id,
    content: row.content,
    reason: row.reason,
    sourcePath: row.sourcePath ?? row.source_path,
    status: row.status,
    createdAt: row.createdAt ?? row.created_at,
    decidedAt: row.decidedAt ?? row.decided_at ?? undefined,
  }]);
  if (normalized.length !== 1) throw new Error("记忆返回字段无效");
  return normalized[0];
}

export async function listAssistantMemories(
  supabase: SupabaseClient<Database>,
): Promise<AssistantMemoryCandidate[]> {
  const raw = await runRpc(supabase, "list_assistant_memories");
  return normalizeAssistantMemories(raw);
}

export async function proposeAssistantMemory(
  supabase: SupabaseClient<Database>,
  input: { commandId: string; content: string; reason: string; sourcePath: string },
): Promise<AssistantMemoryCandidate> {
  return normalizeMemoryRow(await runRpc(supabase, "propose_assistant_memory", {
    p_command_id: input.commandId,
    p_content: input.content,
    p_reason: input.reason,
    p_source_path: input.sourcePath,
  }));
}

export async function decideAssistantMemoryServer(
  supabase: SupabaseClient<Database>,
  input: { candidateId: string; decision: "accepted" | "rejected" },
): Promise<AssistantMemoryCandidate> {
  return normalizeMemoryRow(await runRpc(supabase, "decide_assistant_memory", {
    p_candidate_id: input.candidateId,
    p_decision: input.decision,
  }));
}
