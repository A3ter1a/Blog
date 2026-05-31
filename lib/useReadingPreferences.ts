"use client";

import { useState, useEffect } from "react";
import { readJsonStorage, writeJsonStorage } from "./browser-storage";

export type TOCPosition = "left" | "right" | "hidden";

export interface ReadingPreferences {
  fontSize: number; // 14-20
  tocPosition: TOCPosition;
  showProgressBar: boolean;
}

const DEFAULT_PREFERENCES: ReadingPreferences = {
  fontSize: 16,
  tocPosition: "right",
  showProgressBar: true,
};

const STORAGE_KEY = "reading-preferences";
const TOC_POSITIONS: TOCPosition[] = ["left", "right", "hidden"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePreferences(value: unknown): ReadingPreferences {
  const parsed = isRecord(value) ? value : {};
  const tocPosition = typeof parsed.tocPosition === "string" && TOC_POSITIONS.includes(parsed.tocPosition as TOCPosition)
    ? parsed.tocPosition as TOCPosition
    : DEFAULT_PREFERENCES.tocPosition;

  return {
    fontSize: typeof parsed.fontSize === "number" ? parsed.fontSize : DEFAULT_PREFERENCES.fontSize,
    tocPosition,
    showProgressBar: typeof parsed.showProgressBar === "boolean"
      ? parsed.showProgressBar
      : DEFAULT_PREFERENCES.showProgressBar,
  };
}

export function useReadingPreferences() {
  const [preferences, setPreferences] = useState<ReadingPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const nextPreferences = readJsonStorage(STORAGE_KEY, DEFAULT_PREFERENCES, normalizePreferences);
    const timer = window.setTimeout(() => {
      setPreferences(nextPreferences);
      setIsLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const updatePreference = <K extends keyof ReadingPreferences>(
    key: K,
    value: ReadingPreferences[K]
  ) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    writeJsonStorage(STORAGE_KEY, updated);
  };

  return {
    preferences,
    updatePreference,
    isLoaded,
  };
}
