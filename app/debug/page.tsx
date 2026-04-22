"use client";

import { useEffect, useState } from "react";
import { notesApi } from "@/lib/supabase";

// Only allow debug page in development mode
const ALLOWED = process.env.NODE_ENV === "development";

export default function DebugPage() {
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    if (!ALLOWED) {
      setResult("Debug 页面仅允许在开发环境访问");
      return;
    }

    (async () => {
      try {
        const notes = await notesApi.getAll();
        setResult(JSON.stringify(notes, null, 2));
      } catch (error: any) {
        setResult(`错误: ${error.message}`);
      }
    })();
  }, []);

  return (
    <main className="pt-32 pb-20 px-6 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Supabase 调试</h1>
        <pre className="bg-surface-container-low p-4 rounded-xl overflow-auto max-h-[80vh] text-sm whitespace-pre-wrap">
          {result || "加载中..."}
        </pre>
      </div>
    </main>
  );
}
