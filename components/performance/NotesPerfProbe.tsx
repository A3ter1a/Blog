"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type PerfSnapshot = {
  capturedAtMs: number;
  navigationMs: number | null;
  domContentLoadedMs: number | null;
  loadEventMs: number | null;
  firstContentfulPaintMs: number | null;
  cls: number | null;
  longTaskCount: number | null;
  longTaskTotalMs: number | null;
  longTaskMaxMs: number | null;
  longTaskAttribution: string[];
  clsSources: string[];
  viewportWidth: number;
  documentWidth: number;
  horizontalOverflowPx: number;
};

type PerformanceEntryWithValue = PerformanceEntry & { value?: number; hadRecentInput?: boolean };

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function readSnapshot(cls: number | null, longTaskDurations: number[] | null, longTaskAttribution: string[]): PerfSnapshot {
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const paint = performance.getEntriesByType("paint").find((entry) => entry.name === "first-contentful-paint");
  const documentWidth = document.documentElement.scrollWidth;
  const viewportWidth = document.documentElement.clientWidth;

  return {
    capturedAtMs: Math.round(performance.now()),
    navigationMs: round(navigation?.duration ?? null),
    domContentLoadedMs: round(navigation?.domContentLoadedEventEnd ?? null),
    loadEventMs: round(navigation?.loadEventEnd ?? null),
    firstContentfulPaintMs: round(paint?.startTime ?? null),
    cls: cls === null ? null : round(cls),
    longTaskCount: longTaskDurations?.length ?? null,
    longTaskTotalMs: longTaskDurations === null ? null : round(longTaskDurations.reduce((total, duration) => total + duration, 0)),
    longTaskMaxMs: longTaskDurations === null ? null : round(longTaskDurations.length ? Math.max(...longTaskDurations) : 0),
    longTaskAttribution,
    clsSources: [],
    viewportWidth,
    documentWidth,
    horizontalOverflowPx: Math.max(0, documentWidth - viewportWidth),
  };
}

function observeMetric(type: string, callback: (entry: PerformanceEntryWithValue) => void): PerformanceObserver | null {
  if (!("PerformanceObserver" in window)) return null;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) callback(entry as PerformanceEntryWithValue);
    });
    observer.observe({ type, buffered: true });
    return observer;
  } catch {
    return null;
  }
}

export function NotesPerfProbe() {
  const enabled = useSyncExternalStore(
    () => () => undefined,
    () => new URLSearchParams(window.location.search).get("perf") === "1",
    () => false,
  );
  const [snapshot, setSnapshot] = useState<PerfSnapshot | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cls = 0;
    const clsSources: string[] = [];
    const clsObserver = observeMetric("layout-shift", (entry) => {
      if (!entry.hadRecentInput) {
        cls += entry.value ?? 0;
        const sources = (entry as PerformanceEntryWithValue & {
          sources?: Array<{ node?: Element | null }>;
        }).sources ?? [];
        for (const source of sources) {
          const element = source.node;
          if (!element) continue;
          const label = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.className && typeof element.className === "string" ? `.${element.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}` : ""}`;
          if (!clsSources.includes(label)) clsSources.push(label);
        }
      }
    });
    const longTaskDurations: number[] = [];
    const longTaskAttribution: string[] = [];
    const longTaskObserver = observeMetric("longtask", (entry) => {
      longTaskDurations.push(entry.duration);
      const attribution = (entry as PerformanceEntry & {
        attribution?: Array<{ name?: string; containerSrc?: string; containerName?: string }>;
      }).attribution ?? [];
      for (const item of attribution) {
        const label = item.containerSrc || item.name || item.containerName;
        if (label && !longTaskAttribution.includes(label)) longTaskAttribution.push(label);
      }
    });
    const capture = () => setSnapshot({
      ...readSnapshot(cls, longTaskObserver ? longTaskDurations : null, [...longTaskAttribution]),
      clsSources: [...clsSources],
    });
    const frameId = window.requestAnimationFrame(() => {
      capture();
      window.setTimeout(capture, 1000);
      window.setTimeout(capture, 2500);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      clsObserver?.disconnect();
      longTaskObserver?.disconnect();
    };
  }, [enabled]);

  return (
    <aside
      aria-label="笔记列表性能诊断"
      aria-hidden={!enabled}
      className={`fixed bottom-3 left-3 z-[100] h-56 w-[min(92vw,28rem)] overflow-auto rounded-lg border border-primary/30 bg-surface-container-lowest/95 p-3 text-[11px] leading-5 text-on-surface shadow-ambient backdrop-blur transition-opacity ${enabled ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {enabled && (
        <>
          <p className="mb-1 font-bold text-primary">笔记列表性能诊断（只读）</p>
          <pre className="whitespace-pre-wrap font-mono">
            {snapshot ? JSON.stringify(snapshot, null, 2) : "正在采集…"}
          </pre>
        </>
      )}
    </aside>
  );
}
