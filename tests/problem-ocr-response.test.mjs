import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeProblemOcrText } from '../lib/problem-ocr-service.ts';
const input={apiKey:'test-key',model:'deepseek-v4-flash',ocrText:'1. 求函数的导数。\n2. 计算定积分。'};

test('OCR analysis accepts structured questions with stem and option text without rescue calls',async()=>{
 let calls=0;
 const result=await analyzeProblemOcrText(input,async()=>{
  calls++;
  return {content:JSON.stringify({questions:[{stem:'求函数的导数。',type:'choice',options:[{label:'A',text:'1'},{label:'B',text:'2'}]}]}),tokensUsed:12};
 });
 assert.equal(result.problems.length,1);
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
 assert.equal(result.extractedProblems.length,1);
 assert.equal(result.extractedProblems[0].question,input.ocrText);
 assert.match(result.extractedProblems[0].answer,/（1）2/);
 assert.match(result.extractedProblems[0].answer,/（2）1/);
 assert.equal(result.extractedProblems[0].chapterId,'chapter-1');
 assert.equal(result.warnings.length,0);
});

test('unusable structured values do not become object-string problem statements',async()=>{
 const result=await analyzeProblemOcrText({...input,ocrText:'这是一张纯色背景图片。'},async()=>({content:JSON.stringify({problems:[{question:{text:'unsupported'}}]}),tokensUsed:1}));
 assert.equal(result.problems.length,0);
});

import { mergeSingleImageProblems } from '../lib/problem-ocr-single-image.ts';

test('one-image rule keeps a shared stem and every subquestion in one record without another AI call', async () => {
 const ocrText = '设函数 $f(x)=x^2$。\n（1）求导数。\n（2）计算积分。';
 let calls = 0;
 const result = await analyzeProblemOcrText({...input, ocrText}, async (_key, _model, messages) => {
  calls++;
  assert.match(messages[0].content, /EXACTLY ONE/);
  assert.match(messages[0].content, /NEVER split/);
  return { content: JSON.stringify({problems:[{question:'求导数',answer:'2x'},{question:'计算积分',answer:'x^3/3+C'}]}), tokensUsed: 5 };
 });
 assert.equal(calls, 1);
 assert.equal(result.problems.length, 1);
 assert.equal(result.problems[0].question, ocrText);
 assert.match(result.problems[0].answer, /2x/);
 assert.match(result.problems[0].answer, /x\^3/);
 assert.match(result.warning, /小问/);
});

test('legacy five-image OCR results are merged by image without rewriting the stored payload', () => {
 const captures = Array.from({length:5}, (_, index) => ({
  imageIndex:index+1,imageCount:5,imageName:`${index+1}.png`,ocrText:`公共题干 ${index+1}\n（1）求导数\n（2）计算积分`,
  problems:[{question:'求导数',answer:'2x'},{question:'计算积分',answer:'积分答案'}],qwenModel:'fixture',deepseekModel:'fixture',tokensUsed:5,
 }));
 const legacy = {resultVersion:1,totalImages:5,completedImages:5,failedImages:0,extractedProblems:captures.flatMap(c=>c.problems),
 imageProgress:captures.map((c,index)=>({index,name:c.imageName,status:'complete',message:'提取到 2 道题',problemCount:2})),warnings:[],captures};
 const original = JSON.stringify(legacy);
 const result = extractProblemOcrJobResult(legacy);
 assert.equal(result.extractedProblems.length,5);
 assert.ok(result.captures.every(c=>c.problems.length===1));
 assert.ok(result.imageProgress.every(c=>c.problemCount===1));
 assert.equal(result.warnings.length,5);
 assert.equal(JSON.stringify(legacy),original);
 assert.deepEqual(mergeSingleImageProblems([], '空图片'), []);
});
