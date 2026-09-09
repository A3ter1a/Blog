import type { ClientJob } from "./job-client.ts";

export function getJobResultDestination(job: Pick<ClientJob, "id" | "type" | "targetId" | "resultPayload">): string | null {
  const params = new URLSearchParams({ job: job.id });
  const result = job.resultPayload && typeof job.resultPayload === "object" && !Array.isArray(job.resultPayload)
    ? job.resultPayload as Record<string, unknown> : {};
  let path: string;
  switch (job.type) {
    case "problem_ocr":
    case "markdown_review":
    case "math3_auto_classify":
    case "economics_graph_generation":
    case "document_ocr":
      path = "/create";
      if (job.targetId?.startsWith("note:")) params.set("edit", job.targetId.slice(5));
      break;
    case "math3_self_test_generation":
    case "math3_step_grade":
      path = "/tools/math3-self-test";
      if (job.targetId?.startsWith("math3-step:")) params.set("test", job.targetId.split(":")[1]);
      break;
    case "math_paper_grade":
    case "math_paper_ocr":
      path = "/tools/math-paper-ocr";
      if (job.type === "math_paper_ocr") params.set("ocrJob", job.id);
      if (typeof result.paperId === "string") params.set("paper", result.paperId);
      if (typeof result.confirmationId === "string") params.set("confirmation", result.confirmationId);
      break;
    case "english_subjective_grade":
      path = "/tools/english-training";
      if (job.targetId?.startsWith("english-round:")) {
        const [, passage, round] = job.targetId.split(":");
        params.set("passage", passage);
        params.set("round", round);
      }
      break;
    case "ai_knowledge_quiz_generation":
      path = "/tools/ai-content";
      if (job.targetId?.startsWith("quiz-proposal:")) params.set("proposal", job.targetId.slice(14));
      break;
    // Maintenance jobs have no editable study artifact; their result stays inline in the task card.
    case "markdown_migration":
    case "rag_index":
    case "batch_grade": return null;
  }
  return `${path}?${params}`;
}

/** Limit automatic result recovery to the explicitly opened task. Active jobs remain visible. */
export function selectJobResults(jobs: ClientJob[], requestedJobId: string | null | undefined): ClientJob[] {
  if (requestedJobId === null) return jobs;
  const selected = jobs.find((job) => job.id === requestedJobId);
  const remaining = jobs.filter((job) => job.id !== requestedJobId && job.status !== "succeeded" && job.status !== "claimed");
  return selected ? [selected, ...remaining] : remaining;
}
