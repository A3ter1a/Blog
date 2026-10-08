"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Link, { useLinkStatus } from "next/link";
import { useAnimate, useInView } from "framer-motion";
import { subjectMap, typeMap, type Note } from "@/lib/types";
import { ArrowUpRight, FileText, BookOpen, Calendar, Check, Clock } from "lucide-react";
import { estimateReadingTime } from "@/lib/utils";
import { getVisibleNoteTags } from "@/lib/math3-practice";
import { getNoteReadPath, getSafeNotesReturnPath } from "@/lib/note-routes";
import { CachedImage } from "@/components/ui/CachedImage";
import { uiMotion } from "@/lib/motion";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useNoteNavigationActions } from "@/components/notes/NoteNavigation";

function NavigationHint() {
  const { pending } = useLinkStatus();
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  return <span aria-hidden="true" className={`note-card-navigation-hint ${hydrated && pending ? "is-pending" : ""}`} />;
}

interface NoteCardProps {
  note: Note;
  index: number;
  isSelected?: boolean;
  onToggleSelect?: (noteId: string) => void;
  selectMode?: boolean;
  returnTo?: string;
}

export function NoteCard({ note, index, isSelected = false, onToggleSelect, selectMode = false, returnTo }: NoteCardProps) {
  const [scope, animate] = useAnimate<HTMLElement>();
  const inView = useInView(scope, {
    once: true,
    amount: 0.15,
    // Start the reveal before the card reaches the viewport so a fast scroll
    // does not expose a row that is still waiting for its entrance animation.
    margin: "0px 0px 160px 0px",
  });
  const hasEntered = useRef(false);
  const reducedMotion = usePrefersReducedMotion();
  const { begin } = useNoteNavigationActions();
  const href = getNoteReadPath(note, returnTo);
  const [destinationPath, destinationQuery = ""] = href.split("?");
  const isProblem = note.type === "problem";
  const isEssay = note.type === "essay";
  const createdAt = note.createdAt instanceof Date ? note.createdAt : new Date(String(note.createdAt));
  const updatedAt = note.updatedAt instanceof Date ? note.updatedAt : new Date(String(note.updatedAt));
  const visibleTags = getVisibleNoteTags(note.tags);
  const hasReadableContent = !isProblem && Boolean(note.content?.trim());

  useEffect(() => {
    const card = scope.current;
    if (!inView || !card || hasEntered.current) return;
    hasEntered.current = true;
    if (reducedMotion) return;

    // Keep cards readable while they enter during a scroll. A fade from opacity 0
    // makes the content look like a loading gap when the user lands mid-row, so
    // the reveal only uses a small position/scale shift and never hides content.
    const playback = animate(card, { y: [10, 0], scale: [0.995, 1] }, {
      duration: uiMotion.duration.reveal,
      ease: uiMotion.ease.emphasized,
      delay: Math.min(index * 0.02, 0.12),
    });
    // Release the completed entrance transform so CSS hover feedback can take over.
    void playback.then(() => {
      card.style.opacity = "";
      card.style.transform = "";
    });
    return () => {
      playback.stop();
      card.style.opacity = "";
      card.style.transform = "";
    };
  }, [inView, reducedMotion, index, animate, scope]);

  const handleClick = (e: React.MouseEvent) => {
    if (selectMode && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(note.id);
    }
  };

  return (
    <article
      ref={scope}
      onClick={handleClick}
      className={`surface-card library-card note-card motion-card-lift group h-full cursor-pointer overflow-hidden ${
        selectMode
          ? isSelected
            ? "border-primary/50 bg-primary/5 ring-2 ring-primary/15"
            : ""
          : ""
      }`}
    >
      <Link
        href={href}
        className="note-card-link relative flex h-full flex-col"
        onClick={selectMode ? (e) => e.preventDefault() : undefined}
        onNavigate={() => {
          if (selectMode) return;
          begin({
            id: note.id,
            title: note.title,
            type: note.type,
            subject: note.subject,
            hasCover: Boolean(note.coverImage),
            destinationPath,
            destinationSearch: destinationQuery ? `?${destinationQuery}` : "",
            returnTo: getSafeNotesReturnPath(returnTo),
          });
        }}
      >
        {!selectMode && <NavigationHint />}
        {/* Cover Image or Placeholder */}
        <div className="relative aspect-[16/9] overflow-hidden rounded-t-md bg-surface-container-low">
          {note.coverImage ? (
            <>
              <CachedImage
                src={note.coverImage}
                alt={note.title}
                loading={index < 3 ? "eager" : "lazy"}
                decoding="async"
                className="note-card-cover h-full w-full object-cover object-center"
              />
            </>
          ) : (
            // No cover image - show placeholder
            <div className="relative h-full overflow-hidden bg-surface-container-low">
              <div className="absolute inset-0 bg-primary/[0.03]" />
              <div className="absolute inset-0 flex items-center justify-center">
                {isProblem ? (
                  <BookOpen className="h-10 w-10 text-primary/30" />
                ) : isEssay ? (
                  <span className="font-headline text-4xl text-primary/25">A</span>
                ) : (
                  <FileText className="h-10 w-10 text-primary/30" />
                )}
              </div>
            </div>
          )}
          
          {/* Selection Checkbox (visible in select mode) */}
          {selectMode && (
            <div className="absolute left-2 top-2 z-10">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleSelect?.(note.id);
                }}
                className="motion-ui flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-container-lowest/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={isSelected ? `取消选择 ${note.title}` : `选择 ${note.title}`}
                aria-pressed={isSelected}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  isSelected
                    ? "bg-primary text-on-primary"
                    : "border-2 border-outline-variant bg-surface-container-lowest/80 backdrop-blur-sm"
                }`}>
                  {isSelected && <Check className="w-4 h-4" />}
                </span>
              </button>
            </div>
          )}

          {/* Type Badge (hidden in select mode, replaced by checkbox) */}
          {!selectMode && (
            <div className="absolute left-3 top-3">
              <span
                className={`inline-flex items-center rounded-lg border px-2.5 py-1.5 text-[13px] font-bold leading-none shadow-[0_8px_18px_-14px_rgba(15,23,42,0.65)] ${
                  isProblem
                    ? "border-primary bg-primary text-on-primary"
                    : isEssay
                    ? "border-amber-300 bg-amber-50 text-amber-950"
                    : "border-primary/45 bg-surface-container-lowest text-primary"
                }`}
              >
                {typeMap[note.type]}
              </span>
            </div>
          )}
          {/* Subject Badge */}
          {!isEssay && note.subject && (
            <div className="absolute right-3 top-3">
              <span className="inline-flex items-center rounded-lg border border-primary/35 bg-surface-container-lowest px-2.5 py-1.5 text-[13px] font-bold leading-none text-primary shadow-[0_8px_18px_-14px_rgba(15,23,42,0.65)]">
                {subjectMap[note.subject]}
              </span>
            </div>
          )}
        </div>

        {/* Card Content */}
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start gap-3">
            <h3 className="note-card-title line-clamp-2 min-w-0 flex-1 font-headline text-lg font-bold leading-snug text-on-surface">
              {note.title}
            </h3>
            {!selectMode && <ArrowUpRight aria-hidden="true" className="note-card-open mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" />}
          </div>

          {/* Tags */}
          <div className="mt-4 flex min-h-7 flex-wrap gap-2">
            {visibleTags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="tag-chip px-2 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
            {visibleTags.length > 3 && (
              <span className="tag-chip px-2 py-0.5 text-xs">
                +{visibleTags.length - 3}
              </span>
            )}
          </div>

          {/* Meta Info */}
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-5 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {updatedAt.getTime() !== createdAt.getTime() ? (
                <>更新 {updatedAt.toLocaleDateString("zh-CN")}</>
              ) : (
                <>{createdAt.toLocaleDateString("zh-CN")}</>
              )}
            </span>
            {hasReadableContent && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                  {estimateReadingTime(note.content)} 分钟
              </span>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
