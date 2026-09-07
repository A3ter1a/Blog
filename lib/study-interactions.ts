export function shouldSendAssistantQuestion(event: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode?: number;
}): boolean {
  // Some input methods report 229 on the key that commits a candidate.
  return event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}

export function isQuizAnswerProvided(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.trim().length > 0;
  return Array.isArray(value) && value.length > 0;
}
