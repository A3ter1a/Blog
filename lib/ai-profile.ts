import type { Tables } from "@/lib/database.types";

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
