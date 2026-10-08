"use client";

import { useState, useEffect, useCallback } from "react";
import { readJsonStorage, writeJsonStorage } from "./browser-storage";

export type TOCPosition = "left" | "right" | "hidden";
export type ContentWidth = "narrow" | "comfortable" | "wide";
export type MotionPreference = "system" | "reduced" | "full";

export interface ReadingPreferences {
  fontSize: number; // 14-22
  lineHeight: number;
  contentWidth: ContentWidth;
  tocPosition: TOCPosition;
  showProgressBar: boolean;
  showRoleplay: boolean;
  motionPreference: MotionPreference;
}

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  fontSize: 18,
  lineHeight: 1.78,
  contentWidth: "comfortable",
  tocPosition: "right",
  showProgressBar: true,
  showRoleplay: true,
  motionPreference: "system",
};

const LEGACY_DEFAULT_PREFERENCES = {
  fontSize: 16,
  lineHeight: 1.72,
  contentWidth: "comfortable" as const,
};

const STORAGE_KEY = "reading-preferences";
const CHANGE_EVENT = "asteroid-reading-preferences-change";
const TOC_POSITIONS: TOCPosition[] = ["left", "right", "hidden"];
const CONTENT_WIDTHS: ContentWidth[] = ["narrow", "comfortable", "wide"];
const MOTION_PREFERENCES: MotionPreference[] = ["system", "reduced", "full"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePreferences(value: unknown): ReadingPreferences {
  const parsed = isRecord(value) ? value : {};
  const tocPosition = typeof parsed.tocPosition === "string" && TOC_POSITIONS.includes(parsed.tocPosition as TOCPosition)
    ? parsed.tocPosition as TOCPosition
    : DEFAULT_READING_PREFERENCES.tocPosition;
  const contentWidth = typeof parsed.contentWidth === "string" && CONTENT_WIDTHS.includes(parsed.contentWidth as ContentWidth)
    ? parsed.contentWidth as ContentWidth
    : DEFAULT_READING_PREFERENCES.contentWidth;
  const motionPreference = typeof parsed.motionPreference === "string" && MOTION_PREFERENCES.includes(parsed.motionPreference as MotionPreference)
    ? parsed.motionPreference as MotionPreference
    : DEFAULT_READING_PREFERENCES.motionPreference;
  const fontSize = typeof parsed.fontSize === "number" && Number.isFinite(parsed.fontSize)
    ? Math.min(22, Math.max(14, Math.round(parsed.fontSize)))
    : DEFAULT_READING_PREFERENCES.fontSize;
  const lineHeight = typeof parsed.lineHeight === "number" && Number.isFinite(parsed.lineHeight)
    ? Math.min(2, Math.max(1.5, Number(parsed.lineHeight.toFixed(2))))
    : DEFAULT_READING_PREFERENCES.lineHeight;

  return {
    fontSize,
    lineHeight,
    contentWidth,
    tocPosition,
    showProgressBar: typeof parsed.showProgressBar === "boolean"
      ? parsed.showProgressBar
      : DEFAULT_READING_PREFERENCES.showProgressBar,
    showRoleplay: typeof parsed.showRoleplay === "boolean"
      ? parsed.showRoleplay
      : DEFAULT_READING_PREFERENCES.showRoleplay,
    motionPreference,
  };
}

function readPreferences(): ReadingPreferences {
  const preferences = readJsonStorage(STORAGE_KEY, DEFAULT_READING_PREFERENCES, normalizePreferences);

  // Upgrade the old first-run preset while preserving deliberate choices such
  // as the TOC position, progress bar, and roleplay display.
  if (
    preferences.fontSize === LEGACY_DEFAULT_PREFERENCES.fontSize
    && preferences.lineHeight === LEGACY_DEFAULT_PREFERENCES.lineHeight
    && preferences.contentWidth === LEGACY_DEFAULT_PREFERENCES.contentWidth
  ) {
    return {
      ...preferences,
      fontSize: DEFAULT_READING_PREFERENCES.fontSize,
      lineHeight: DEFAULT_READING_PREFERENCES.lineHeight,
    };
  }

  return preferences;
}

export function getReadingWidthClass(contentWidth: ContentWidth): string {
  return contentWidth === "narrow"
    ? "mx-auto max-w-[44rem]"
    : contentWidth === "wide"
      ? "mx-auto max-w-[68rem]"
      : "mx-auto max-w-[60rem]";
}

function writePreferences(preferences: ReadingPreferences): void {
  writeJsonStorage(STORAGE_KEY, preferences);
  window.dispatchEvent(new CustomEvent<ReadingPreferences>(CHANGE_EVENT, { detail: preferences }));
}

export function useReadingPreferences() {
  const [preferences, setPreferences] = useState<ReadingPreferences>(DEFAULT_READING_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const load = () => {
      setPreferences(readPreferences());
      setIsLoaded(true);
    };

    const handleLocalChange = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      setPreferences(normalizePreferences(detail ?? readPreferences()));
      setIsLoaded(true);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) load();
    };

    const timer = window.setTimeout(load, 0);
    window.addEventListener(CHANGE_EVENT, handleLocalChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(CHANGE_EVENT, handleLocalChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const updatePreference = useCallback(<K extends keyof ReadingPreferences>(
    key: K,
    value: ReadingPreferences[K]
  ) => {
    const updated = normalizePreferences({ ...readPreferences(), [key]: value });
    setPreferences(updated);
    setIsLoaded(true);
    writePreferences(updated);
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_READING_PREFERENCES);
    setIsLoaded(true);
    writePreferences(DEFAULT_READING_PREFERENCES);
  }, []);

  const importPreferences = useCallback((value: unknown) => {
    const imported = normalizePreferences(value);
    setPreferences(imported);
    setIsLoaded(true);
    writePreferences(imported);
    return imported;
  }, []);

  return {
    preferences,
    updatePreference,
    resetPreferences,
    importPreferences,
    isLoaded,
  };
}
