export interface SourceDocumentContractRecord {
  id: string;
  currentVersionId: string | null;
}

export interface SourceVersionContractRecord {
  id: string;
  sourceDocumentId: string;
  versionNo: number;
  checksum: string;
}

export interface RagChunkContractRecord {
  id: string;
  sourceVersionId: string;
}

export function selectCurrentSourceVersion(
  document: SourceDocumentContractRecord,
  versions: SourceVersionContractRecord[],
): SourceVersionContractRecord | null {
  if (!document.currentVersionId) return null;

  return versions.find((version) => (
    version.id === document.currentVersionId && version.sourceDocumentId === document.id
  )) ?? null;
}

export function shouldCreateSourceVersion(
  currentVersion: SourceVersionContractRecord | null,
  nextChecksum: string,
): boolean {
  if (!nextChecksum.trim()) throw new Error("source version checksum 不能为空。");
  return currentVersion?.checksum !== nextChecksum;
}

export function isChunkEligibleForCurrentSearch(
  chunk: RagChunkContractRecord,
  document: SourceDocumentContractRecord,
): boolean {
  return document.currentVersionId !== null && chunk.sourceVersionId === document.currentVersionId;
}

export function getNextSourceVersionNo(
  sourceDocumentId: string,
  versions: SourceVersionContractRecord[],
): number {
  const versionNumbers = versions
    .filter((version) => version.sourceDocumentId === sourceDocumentId)
    .map((version) => version.versionNo);

  if (versionNumbers.some((versionNo) => !Number.isInteger(versionNo) || versionNo < 1)) {
    throw new Error("source version_no 必须是从 1 开始的正整数。");
  }
  if (new Set(versionNumbers).size !== versionNumbers.length) {
    throw new Error("同一 source document 内 version_no 不能重复。");
  }

  return versionNumbers.length === 0 ? 1 : Math.max(...versionNumbers) + 1;
}
