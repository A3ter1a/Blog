export const BOOKLET_SNAPSHOT_START = "<!-- asteroid-booklet-snapshot:start -->";
export const BOOKLET_SNAPSHOT_END = "<!-- asteroid-booklet-snapshot:end -->";
export const BOOKLET_REFLECTION_START = "<!-- asteroid-booklet-reflection:start -->";
export const BOOKLET_SOURCE_MANIFEST_PREFIX = "<!-- asteroid-booklet-source-manifest:";

export interface BookletProblemSnapshot {
  sourceNoteId?: string;
  sourceProblemId?: string;
  sourceContentVersion?: number;
  sourceChecksum?: string;
  sourceLabel: string;
  question: string;
  standardAnswer: string;
  explanation: string;
  methodSummary: string;
}

export interface BookletSourceManifestEntry {
  sourceNoteId: string;
  sourceProblemId: string;
  sourceContentVersion?: number;
  checksum: string;
}

export interface BookletSourceDrift {
  sourceNoteId: string;
  sourceProblemId: string;
  reason: "missing" | "changed";
}

export function calculateBookletSnapshotChecksum(snapshot: Pick<BookletProblemSnapshot, "question" | "standardAnswer" | "explanation" | "methodSummary">): string {
  const value = JSON.stringify([
    snapshot.question.trim(),
    snapshot.standardAnswer.trim(),
    snapshot.explanation.trim(),
    snapshot.methodSummary.trim(),
  ]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getBookletProblemChecksumInput(
  snapshot: Pick<BookletProblemSnapshot, "question" | "standardAnswer" | "explanation" | "methodSummary">,
): string {
  return [snapshot.question, snapshot.standardAnswer, snapshot.explanation, snapshot.methodSummary]
    .map((value) => value.trim())
    .join("\u001f");
}

export async function calculateBookletSha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

export async function calculateBookletProblemSha256(
  snapshot: Pick<BookletProblemSnapshot, "question" | "standardAnswer" | "explanation" | "methodSummary">,
): Promise<string> {
  return calculateBookletSha256(getBookletProblemChecksumInput(snapshot));
}

export function buildBookletSourceManifest(snapshots: BookletProblemSnapshot[]): BookletSourceManifestEntry[] {
  return snapshots.flatMap((snapshot): BookletSourceManifestEntry[] => (
    snapshot.sourceNoteId?.trim() && snapshot.sourceProblemId?.trim()
      ? [{
        sourceNoteId: snapshot.sourceNoteId.trim(),
        sourceProblemId: snapshot.sourceProblemId.trim(),
        sourceContentVersion: snapshot.sourceContentVersion ?? 1,
        checksum: snapshot.sourceChecksum?.trim() || calculateBookletSnapshotChecksum(snapshot),
      }]
      : []
  ));
}

export function extractBookletSourceManifest(markdown: string): BookletSourceManifestEntry[] {
  const pattern = new RegExp(`${BOOKLET_SOURCE_MANIFEST_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^>]+) -->`);
  const encoded = markdown.match(pattern)?.[1];
  if (!encoded) return [];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): BookletSourceManifestEntry[] => {
      if (!item || typeof item !== "object") return [];
      const entry = item as Partial<BookletSourceManifestEntry>;
      return typeof entry.sourceNoteId === "string"
        && typeof entry.sourceProblemId === "string"
        && typeof entry.checksum === "string"
        ? [{
          sourceNoteId: entry.sourceNoteId,
          sourceProblemId: entry.sourceProblemId,
          sourceContentVersion: typeof entry.sourceContentVersion === "number" ? entry.sourceContentVersion : undefined,
          checksum: entry.checksum,
        }]
        : [];
    });
  } catch {
    return [];
  }
}

export function detectBookletSourceDrift(
  manifest: BookletSourceManifestEntry[],
  currentSnapshots: BookletProblemSnapshot[],
): BookletSourceDrift[] {
  const current = new Map(currentSnapshots.flatMap((snapshot): Array<[string, string]> => (
    snapshot.sourceNoteId?.trim() && snapshot.sourceProblemId?.trim()
      ? [[`${snapshot.sourceNoteId}:${snapshot.sourceProblemId}`, calculateBookletSnapshotChecksum(snapshot)]]
      : []
  )));
  return manifest.flatMap((entry): BookletSourceDrift[] => {
    const checksum = current.get(`${entry.sourceNoteId}:${entry.sourceProblemId}`);
    if (!checksum) return [{ ...entry, reason: "missing" }];
    return checksum === entry.checksum ? [] : [{ ...entry, reason: "changed" }];
  });
}

export interface BookletSnapshotValidation {
  valid: boolean;
  missingFields: Array<"question" | "standardAnswer" | "explanation" | "methodSummary">;
}

export function validateBookletProblemSnapshot(
  snapshot: BookletProblemSnapshot,
): BookletSnapshotValidation {
  const missingFields: BookletSnapshotValidation["missingFields"] = [];
  if (!snapshot.question.trim()) missingFields.push("question");
  if (!snapshot.standardAnswer.trim()) missingFields.push("standardAnswer");
  if (!snapshot.explanation.trim()) missingFields.push("explanation");
  if (!snapshot.methodSummary.trim()) missingFields.push("methodSummary");
  return { valid: missingFields.length === 0, missingFields };
}

export function buildBookletNoteMarkdown(snapshots: BookletProblemSnapshot[]): string {
  if (snapshots.length === 0) throw new Error("做题本至少需要一道题目。");

  snapshots.forEach((snapshot, index) => {
    const validation = validateBookletProblemSnapshot(snapshot);
    if (!validation.valid) {
      throw new Error(`第 ${index + 1} 题缺少：${validation.missingFields.join(", ")}`);
    }
  });

  const snapshotBody = snapshots.map((snapshot, index) => [
    `## 第 ${index + 1} 题`,
    "",
    `> 来源：${snapshot.sourceLabel.trim() || "未标注"}`,
    "",
    "### 题目",
    "",
    snapshot.question.trim(),
    "",
    "### 标准答案",
    "",
    snapshot.standardAnswer.trim(),
    "",
    "### 详细解析",
    "",
    snapshot.explanation.trim(),
    "",
    "### 方法总结",
    "",
    snapshot.methodSummary.trim(),
  ].join("\n")).join("\n\n---\n\n");

  const manifest = buildBookletSourceManifest(snapshots);
  const manifestMarker = `${BOOKLET_SOURCE_MANIFEST_PREFIX}${encodeURIComponent(JSON.stringify(manifest))} -->`;

  return [
    "# 三刷做题本",
    "",
    BOOKLET_SNAPSHOT_START,
    manifestMarker,
    "> 本区是生成时快照。源题后续变化只会显示漂移提醒，不会自动改写这里。",
    "",
    snapshotBody,
    BOOKLET_SNAPSHOT_END,
    "",
    BOOKLET_REFLECTION_START,
    "## 个人反思",
    "",
    "在这里持续补充复盘，不修改上方生成快照。",
  ].join("\n");
}

export function extractBookletSnapshot(markdown: string): string | null {
  const start = markdown.indexOf(BOOKLET_SNAPSHOT_START);
  const end = markdown.indexOf(BOOKLET_SNAPSHOT_END);
  if (start < 0 || end <= start) return null;

  return markdown.slice(start + BOOKLET_SNAPSHOT_START.length, end).trim();
}

export async function calculateBookletMarkdownSnapshotSha256(markdown: string): Promise<string> {
  const snapshot = extractBookletSnapshot(markdown);
  if (!snapshot) throw new Error("做题本正文缺少不可变快照区");
  return calculateBookletSha256(snapshot);
}
