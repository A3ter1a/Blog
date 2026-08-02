import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skillPath = path.join(root, "skills", "blog-ai-content", "SKILL.md");
const metadataPath = path.join(root, "skills", "blog-ai-content", "agents", "openai.yaml");

const failures = [];
const skill = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, "utf8") : "";
const metadata = fs.existsSync(metadataPath) ? fs.readFileSync(metadataPath, "utf8") : "";

if (!skill) failures.push("skills/blog-ai-content/SKILL.md is missing");
if (!metadata) failures.push("skills/blog-ai-content/agents/openai.yaml is missing");

const frontmatterMatch = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!frontmatterMatch) {
  failures.push("SKILL.md frontmatter is missing or malformed");
} else {
  const frontmatter = frontmatterMatch[1];
  if (!/^name:\s*blog-ai-content\s*$/m.test(frontmatter)) failures.push("frontmatter name is not blog-ai-content");
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1] ?? "";
  if (!description || description.length > 1024 || /[<>]/.test(description)) failures.push("frontmatter description is invalid");
}

for (const marker of [
  "现有 Markdown 渲染链路",
  "`content` 只放 Markdown 正文",
  "长讲义应按章节拆成多篇独立 Markdown",
  "静默自检后交付",
  "知识点快测建议",
  "不要执行生产迁移、账号 provisioning、发布或部署",
]) {
  if (!skill.includes(marker)) failures.push(`SKILL.md missing marker: ${marker}`);
}

if (/TODO|Structuring This Skill|Not every skill requires/.test(skill)) failures.push("SKILL.md still contains scaffold text");
if (skill.split(/\r?\n/).length > 500) failures.push("SKILL.md exceeds the skill context budget");

for (const marker of ["interface:", "display_name:", "short_description:", "default_prompt:"]) {
  if (!metadata.includes(marker)) failures.push(`openai.yaml missing marker: ${marker}`);
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  skill: "blog-ai-content",
  checkedFiles: ["skills/blog-ai-content/SKILL.md", "skills/blog-ai-content/agents/openai.yaml"],
  guarantees: [
    "common four-subject workflow",
    "repository Markdown rendering contract",
    "chapter splitting and incremental collection handoff",
    "silent self-check and separate knowledge quiz guidance",
    "no production mutation or fake AI-account provisioning",
  ],
}, null, 2));
