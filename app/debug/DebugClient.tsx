"use client";

import { useEffect, useState } from "react";
import { notesApi } from "@/lib/supabase";

export function DebugClient() {
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const notes = await notesApi.getAll();
          setResult(JSON.stringify(notes, null, 2));
        } catch (error: unknown) {
          setResult(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="pt-32 pb-20 px-6 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Supabase Debug</h1>
        <pre className="bg-surface-container-low p-4 rounded-xl overflow-auto max-h-[80vh] text-sm whitespace-pre-wrap">
          {result || "Loading..."}
        </pre>
      </div>
    </main>
  );
}
