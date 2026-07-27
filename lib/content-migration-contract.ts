export type ContentMigrationSnapshot = {
  noteId: string;
  fieldPath: string;
  batchId: string;
  ruleVersion: string;
  beforeText: string;
  afterText: string;
  beforeChecksum: string;
  afterChecksum: string;
  aiInvolved: boolean;
  requiresReview: boolean;
  status: "planned" | "applied" | "rolled_back";
};

export function canApplyContentMigration(
  snapshot: ContentMigrationSnapshot,
  currentChecksum: string,
): { ok: boolean; reason?: "already_applied" | "source_changed" | "requires_review" } {
  if (snapshot.status !== "planned") return { ok: false, reason: "already_applied" };
  if (snapshot.requiresReview) return { ok: false, reason: "requires_review" };
  if (snapshot.beforeChecksum !== currentChecksum) return { ok: false, reason: "source_changed" };
  return { ok: true };
}

export function rollbackContentMigration(
  snapshot: ContentMigrationSnapshot,
  currentChecksum: string,
): { restoredText: string; nextStatus: "rolled_back" } {
  if (snapshot.status !== "applied") {
    throw new Error("只有已应用的迁移快照可以回退");
  }
  if (snapshot.afterChecksum !== currentChecksum) {
    throw new Error("当前正文已发生变化，拒绝覆盖并回退");
  }

  return { restoredText: snapshot.beforeText, nextStatus: "rolled_back" };
}

export function assertMigrationBatchRollbackSafe(
  snapshots: ContentMigrationSnapshot[],
  currentChecksums: ReadonlyMap<string, string>,
): void {
  for (const snapshot of snapshots) {
    const key = `${snapshot.noteId}:${snapshot.fieldPath}`;
    if (snapshot.status !== "applied" || currentChecksums.get(key) !== snapshot.afterChecksum) {
      throw new Error(`迁移批次中的 ${key} 不满足安全回退条件`);
    }
  }
}
