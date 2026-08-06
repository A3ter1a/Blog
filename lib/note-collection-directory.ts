import type { CollectionSummary } from "./collections-contract";
import type { Note } from "./types";

export type NoteCollectionGroup = {
  collection: CollectionSummary;
  notes: Note[];
};

export type NoteCollectionDirectory = {
  groups: NoteCollectionGroup[];
  ungrouped: Note[];
};

/**
 * Arrange a loaded note page using the ordered member IDs from public
 * collections. A note that appears in more than one collection is shown in
 * the first collection returned, avoiding duplicate cards in the directory.
 * Notes not present in the current page (for example, because pagination is
 * active) are simply skipped until that page is loaded.
 */
export function groupNotesByCollection(
  notes: Note[],
  collections: CollectionSummary[],
): NoteCollectionDirectory {
  const noteById = new Map(notes.map((note) => [note.id, note]));
  const claimed = new Set<string>();
  const groups: NoteCollectionGroup[] = [];

  for (const collection of collections) {
    const members = (collection.orderedNoteIds ?? [])
      .map((noteId) => noteById.get(noteId))
      .filter((note): note is Note => {
        if (!note) return false;
        return !claimed.has(note.id);
      });
    if (members.length === 0) continue;
    for (const note of members) claimed.add(note.id);
    groups.push({ collection, notes: members });
  }

  return {
    groups,
    ungrouped: notes.filter((note) => !claimed.has(note.id)),
  };
}
