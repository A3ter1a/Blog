import type { Note } from "./types";

export type NoteRouteTarget = Pick<Note, "id" | "isPublished">;

export function getPrivateNoteReadPath(noteId: string): string {
  return `/notes/private/${encodeURIComponent(noteId)}`;
}

export function getNoteReadPath(note: NoteRouteTarget): string {
  return note.isPublished
    ? `/notes/${encodeURIComponent(note.id)}`
    : getPrivateNoteReadPath(note.id);
}

export function getNoteReadHref(note: NoteRouteTarget, hash?: string): string {
  const path = getNoteReadPath(note);
  const normalizedHash = hash?.replace(/^#/, "");
  return normalizedHash ? `${path}#${normalizedHash}` : path;
}
