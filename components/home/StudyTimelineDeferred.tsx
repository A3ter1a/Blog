"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const StudyTimeline = dynamic(() => import("@/components/home/StudyTimeline"), {
  loading: () => <StudyTimelineSkeleton />,
});

export function StudyTimelineDeferred() {
  const [shouldLoad, setShouldLoad] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;

    if (!host || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "420px 0px" },
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef}>
      {shouldLoad ? <StudyTimeline /> : <StudyTimelineSkeleton />}
    </div>
  );
}

function StudyTimelineSkeleton() {
  return (
    <div className="surface-panel overflow-hidden p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-3 w-20 rounded-full bg-surface-container-high" />
          <div className="mt-4 h-8 w-48 rounded-lg bg-surface-container-high" />
        </div>
        <div className="h-3 w-28 rounded-full bg-surface-container-high" />
      </div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-surface-container-high">
        <div className="h-full w-1/3 rounded-full bg-primary/20" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-14 rounded-xl bg-surface-container-low" />
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
        <div className="h-5 w-24 rounded-lg bg-surface-container-high" />
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="h-9 w-32 rounded-full bg-surface-container-high" />
          <div className="h-9 w-20 rounded-full bg-surface-container-high" />
          <div className="h-9 w-24 rounded-full bg-surface-container-high" />
        </div>
      </div>
    </div>
  );
}
