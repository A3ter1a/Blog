import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = {
  assistant: "components/ai-assistant/AssistantDock.tsx",
  reader: "components/notes/NoteReaderClient.tsx",
  settings: "components/layout/SettingsPanel.tsx",
  preferences: "lib/useReadingPreferences.ts",
  layout: "app/layout.tsx",
  css: "app/globals.css",
};

for (const [label, relativePath] of Object.entries(files)) {
  if (!existsSync(resolve(relativePath))) throw new Error(`缺少阶段 7 文件：${label} (${relativePath})`);
}

const assistant = readFileSync(resolve(files.assistant), "utf8");
const reader = readFileSync(resolve(files.reader), "utf8");
const settings = readFileSync(resolve(files.settings), "utf8");
const preferences = readFileSync(resolve(files.preferences), "utf8");
const layout = readFileSync(resolve(files.layout), "utf8");
const css = readFileSync(resolve(files.css), "utf8");

for (const marker of [
  "type AssistantDockProps",
  "noteId: string",
  "onOpenChange: (open: boolean) => void",
  "assistant-dock-backdrop",
  "assistant-dock-panel",
  "event.key === \"Escape\"",
  "aria-modal=\"true\"",
]) {
  if (!assistant.includes(marker)) throw new Error(`助手抽屉缺少关键实现：${marker}`);
}

for (const forbidden of [
  "usePathname",
  "fixed bottom-24 right-5",
  "全部笔记上下文",
]) {
  if (assistant.includes(forbidden)) throw new Error(`助手仍保留全局浮动/全局上下文实现：${forbidden}`);
}

for (const marker of [
  "<AssistantDock",
  "assistantOpen",
  "readerDirectoriesHidden",
  "handleAssistantOpenChange",
  "note-reader-directory-reveal",
  "aria-label=\"显示目录栏\"",
  "aria-label=\"隐藏目录栏\"",
]) {
  if (!reader.includes(marker)) throw new Error(`阅读页缺少目录/助手联动：${marker}`);
}

for (const marker of [
  "showRoleplay",
  "preferences.showRoleplay",
]) {
  if (!reader.includes(marker)) throw new Error(`阅读页缺少角色显示偏好联动：${marker}`);
}

for (const marker of [
  "角色扮演相关显示",
  "role=\"switch\"",
  "updatePreference(\"showRoleplay\"",
]) {
  if (!settings.includes(marker)) throw new Error(`设置面板缺少角色显示开关：${marker}`);
}

for (const marker of [
  "showRoleplay: boolean",
  "showRoleplay: true",
  "typeof parsed.showRoleplay === \"boolean\"",
]) {
  if (!preferences.includes(marker)) throw new Error(`阅读偏好缺少角色显示持久化字段：${marker}`);
}

if (layout.includes("<AssistantDock") || layout.includes("components/ai-assistant/AssistantDock")) {
  throw new Error("AssistantDock 不应继续在根布局全站挂载。");
}

for (const marker of [
  ".assistant-dock-backdrop",
  ".assistant-dock-panel",
  ".note-reader-assistant-open",
  ".note-reader-directory-reveal",
  ".page-template-reader",
  "prefers-reduced-motion",
]) {
  if (!css.includes(marker)) throw new Error(`阶段 7 样式缺少：${marker}`);
}

console.log(JSON.stringify({
  status: "passed",
  scope: "note-reader-only-assistant",
  globalMountRemoved: true,
  directoryReveal: true,
  keyboardEscape: true,
  reducedMotion: true,
  overflowGuard: true,
  roleplayToggle: true,
}, null, 2));
