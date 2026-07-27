import { getNextSourceVersionNo, shouldCreateSourceVersion, type SourceVersionContractRecord } from "./source-version-contract.ts";

export type RagSourceSyncPlan = {
  sourceDocumentId: string;
  action: "unchanged" | "create_version";
  nextVersionNo?: number;
  checksum: string;
  chunkCount: number;
};

export const RAG_TOKEN_HASH_DIMENSIONS = 256;

function tokenizeForHashedVector(value: string): string[] {
  const lower = value.normalize("NFKC").toLowerCase();
  const words = lower.match(/[a-z0-9_]{2,}/g) ?? [];
  const chinese = lower.match(/[\u4e00-\u9fff]/g) ?? [];
  const bigrams: string[] = [];
  for (let index = 0; index < chinese.length - 1; index += 1) {
    bigrams.push(`${chinese[index]}${chinese[index + 1]}`);
  }
  return [...words, ...bigrams];
}

function fnv1a(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function buildTokenHashVector(
  value: string,
  dimensions = RAG_TOKEN_HASH_DIMENSIONS,
): number[] {
  if (!Number.isInteger(dimensions) || dimensions < 32 || dimensions > 2048) {
    throw new Error("RAG token-hash 向量维度无效");
  }
  const vector = Array.from({ length: dimensions }, () => 0);
  const frequencies = new Map<string, number>();
  for (const token of tokenizeForHashedVector(value)) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  for (const [token, count] of frequencies) {
    const indexHash = fnv1a(token, 0x811c9dc5);
    const signHash = fnv1a(token, 0x9e3779b9);
    const weight = 1 + Math.log(count);
    vector[indexHash % dimensions] += (signHash & 1) === 0 ? weight : -weight;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
  if (magnitude === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((item) => Number((item / magnitude).toFixed(8)));
}

export function toPgVectorLiteral(vector: number[]): string {
  if (vector.length !== RAG_TOKEN_HASH_DIMENSIONS || vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`RAG 查询向量必须是 ${RAG_TOKEN_HASH_DIMENSIONS} 维有限数值`);
  }
  return `[${vector.join(",")}]`;
}

export function splitRagSourceText(text: string, maxChars = 900, overlapChars = 140): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (maxChars < 200 || overlapChars < 0 || overlapChars >= maxChars) throw new Error("RAG 分块参数无效");
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    chunks.push(clean.slice(cursor, cursor + maxChars));
    if (cursor + maxChars >= clean.length) break;
    cursor += maxChars - overlapChars;
  }
  return chunks;
}

export function planRagSourceSync(
  sourceDocumentId: string,
  versions: SourceVersionContractRecord[],
  currentVersion: SourceVersionContractRecord | null,
  checksum: string,
  text: string,
): RagSourceSyncPlan {
  const chunks = splitRagSourceText(text);
  if (!shouldCreateSourceVersion(currentVersion, checksum)) {
    return { sourceDocumentId, action: "unchanged", checksum, chunkCount: chunks.length };
  }
  return {
    sourceDocumentId,
    action: "create_version",
    nextVersionNo: getNextSourceVersionNo(sourceDocumentId, versions),
    checksum,
    chunkCount: chunks.length,
  };
}
