"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAnimate } from "framer-motion";
import { uiMotion } from "@/lib/motion";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { NoteNavigationProvider } from "@/components/notes/NoteNavigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const reducedMotion = usePrefersReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();

  useEffect(() => {
    const previous = previousPath.current;
    previousPath.current = pathname;
    if (reducedMotion || previous === pathname) return;

    // Animate the stable RSC container so every route gets the same handoff,
    // including reader, home, about, and pages whose header renders later.
    const container = scope.current;
    if (!container) return;
    const playback = animate(container, { opacity: [0.78, 1], y: [8, 0] }, {
      duration: uiMotion.duration.page,
      ease: uiMotion.ease.emphasized,
    });

    return () => {
      playback.stop();
      container.style.opacity = "";
      container.style.transform = "";
    };
  }, [pathname, reducedMotion, animate, scope]);

  return (
    <NoteNavigationProvider>
      <div ref={scope} id="main-content" className="flex-1" tabIndex={-1}>{children}</div>
    </NoteNavigationProvider>
  );
}
