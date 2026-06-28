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
    <div className="relative mx-auto w-full py-8 sm:py-10">
      <div className="relative mx-auto w-full max-w-6xl pb-36 sm:pb-40">
        <div className="absolute left-[8.333%] right-[8.333%] top-6 h-2 animate-pulse rounded-full bg-[linear-gradient(90deg,rgba(14,165,233,0.35)_0%,rgba(14,165,233,0.35)_28%,rgba(249,115,22,0.35)_58%,rgba(225,29,72,0.35)_100%)]" />
        <div className="relative grid grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex flex-col items-center gap-3 px-2">
              <div className="h-8 w-8 animate-pulse rounded-full border-4 border-surface bg-surface-container-high" />
              <div className="h-4 w-8 animate-pulse rounded-md bg-surface-container-high/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
