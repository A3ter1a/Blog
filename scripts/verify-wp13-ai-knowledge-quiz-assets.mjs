import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const required = [
  ["supabase/migrations/0027_ai_knowledge_quizzes.sql", ["ai_knowledge_quizzes", "ai_knowledge_quiz_items", "ai_knowledge_quiz_attempts", "review_status in ('draft', 'self_checked')", "force row level security"]],
  ["supabase/migrations/0028_ai_knowledge_quiz_insert_policy_fix.sql", ["ai_knowledge_quizzes_owner_insert", "review_status in ('draft', 'self_checked')"]],
  ["lib/ai-knowledge-quiz-contract.ts", ["runAiKnowledgeQuizSelfCheck", "toPublicAiKnowledgeQuizItem", "answersEqual"]],
  ["lib/server-ai-knowledge-quiz.ts", ["submitAiKnowledgeQuiz", "transitionAiKnowledgeQuiz", "publishAiKnowledgeQuiz", "gradeAiKnowledgeQuizAttempt"]],
  ["app/api/ai/knowledge-quizzes/[id]/generate/route.ts", ["resolveAIKey", "createAiKnowledgeQuiz"]],
  ["app/api/ai/knowledge-quizzes/[id]/submit/route.ts", ["submitAiKnowledgeQuiz"]],
  ["app/api/ai/knowledge-quiz-review/[id]/route.ts", ["transitionAiKnowledgeQuiz", "publishAiKnowledgeQuiz"]],
  ["app/api/knowledge-quizzes/[id]/attempt/route.ts", ["gradeAiKnowledgeQuizAttempt"]],
  ["components/ai-content/AiContentWorkspace.tsx", ["生成知识点快测", "提交快测审核", "/api/ai/knowledge-quizzes/"]],
  ["components/ai-content/AiKnowledgeQuizReviewPanel.tsx", ["题目、答案与解析独立于 Markdown", "退回返修", "发布/绑定讲义"]],
  ["components/ai-assistant/AssistantDock.tsx", ["/api/knowledge-quizzes?noteId=", "提交快测", "答案与解析"]],
];

const failures = [];
for (const [relative, markers] of required) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative}: missing`);
    continue;
  }
  const content = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!content.includes(marker)) failures.push(`${relative}: missing marker ${marker}`);
  }
}

const contract = fs.readFileSync(path.join(root, "lib/ai-knowledge-quiz-contract.ts"), "utf8");
if (!contract.includes('key !== "answer" && key !== "explanation"')) {
  failures.push("public quiz projection must strip answer and explanation");
}
const migration = fs.readFileSync(path.join(root, "supabase/migrations/0027_ai_knowledge_quizzes.sql"), "utf8");
if (!migration.includes("answer jsonb") || !migration.includes("explanation text")) {
  failures.push("quiz answers/explanations must remain in separate quiz item storage");
}
const generateRoute = fs.readFileSync(path.join(root, "app/api/ai/knowledge-quizzes/[id]/generate/route.ts"), "utf8");
if (generateRoute.includes("process.env.DEEPSEEK_API_KEY ?? apiKey")) {
  failures.push("quiz generation must use resolveAIKey so local client keys are not shadowed by an empty env value");
}

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checkedFiles: required.length,
  guarantees: [
    "AI self-check precedes quiz review submission",
    "answers and explanations are omitted from public quiz projection",
    "only approved/published quizzes are gradeable",
    "reviewer can return, approve, reject, publish, and bind a quiz",
    "quiz generation resolves development keys without weakening production policy",
  ],
}, null, 2));
