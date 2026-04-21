import { useEffect, useRef, type RefObject } from "react";

/**
 * Hook that calls `handler` when a click occurs outside the referenced element.
 * Only active when `enabled` is true.
 */
export function useClickOutside(
  handler: (event: MouseEvent) => void,
  enabled: boolean = true
): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler(event);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handler, enabled]);

  return ref;
}
