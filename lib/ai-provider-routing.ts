export type AITaskClass = "fast_retrieval" | "deep_reasoning" | "vision_ocr" | "batch_cleanup";

export type AIProviderRoute = {
  provider: "deepseek" | "qwen";
  model: string;
  reason: string;
};

export function resolveAIProviderRoute(task: AITaskClass): AIProviderRoute {
  if (task === "vision_ocr") {
    return { provider: "qwen", model: "qwen3.7-plus", reason: "需要图片输入和公式 OCR" };
  }
  if (task === "deep_reasoning") {
    return { provider: "deepseek", model: "deepseek-v4-pro", reason: "复杂推理与经济学串联优先质量" };
  }
  return {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    reason: task === "batch_cleanup" ? "批处理优先成本和吞吐" : "资料定位优先速度",
  };
}
