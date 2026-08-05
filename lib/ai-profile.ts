import type { Tables } from "@/lib/database.types";

export const AI_PROFILE_EDITABLE_FIELDS = [
  "display_name",
  "avatar_url",
  "bio",
  "academic_affiliation",
  "focus_tags",
] as const;

export type AiProfileEditableField = (typeof AI_PROFILE_EDITABLE_FIELDS)[number];

export type AiProfileEditableUpdate = {
  display_name: string;
  avatar_url: string | null;
  bio: string;
  academic_affiliation: string;
  focus_tags: string[];
};

export type AiProfileUpdateResult =
  | { ok: true; value: Partial<AiProfileEditableUpdate> }
  | { ok: false; error: string };

const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_AVATAR_URL_LENGTH = 500;
const MAX_BIO_LENGTH = 2_000;
const MAX_AFFILIATION_LENGTH = 200;
const MAX_FOCUS_TAGS = 12;
const MAX_FOCUS_TAG_LENGTH = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readTrimmedString(
  value: unknown,
  field: string,
  maxLength: number,
  options: { required?: boolean } = {},
): { value?: string; error?: string } {
  if (typeof value !== "string") {
    return options.required ? { error: `${field}必须是文本` } : {};
  }
  const next = value.trim();
  if (options.required && !next) return { error: `${field}不能为空` };
  if (next.length > maxLength) return { error: `${field}不能超过 ${maxLength} 个字符` };
  return { value: next };
}

function readAvatarUrl(value: unknown): { value?: string | null; error?: string } {
  if (value === null || value === undefined || value === "") return { value: null };
  const parsed = readTrimmedString(value, "头像地址", MAX_AVATAR_URL_LENGTH);
  if (parsed.error) return parsed;
  if (!parsed.value) return { value: null };
  try {
    const url = new URL(parsed.value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: "头像地址只支持 http 或 https" };
    }
  } catch {
    return { error: "头像地址格式不正确" };
  }
  return { value: parsed.value };
}

function readFocusTags(value: unknown): { value?: string[]; error?: string } {
  if (!Array.isArray(value)) return { error: "关注方向必须是文本数组" };
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return { error: "关注方向必须全部是文本" };
    const tag = item.trim();
    if (!tag) continue;
    if (tag.length > MAX_FOCUS_TAG_LENGTH) {
      return { error: `每个关注方向不能超过 ${MAX_FOCUS_TAG_LENGTH} 个字符` };
    }
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > MAX_FOCUS_TAGS) return { error: `关注方向最多填写 ${MAX_FOCUS_TAGS} 项` };
  return { value: tags };
}

/**
 * Validate the small, explicit set of fields an AI account may edit.
 * Unknown keys are rejected so account identity fields can never be passed
 * accidentally through this endpoint.
 */
export function parseAiProfileUpdate(value: unknown): AiProfileUpdateResult {
  if (!isRecord(value)) return { ok: false, error: "请求内容必须是 JSON 对象" };

  const keys = Object.keys(value);
  const unknownKey = keys.find((key) => !AI_PROFILE_EDITABLE_FIELDS.includes(key as AiProfileEditableField));
  if (unknownKey) return { ok: false, error: `不允许修改字段：${unknownKey}` };
  if (keys.length === 0) return { ok: false, error: "至少填写一项资料" };

  const output: Partial<AiProfileEditableUpdate> = {};
  if ("display_name" in value) {
    const result = readTrimmedString(value.display_name, "角色名", MAX_DISPLAY_NAME_LENGTH, { required: true });
    if (result.error) return { ok: false, error: result.error };
    output.display_name = result.value ?? "";
  }
  if ("avatar_url" in value) {
    const result = readAvatarUrl(value.avatar_url);
    if (result.error) return { ok: false, error: result.error };
    output.avatar_url = result.value ?? null;
  }
  if ("bio" in value) {
    const result = readTrimmedString(value.bio, "个人简介", MAX_BIO_LENGTH);
    if (result.error) return { ok: false, error: result.error };
    output.bio = result.value ?? "";
  }
  if ("academic_affiliation" in value) {
    const result = readTrimmedString(value.academic_affiliation, "学术所属", MAX_AFFILIATION_LENGTH);
    if (result.error) return { ok: false, error: result.error };
    output.academic_affiliation = result.value ?? "";
  }
  if ("focus_tags" in value) {
    const result = readFocusTags(value.focus_tags);
    if (result.error) return { ok: false, error: result.error };
    output.focus_tags = result.value ?? [];
  }

  return { ok: true, value: output };
}

export type PublicAiProfile = Pick<
  Tables<"ai_profiles">,
  | "id"
  | "account_key"
  | "subject"
  | "display_name"
  | "avatar_url"
  | "bio"
  | "academic_affiliation"
  | "focus_tags"
  | "is_active"
>;
