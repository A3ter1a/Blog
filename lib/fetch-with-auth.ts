"use client";

import { getSupabase } from "@/lib/supabase";

export async function buildAuthHeaders(headers?: HeadersInit): Promise<Headers> {
  const nextHeaders = new Headers(headers);
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;

  if (token) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }

  return nextHeaders;
}
