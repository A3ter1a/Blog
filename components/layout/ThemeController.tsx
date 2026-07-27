"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  normalizeThemePreference,
  resolveTheme,
  type ThemePreference,
} from "@/lib/theme-contract";

const STORAGE_KEY = "asteroid:theme-preference";
const CHANGE_EVENT = "asteroid-theme-change";

function subscribe(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

function getSnapshot(): ThemePreference {
  return normalizeThemePreference(localStorage.getItem(STORAGE_KEY));
}

function getServerSnapshot(): ThemePreference {
  return "follow";
}

export function setThemePreference(preference: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, preference);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function ThemeController() {
  const preference = useThemePreference();

  useEffect(() => {
    const apply = () => {
      const resolved = resolveTheme(preference);
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    const timer = window.setInterval(apply, 60_000);
    return () => window.clearInterval(timer);
  }, [preference]);

  return null;
}
