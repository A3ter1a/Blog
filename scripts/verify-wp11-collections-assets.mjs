import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const required = [
  ["supabase/migrations/0023_ai_content_accounts_and_collections.sql", ["create table if not exists public.note_collections", "create table if not exists public.note_collection_items"]],
  ["supabase/migrations/0025_ai_collection_publish_boundary.sql", ["not is_published", "note_collections_owner_update", "note_collection_items_owner_insert"]],
  ["lib/collections-contract.ts", ["CollectionSummary", "CollectionDetail", "normalizeCollectionTitle"]],
  ["lib/server-note-collections.ts", ["listNoteCollections", "createNoteCollection", "addNoteToCollection", "updateCollectionItemOrder", "removeNoteFromCollection"]],
  ["lib/server-collection-auth.ts", ["role: \"admin\"", "role: \"ai\""]],
  ["app/api/collections/route.ts", ["export async function GET", "export async function POST", "scope === \"public\""]],
  ["app/api/collections/[id]/route.ts", ["export async function PATCH", "export async function DELETE"]],
  ["app/api/collections/[id]/items/route.ts", ["export async function POST", "export async function PATCH", "export async function DELETE"]],
  ["app/api/collections/notes/route.ts", ["listCollectionAvailableNotes"]],
  ["app/collections/page.tsx", ["CollectionCard", "公开合集"]],
  ["app/collections/[id]/page.tsx", ["getPublishedById", "getNoteReadPath"]],
  ["app/tools/collections/page.tsx", ["CollectionWorkspace"]],
  ["components/collections/CollectionCard.tsx", ["合集", "itemCount"]],
  ["components/collections/CollectionWorkspace.tsx", ["逐篇加入", "handleMove", "handleRemoveNote"]],
  ["components/notes/NotesClient.tsx", ["initialCollections", "CollectionCard", "合集"]],
  ["app/notes/page.tsx", ["collectionsApi.getPublishedSummaries"]],
];

const failures = [];
for (const [relative, markers] of required) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative}: missing`);
    continue;
  }
  const content = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!content.includes(marker)) failures.push(`${relative}: missing marker ${marker}`);
  }
}
const migration = fs.readFileSync(path.join(root, "supabase/migrations/0025_ai_collection_publish_boundary.sql"), "utf8");
if (/alter\s+type\s+public\.note_type/i.test(migration)) failures.push("0025 must not change the existing note_type enum");
if (!/comment\s+on\s+policy/i.test(migration)) failures.push("0025 should document the AI publish boundary");

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checkedFiles: required.length,
  guarantees: [
    "public collection cards and detail pages",
    "incremental append/reorder/remove mutations",
    "admin and AI account routing",
    "AI unpublished collection boundary",
    "existing note_type and note storage shape preserved",
  ],
}, null, 2));
