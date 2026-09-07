"use client";

import { useEffect, useState } from "react";
import { readEnglishDraftAnswers, writeEnglishDraftAnswers } from "@/lib/english-draft-cache";

/** The owning workspace is keyed by userId so drafts cannot cross accounts. */
export function useEnglishDraftAnswers(userId: string | null) {
  const [answers, setAnswers] = useState(() => readEnglishDraftAnswers(userId));
  const [storedAnswers, setStoredAnswers] = useState(answers);
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const persist = () => writeEnglishDraftAnswers(userId, answers);
    queueMicrotask(() => {
      if (!active) return;
      const saved = persist();
      setStorageFailed(!saved);
      if (saved) setStoredAnswers(answers);
    });
    window.addEventListener("pagehide", persist);
    return () => {
      active = false;
      window.removeEventListener("pagehide", persist);
    };
  }, [answers, userId]);

  return { answers, setAnswers, storageFailed, stored: storedAnswers === answers };
}
