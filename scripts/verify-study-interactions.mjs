// Targeted real-React interaction fixtures. API/auth mocks never contact production.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const factories = [];
function add(id, source) { factories.push(`${JSON.stringify(id)}:function(module,exports,require){${source}\n}`); }
for (const [id, file] of Object.entries({ react: "react/cjs/react.production.js", "react/jsx-runtime": "react/cjs/react-jsx-runtime.production.js", "react-dom": "react-dom/cjs/react-dom.production.js", "react-dom/client": "react-dom/cjs/react-dom-client.production.js", scheduler: "scheduler/cjs/scheduler.production.js" })) {
  add(id, readFileSync(new URL(`../node_modules/${file}`, import.meta.url), "utf8"));
}
for (const [id, file] of Object.entries({ "@/hooks/useEnglishDraftAnswers": "hooks/useEnglishDraftAnswers.ts", "@/lib/english-draft-cache": "lib/english-draft-cache.ts", dock: "components/ai-assistant/AssistantDock.tsx", memory: "components/ai-assistant/AssistantMemoryReview.tsx", "@/lib/study-interactions": "lib/study-interactions.ts", "@/lib/assistant-memory": "lib/assistant-memory.ts" })) {
  add(id, ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText);
}
add("next/link", "exports.default = function Link(p){return require('react').createElement('a',p,p.children)};");
add("lucide-react", "module.exports = new Proxy({}, {get:()=>()=>null});");
add("framer-motion", `const React=require('react'), tags={}; exports.AnimatePresence=({children})=>children; exports.motion=new Proxy({}, {get:(_,tag)=>tags[tag]??(tags[tag]=React.forwardRef(function Motion(props,ref){const p={...props,ref}; for(const k of ['initial','animate','exit','transition','variants']) delete p[k]; return React.createElement(tag,p,p.children)}))});`);
add("@/hooks/useAdminAuth", "exports.useAdminAuth=()=>({loading:false,isAdmin:true});");
add("@/components/ui/Toast", "const toast={success:m=>window.testToasts.push(m),error:m=>window.testToasts.push(m)}; exports.useToast=()=>toast;");
add("@/components/ui/MarkdownContent", "exports.MarkdownContent=({content})=>require('react').createElement('div',null,content);");
add("@/lib/ai-config", "exports.DEFAULT_AI_CONFIG={}; exports.DEFAULT_DEEPSEEK_MODEL='fixture'; exports.ALLOW_CLIENT_AI_KEYS=false;");
add("@/lib/browser-storage", "exports.readJsonStorage=()=>({});");
add("@/lib/fetch-with-auth", "exports.buildAuthHeaders=async h=>h; exports.fetchWithAuth=(...args)=>fetch(...args);");
add("draft-fixture", `const React=require('react');
function Draft({userId}){const {answers,setAnswers,stored,storageFailed}=require('@/hooks/useEnglishDraftAnswers').useEnglishDraftAnswers(userId);return React.createElement('div',null,
 React.createElement('textarea',{'aria-label':'英语作答',value:answers['passage:1']?.q1??'',onChange:e=>setAnswers({'passage:1':{q1:e.target.value}})}),
 React.createElement('p',null,storageFailed?'暂存失败':stored?'本窗口已暂存':'正在暂存'),
 React.createElement('button',{onClick:()=>setAnswers({})},'模拟保存后清除草稿'));}
exports.default=function(){const [userId,setUserId]=React.useState('student-a');return React.createElement('div',null,React.createElement('button',{onClick:()=>setUserId(userId==='student-a'?'student-b':'student-a')},'切换账号'),React.createElement(Draft,{key:userId,userId}));};`);
const bundle = `const process={env:{NODE_ENV:'production'}}; const factories={${factories.join(",")}}, loaded={}; function require(id){if(!loaded[id]){const m=loaded[id]={exports:{}};factories[id](m,m.exports,require)}return loaded[id].exports} window.testToasts=[]; const React=require('react'); require('react-dom/client').createRoot(document.getElementById('root')).render(location.pathname==='/draft'?React.createElement(require('draft-fixture').default):location.pathname==='/memory'?React.createElement(require('memory').AssistantMemoryReview):React.createElement(require('dock').AssistantDock,{noteId:'fixture-note',noteTitle:'极限与连续',open:true,onOpenChange:()=>{}}));`;
const quiz = { quiz: { id: "fixture-quiz", title: "极限概念快测", item_count: 1 }, items: [{ id: "q1", ordinal: 1, itemType: "true_false", question: "有极限一定连续吗？", options: [] }] };
let memory = { id: "fixture-memory", content: "复习极限时先检查定义域和左右极限。", reason: "容易遗漏的解题步骤", sourcePath: "/notes/fixture-note", status: "proposed", createdAt: new Date().toISOString() };
let questions = 0;
const questionBodies = [];
let decisions = 0;
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle); }
  else if (req.url?.startsWith("/api/knowledge-quizzes?")) res.end(JSON.stringify({ quizzes: [quiz] }));
  else if (req.url?.endsWith("/attempt")) res.end(JSON.stringify({ result: { score: 100, correctCount: 1, total: 1, details: [{ itemId: "q1", correct: true, explanation: "连续还要求函数在该点有定义且等于极限。", knowledgePoints: ["连续"] }] } }));
  else if (req.url === "/api/ai/note-qa") {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); questionBodies.push(body); questions++;
    if (body.question === "生成一段可停止的回答" && questions === 2) {
      res.setHeader("Content-Type", "text/event-stream");
      res.write('data: ' + JSON.stringify({ type: "delta", delta: "已经生成的重要推导片段。" }) + '\n\n');
    } else res.end(JSON.stringify({ answer: "先比较函数值与极限值。", sources: [] }));
  }
  else if (req.url === "/api/assistant/memories" && req.method === "POST") {
    decisions++;
    if (decisions === 1) { res.statusCode = 500; res.end(JSON.stringify({ error: "模拟保存失败，请重试" })); }
    else { let raw=""; for await (const chunk of req) raw+=chunk; memory={...memory,status:JSON.parse(raw).decision}; res.end(JSON.stringify({memory})); }
  }
  else if (req.url === "/api/assistant/memories") res.end(JSON.stringify({ memories: [memory] }));
  else { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>'); }
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
let browser;
try {
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || "msedge"});
  const page=await browser.newPage();
  const errors=[]; page.on("pageerror",e=>errors.push(e.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base);
  const composer=page.getByRole("textbox",{name:"询问当前笔记"});
  await composer.fill("解释连续的条件");
  await composer.dispatchEvent("keydown",{key:"Enter",code:"Enter",isComposing:true,bubbles:true});
  await page.waitForTimeout(100);
  assert.equal(questions,0,"IME confirmation must not call the AI endpoint");
  assert.equal(await composer.inputValue(),"解释连续的条件");
  await composer.press("Enter");
  await page.getByText("先比较函数值与极限值。",{exact:true}).waitFor();
  assert.equal(questions,1);
  await page.getByRole("button",{name:"快测",exact:true}).click();
  const submit=page.getByRole("button",{name:"提交快测",exact:true});
  assert.equal(await submit.isDisabled(),true);
  const answer=page.getByRole("combobox",{name:"第 1 题答案"});
  await answer.selectOption("false");
  assert.equal(await submit.isDisabled(),false);
  await answer.selectOption("");
  assert.equal(await submit.isDisabled(),true,"Resetting a judgment answer must mean unanswered");
  await answer.selectOption("false");
  await page.getByRole("button",{name:"返回问答"}).click();
  await page.getByRole("button",{name:"快测",exact:true}).click();
  assert.equal(await answer.inputValue(),"false","Switching to chat must preserve the quiz draft");
  await submit.click();
  await page.getByText(/本次得分 100 分/).waitFor();
  assert.equal(await answer.isDisabled(),true,"Scored answers must be locked");
  await page.getByRole("button",{name:"返回问答"}).click();
  await composer.fill("生成一段可停止的回答");
  await composer.press("Enter");
  await page.getByText("已经生成的重要推导片段。",{exact:true}).waitFor();
  await page.getByRole("button",{name:"停止生成回答"}).click();
  await page.waitForTimeout(100);
  assert.equal(await page.getByText("已经生成的重要推导片段。",{exact:true}).count(),1,"Stopping must preserve the streamed content");
  await page.getByText("回答未完成 · 已保留生成片段",{exact:true}).waitFor();
  await page.reload();
  await page.getByText("回答未完成 · 已保留生成片段",{exact:true}).waitFor();
  const partial=page.locator("article").filter({hasText:"已经生成的重要推导片段。"});
  assert.equal(await partial.getByRole("button",{name:"记忆候选"}).count(),0);
  await partial.getByRole("button",{name:"重新生成",exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.assistant-message.assistant').length===2 && !document.querySelector('[aria-label="停止生成回答"]'));
  assert.equal(questionBodies.at(-1).conversation.some(message=>message.content.includes("已经生成的重要推导片段。")),false);
  await page.goto(base+"/memory");
  await page.getByText(memory.content,{exact:true}).waitFor();
  await page.getByRole("button",{name:"确认用于后续回答"}).click();
  await page.getByRole("alert").waitFor();
  await page.getByText(memory.content,{exact:true}).waitFor();
  await page.getByRole("button",{name:"确认用于后续回答"}).click();
  await page.getByRole("button",{name:/已确认 · 1/}).click();
  await page.getByText(memory.content,{exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:"确认用于后续回答"}).count(),0);
  await page.goto(base+"/draft");
  const draftInput=page.getByRole("textbox",{name:"英语作答"});
  await draftInput.fill("My unfinished translation");
  await page.getByText("本窗口已暂存",{exact:true}).waitFor();
  await page.reload();
  assert.equal(await draftInput.inputValue(),"My unfinished translation");
  await page.getByRole("button",{name:"切换账号"}).click();
  assert.equal(await draftInput.inputValue(),"");
  await page.getByRole("button",{name:"切换账号"}).click();
  assert.equal(await draftInput.inputValue(),"My unfinished translation");
  await page.getByRole("button",{name:"模拟保存后清除草稿"}).click();
  await page.getByText("本窗口已暂存",{exact:true}).waitFor();
  await page.reload();
  assert.equal(await draftInput.inputValue(),"");
  const restricted=await browser.newPage();
  await restricted.addInitScript(()=>Object.defineProperty(window,"sessionStorage",{get(){throw new Error("blocked storage");}}));
  await restricted.goto(base+"/draft");
  await restricted.getByRole("textbox",{name:"英语作答"}).fill("still editable");
  await restricted.getByText("暂存失败",{exact:true}).waitFor();
  assert.equal(await restricted.getByRole("textbox",{name:"英语作答"}).inputValue(),"still editable");
  await restricted.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:"passed",scope:"real React components with local auth/API fixtures",checks:["IME does not send","Enter sends once","unanswered quiz guard","false vs empty","quiz survives chat switch","scored answers locked","memory failure retains candidate","memory decision moves status","stopped stream persists as incomplete","retry excludes partial context","English draft survives reload","drafts isolated by account","saved draft removed","restricted storage keeps input usable"],errors},null,2));
} finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
