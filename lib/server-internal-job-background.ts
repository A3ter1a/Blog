import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceInternalJob } from "./server-internal-job-runner";
import type { Database } from "./supabase-schema";

type ScheduleInternalJobDrainInput = {
  userId: string;
  jobId: string;
  deepseekApiKey: string;
  qwenApiKey: string;
};

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "claimed", "cancelled"]);
const MAX_BACKGROUND_STEPS = 60;

/**
 * Starts a bounded server-side drain after the creation response is sent.
 * Database leases keep this safe alongside browser polling, while durable job
 * rows still allow a later request to resume if the host stops the callback.
 */
export function scheduleInternalJobDrain(
  supabase: SupabaseClient<Database>,
  input: ScheduleInternalJobDrainInput,
): void {
  after(async () => {
    try {
      let previousFingerprint = "";
      for (let step = 0; step < MAX_BACKGROUND_STEPS; step += 1) {
        const ledger = await advanceInternalJob(supabase, input);
        const job = ledger.data;
        if (ledger.availability !== "synced" || !job || TERMINAL_STATUSES.has(job.status)) return;
        const fingerprint = `${job.status}:${job.progress_current}:${job.progress_total}:${job.updated_at}`;
        if (fingerprint === previousFingerprint) return;
        previousFingerprint = fingerprint;
      }
    } catch {
      // The durable row remains resumable by the next task-center request.
    }
  });
}
