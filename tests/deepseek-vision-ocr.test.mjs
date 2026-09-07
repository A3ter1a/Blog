import assert from "node:assert/strict";
import test from "node:test";
import { callDeepSeekVision } from '../lib/ai-client.ts';
import { recognizeProblemImage } from '../lib/problem-ocr-service.ts';

test('DeepSeek Vision OCR sends official multimodal payload', async()=>{
 const old=globalThis.fetch; let body;
 globalThis.fetch=async(_url,init)=>{body=JSON.parse(init.body);return new Response(JSON.stringify({choices:[{message:{content:'1. 求导数'},finish_reason:'stop'}],usage:{total_tokens:12}}),{headers:{'Content-Type':'application/json'}})};
 try { const result=await callDeepSeekVision('sk-test','aGVsbG8=','只提取文字','image/png'); assert.equal(result.text,'1. 求导数'); assert.equal(body.model,'deepseek-v4-flash-vision-exp'); assert.equal(body.messages[0].content[1].type,'image_url'); assert.equal(body.messages[0].content[1].image_url.detail,'original'); assert.deepEqual(body.thinking,{type:'disabled'}); } finally { globalThis.fetch=old; }
});

test('problem OCR prefers DeepSeek Vision when configured', async()=>{
 let qwenCalls=0, deepseekCalls=0;
 const result=await recognizeProblemImage({apiKey:'sk-test',model:'deepseek-v4-flash-vision-exp',imageBase64:'aGVsbG8=',mimeType:'image/jpeg',provider:'deepseek'},async()=>{qwenCalls++;return {text:''};},async()=>{deepseekCalls++;return {text:'1. 求导数',tokensUsed:3};});
 assert.equal(result.model,'deepseek-v4-flash-vision-exp'); assert.equal(result.text,'1. 求导数'); assert.equal(deepseekCalls,1); assert.equal(qwenCalls,0);
});

import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { normalizeAIConfig } from '../lib/ai-config.ts';

test('OCR task registration persists provider and keeps legacy Qwen default', async () => {
 const source=readFileSync(new URL('../lib/server-internal-job-runner.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('runner.ts',source,ts.ScriptTarget.Latest,true);
 const node=ast.statements.find(item=>ts.isFunctionDeclaration(item)&&item.name?.text==='enqueueProblemOcrItems');
 const compiled=ts.transpileModule(node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 const calls=[];
 const enqueue=new Function('callRpcRows','calculateMarkdownChecksum','PROBLEM_OCR_BUCKET',compiled+'; return enqueueProblemOcrItems;')(async(_db,_rpc,args)=>calls.push(args),async()=> 'checksum','fixture-bucket');
 const assets=[{path:'fixture/image.png',name:'test.png',mimeType:'image/png'}];
 for(const provider of ['deepseek','qwen',undefined]) await enqueue({},'job',assets,[],'qwen3.7-plus','deepseek-v4-flash',provider);
 assert.deepEqual(calls.map(call=>call.p_payload.ocrProvider),['deepseek','qwen','qwen']);
 assert.equal(normalizeAIConfig({}).ocrProvider,'deepseek');
 assert.equal(normalizeAIConfig({ocrProvider:'qwen'}).ocrProvider,'qwen');
 const hook=readFileSync(new URL('../hooks/useAIScan.ts',import.meta.url),'utf8');
 assert.match(hook,/ocrProvider: config.ocrProvider/);
 const configRoute=readFileSync(new URL('../app/api/ai/config/route.ts',import.meta.url),'utf8');
 assert.match(configRoute,/const apiKey = provider === 'deepseek' \|\| provider === 'deepseek-ocr'/);
});
