"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Note } from "@/lib/types";

type NavigationPreview = Pick<Note, "id" | "title" | "type" | "subject"> & {
  destinationPath: string;
  destinationSearch: string;
  returnTo: string;
  hasCover: boolean;
};

type PendingNavigation = NavigationPreview & { token: number };
type NavigationActions = {
  begin: (preview: NavigationPreview) => void;
  complete: (token: number) => void;
};

const PreviewContext = createContext<PendingNavigation | null>(null);
const ActionsContext = createContext<NavigationActions>({ begin: () => {}, complete: () => {} });

export function NoteNavigationProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const nextToken = useRef(0);
  const begin = useCallback((preview: NavigationPreview) => {
    setPending({ ...preview, token: ++nextToken.current });
  }, []);
  const complete = useCallback((token: number) => {
    setPending((current) => current?.token === token ? null : current);
  }, []);
  const actions = useMemo(() => ({ begin, complete }), [begin, complete]);

  // Bound in-memory metadata if a navigation fails before a reader can mount.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => complete(pending.token), 30_000);
    return () => window.clearTimeout(timer);
  }, [pending, complete]);

  return (
    <ActionsContext.Provider value={actions}>
      <PreviewContext.Provider value={pending}>{children}</PreviewContext.Provider>
    </ActionsContext.Provider>
  );
}

export function useNoteNavigationActions() {
  return useContext(ActionsContext);
}

export function useNoteNavigationPreview() {
  const pending = useContext(PreviewContext);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentFrom = searchParams.get("from") ?? "";
  const destinationFrom = pending ? new URLSearchParams(pending.destinationSearch).get("from") ?? "" : "";
  // Compare the full pathname, including the private/public route boundary.
  // The `from` query controls the return link, so stale metadata from another
  // entry point must not be reused for the current route.
  return pending?.destinationPath === pathname && destinationFrom === currentFrom ? pending : null;
}

export function useCompleteNoteNavigation(noteId: string, ready: boolean) {
  const pending = useNoteNavigationPreview();
  const { complete } = useNoteNavigationActions();
  const token = pending?.id === noteId ? pending.token : undefined;

  useEffect(() => {
    if (ready && token !== undefined) complete(token);
  }, [ready, token, complete]);
}
