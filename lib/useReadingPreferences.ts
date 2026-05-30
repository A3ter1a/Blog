"use client";

import { useState, useEffect } from "react";

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

export function useReadingPreferences() {
  const [preferences, setPreferences] = useState<ReadingPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    let nextPreferences = DEFAULT_PREFERENCES;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        nextPreferences = { ...DEFAULT_PREFERENCES, ...parsed };
      } catch {
        // Use defaults
      }
    }
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return {
    preferences,
    updatePreference,
    isLoaded,
  };
}
