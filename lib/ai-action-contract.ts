export type PendingActionStatus = "proposed" | "consumed" | "rejected";

export interface PendingActionContractRecord {
  id: string;
  status: PendingActionStatus;
  expiresAt: string;
  expectedTargetVersion: number;
  expectedTargetChecksum: string;
}

export type PendingActionValidation =
  | { ok: true }
  | { ok: false; reason: "already_consumed" | "rejected" | "expired" | "version_changed" | "checksum_changed" };

export function validatePendingAction(
  action: PendingActionContractRecord,
  now: Date,
  targetVersion: number,
  targetChecksum: string,
): PendingActionValidation {
  if (action.status === "consumed") return { ok: false, reason: "already_consumed" };
  if (action.status === "rejected") return { ok: false, reason: "rejected" };
  if (Date.parse(action.expiresAt) <= now.getTime()) return { ok: false, reason: "expired" };
  if (action.expectedTargetVersion !== targetVersion) return { ok: false, reason: "version_changed" };
  if (action.expectedTargetChecksum !== targetChecksum) return { ok: false, reason: "checksum_changed" };
  return { ok: true };
}
