"use client";

import { useSyncExternalStore } from "react";
import { getActiveAiAccountSlot, type AiAccountSlot } from "@/lib/auth-session-slot";

const subscribeToStableSlot = () => () => {};
const getServerSlot = (): AiAccountSlot | null => null;

export function useAiAccountSlot(): AiAccountSlot | null {
  return useSyncExternalStore(
    subscribeToStableSlot,
    getActiveAiAccountSlot,
    getServerSlot,
  );
}
