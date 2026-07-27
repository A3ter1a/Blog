#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function parseEnvFile(path) {
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = parseEnvFile(join(rootDir, ".env.local"));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data, error } = await supabase
  .from("notes")
  .select("id,title,problems,is_published")
  .eq("is_published", true);
if (error) throw error;

const largest = (data ?? [])
  .map((note) => ({
    id: note.id,
    title: note.title,
    problemCount: Array.isArray(note.problems) ? note.problems.length : 0,
  }))
  .sort((left, right) => right.problemCount - left.problemCount)
  .slice(0, 5);

console.log(JSON.stringify(largest, null, 2));
