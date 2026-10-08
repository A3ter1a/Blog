export type NoteSaveFailureTone = "info" | "error";

export interface NoteSaveFailure {
  tone: NoteSaveFailureTone;
  message: string;
}

export function getNoteSaveFailure(error: unknown): NoteSaveFailure {
  const rawMessage = error instanceof Error ? error.message : "";
  const isTransient = /temporarily unavailable|fetch failed|network|timeout|timed out|econnreset|aborted|service unavailable|服务暂时|网络|超时/i.test(rawMessage);

  if (isTransient) {
    return {
      tone: "info",
      message: "保存请求暂时没有得到服务器确认，当前内容已保留在本机草稿中。请稍后重试，避免重复提交。",
    };
  }

  if (/没有返回笔记 ID|没有返回笔记编号/i.test(rawMessage)) {
    return {
      tone: "info",
      message: "服务器没有返回确认编号，请先回到笔记列表确认；当前草稿仍已保留。",
    };
  }

  return {
    tone: "error",
    message: "保存失败，当前内容已保留在本机草稿中，请稍后重试。",
  };
}
