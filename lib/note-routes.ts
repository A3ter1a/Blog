import type { Note, NoteAuthorKind, NoteType, Subject } from "./types";

export type NoteRouteTarget = Pick<Note, "id" | "isPublished">;

export type NotesDirectoryRouteState = {
  directoryKind: NoteAuthorKind;
  searchQuery: string;
  selectedType: NoteType | "all";
  selectedSubject: Subject | "all";
  sortOrder: "desc" | "asc";
};

export function getNotesDirectoryPath(state: NotesDirectoryRouteState): string {
  const params = new URLSearchParams();
  const query = state.searchQuery.trim();

  if (state.directoryKind === "ai") params.set("directory", "ai");
  if (query) params.set("q", query);
  if (state.selectedType !== "all") params.set("type", state.selectedType);
  if (state.selectedSubject !== "all") params.set("subject", state.selectedSubject);
  if (state.sortOrder !== "desc") params.set("sort", state.sortOrder);

  const queryString = params.toString();
  return queryString ? `/notes?${queryString}` : "/notes";
}

export function getSafeNotesReturnPath(value: string | null | undefined): string {
  if (!value) return "/notes";

  try {
    const parsed = new URL(value, "https://asteroid.local");
    if (parsed.origin !== "https://asteroid.local" || parsed.pathname !== "/notes") return "/notes";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/notes";
  }
}

export function getPrivateNoteReadPath(noteId: string): string {
  return `/notes/private/${encodeURIComponent(noteId)}`;
}

export function getNoteReadPath(note: NoteRouteTarget, returnTo?: string): string {
  const path = note.isPublished
    ? `/notes/${encodeURIComponent(note.id)}`
    : getPrivateNoteReadPath(note.id);
  if (returnTo === undefined) return path;

  const safeReturnPath = getSafeNotesReturnPath(returnTo);
  return `${path}?from=${encodeURIComponent(safeReturnPath)}`;
}

export function getNoteReadHref(note: NoteRouteTarget, hash?: string): string {
  const path = getNoteReadPath(note);
  const normalizedHash = hash?.replace(/^#/, "");
  return normalizedHash ? `${path}#${normalizedHash}` : path;
}
