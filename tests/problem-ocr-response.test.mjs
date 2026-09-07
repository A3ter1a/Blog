import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeProblemOcrText } from '../lib/problem-ocr-service.ts';
const input={apiKey:'test-key',model:'deepseek-v4-flash',ocrText:'1. 求函数的导数。\n2. 计算定积分。'};

test('OCR analysis accepts structured questions with stem and option text without rescue calls',async()=>{
 let calls=0;
 const result=await analyzeProblemOcrText(input,async()=>{
  calls++;
  return {content:JSON.stringify({questions:[{stem:'求函数的导数。',type:'choice',options:[{label:'A',text:'1'},{label:'B',text:'2'}]},{stem:'计算定积分。',type:'calculation'}]}),tokensUsed:12};
 });
 assert.equal(result.problems.length,2);
 assert.equal(result.problems[0].options[1].content,'2');
 assert.equal(result.extractionMode,'primary');
 assert.equal(calls,1);
});

test('OCR extraction and repair explicitly use non-thinking JSON mode',async()=>{
 const calls=[];
 await analyzeProblemOcrText(input,async(_key,_model,_messages,options)=>{
  calls.push(options);
  return {content:calls.length===1?'{broken':JSON.stringify({problems:[{question:'求函数的导数。'}]}),tokensUsed:1};
 });
 assert.equal(calls.length,2);
 for(const options of calls){assert.equal(options.thinking,'disabled');assert.equal(options.responseFormat,'json_object');assert.ok(options.maxTokens>=8192);}
});

test('truncated output is not accepted as a complete scan or silently repaired to fewer questions',async()=>{
 let calls=0;
 await assert.rejects(()=>analyzeProblemOcrText(input,async()=>{
  calls++;
  return {content:'{"problems":[{"question":"求函数的导数。"}]}',finishReason:'length',tokensUsed:8192};
 }),/截断/);
 assert.equal(calls,1);
});
import { callDeepSeek } from '../lib/ai-client.ts';
import { materializeProblemOcrProblem, buildProblemOcrJobResult, extractProblemOcrJobResult } from '../lib/problem-ocr-contract.ts';

test('DeepSeek HTTP payload forwards OCR settings and exposes truncation metadata',async()=>{
 const previousFetch=globalThis.fetch;
 let sent;
 globalThis.fetch=async(_url,init)=>{
  sent=JSON.parse(init.body);
  return new Response(JSON.stringify({choices:[{message:{content:'{}'},finish_reason:'length'}],usage:{total_tokens:9}}),{headers:{'Content-Type':'application/json'}});
 };
 try {
  const result=await callDeepSeek('test-key',input.model,[{role:'user',content:'fixture'}],{thinking:'disabled',maxTokens:8192,responseFormat:'json_object'});
  assert.deepEqual(sent.thinking,{type:'disabled'});
  assert.deepEqual(sent.response_format,{type:'json_object'});
  assert.equal(sent.max_tokens,8192);
  assert.equal(result.finishReason,'length');
 }finally{globalThis.fetch=previousFetch;}
});

test('recognized structured questions survive task materialization and browser result decoding',async()=>{
 const analyzed=await analyzeProblemOcrText(input,async()=>({content:JSON.stringify({questions:[{stem:'求函数导数。',answer:'2',suggestedChapter:'导数'},{stem:'计算定积分。',answer:'1'}]}),tokensUsed:10}));
 const problems=analyzed.problems.map(problem=>materializeProblemOcrProblem(problem,input.ocrText,[{id:'chapter-1',name:'导数'}])).filter(Boolean);
 const result=extractProblemOcrJobResult(buildProblemOcrJobResult([{imageIndex:1,imageCount:1,imageName:'sample.png',ocrText:input.ocrText,problems,qwenModel:'fixture-vision',deepseekModel:input.model,tokensUsed:10}]));
 assert.equal(result.extractedProblems.length,2);
 assert.equal(result.extractedProblems[0].chapterId,'chapter-1');
 assert.equal(result.warnings.length,0);
});

test('unusable structured values do not become object-string problem statements',async()=>{
 const result=await analyzeProblemOcrText({...input,ocrText:'这是一张纯色背景图片。'},async()=>({content:JSON.stringify({problems:[{question:{text:'unsupported'}}]}),tokensUsed:1}));
 assert.equal(result.problems.length,0);
});
