"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type BookletOrientation = "landscape" | "portrait";

interface StartBookletPrintOptions {
  orientation: BookletOrientation;
  title: string;
}

interface UseBookletPrintOptions {
  bodyOrientationAttribute: string;
  bodyTargetAttribute: string;
}

export function useBookletPrint<Target extends string>({
  bodyOrientationAttribute,
  bodyTargetAttribute,
}: UseBookletPrintOptions) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const printStartTimerRef = useRef<number | null>(null);
  const [activePrintTarget, setActivePrintTarget] = useState<Target | null>(null);

  useEffect(() => () => {
    cleanupRef.current?.();
  }, []);

  const startPrint = useCallback((target: Target, options: StartBookletPrintOptions) => {
    cleanupRef.current?.();

    const previousTitle = document.title;
    const previousTarget = document.body.getAttribute(bodyTargetAttribute);
    const previousOrientation = document.body.getAttribute(bodyOrientationAttribute);
    const printMediaQuery = window.matchMedia("print");
    const pageStyle = document.createElement("style");
    let fallbackCleanupTimer: number | null = null;
    let cleaned = false;

    const pageSize = options.orientation === "landscape" ? "280mm 210mm" : "210mm 280mm";
    pageStyle.setAttribute("data-booklet-page-size", options.orientation);
    pageStyle.textContent = `@media print { @page { size: ${pageSize}; margin: 0; } }`;

    const clearFallbackCleanup = () => {
      if (fallbackCleanupTimer !== null) {
        window.clearTimeout(fallbackCleanupTimer);
        fallbackCleanupTimer = null;
      }
    };

    const restoreAttribute = (name: string, value: string | null) => {
      if (value === null) {
        document.body.removeAttribute(name);
      } else {
        document.body.setAttribute(name, value);
      }
    };

    const restorePrintState = () => {
      if (cleaned) return;
      cleaned = true;

      if (printStartTimerRef.current !== null) {
        window.clearTimeout(printStartTimerRef.current);
        printStartTimerRef.current = null;
      }

      clearFallbackCleanup();
      restoreAttribute(bodyTargetAttribute, previousTarget);
      restoreAttribute(bodyOrientationAttribute, previousOrientation);
      pageStyle.remove();
      document.title = previousTitle;
      window.removeEventListener("afterprint", finishPrint);
      printMediaQuery.removeEventListener("change", handlePrintMediaChange);
      cleanupRef.current = null;
    };

    const finishPrint = () => {
      restorePrintState();
      setActivePrintTarget(null);
    };

    const handlePrintMediaChange = (event: MediaQueryListEvent) => {
      if (!event.matches) finishPrint();
    };

    cleanupRef.current = restorePrintState;
    setActivePrintTarget(target);
    document.body.setAttribute(bodyTargetAttribute, target);
    document.body.setAttribute(bodyOrientationAttribute, options.orientation);
    document.head.appendChild(pageStyle);
    document.title = options.title;
    window.addEventListener("afterprint", finishPrint);
    printMediaQuery.addEventListener("change", handlePrintMediaChange);
    fallbackCleanupTimer = window.setTimeout(finishPrint, 60_000);
    printStartTimerRef.current = window.setTimeout(() => {
      printStartTimerRef.current = null;
      window.print();
    }, 250);
  }, [bodyOrientationAttribute, bodyTargetAttribute]);

  return { activePrintTarget, startPrint };
}
