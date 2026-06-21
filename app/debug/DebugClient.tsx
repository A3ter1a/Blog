"use client";

import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { notesApi } from "@/lib/supabase";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { scheduleDeferredClientWork } from "@/lib/deferred-client-work";

export function DebugClient() {
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    return scheduleDeferredClientWork(() => {
      void (async () => {
        try {
          const notes = await notesApi.getAll();
          setResult(JSON.stringify(notes, null, 2));
        } catch (error: unknown) {
          setResult(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      })();
    });
  }, []);

  return (
    <>
      <PageHeader
        width="compact"
        eyebrow="调试"
        icon={<Database className="h-4 w-4" />}
        title="Supabase Debug"
      />

      <PageShell width="compact" topPadding="content">
        <pre className="max-h-[80vh] overflow-auto rounded-lg border border-outline-variant/20 bg-surface-container-low p-4 text-sm whitespace-pre-wrap">
          {result || "Loading..."}
        </pre>
      </PageShell>
    </>
  );
}
