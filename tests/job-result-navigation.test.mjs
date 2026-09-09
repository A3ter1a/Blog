import assert from 'node:assert/strict';
import test from 'node:test';
import { getJobResultDestination } from '../lib/job-result-navigation.ts';

test('all study task types have a result destination carrying the exact task id', () => {
 const expected = {
  document_ocr:'/create',problem_ocr:'/create',markdown_review:'/create',math3_auto_classify:'/create',economics_graph_generation:'/create',
  math3_self_test_generation:'/tools/math3-self-test',math3_step_grade:'/tools/math3-self-test',
  math_paper_grade:'/tools/math-paper-ocr',math_paper_ocr:'/tools/math-paper-ocr',english_subjective_grade:'/tools/english-training',ai_knowledge_quiz_generation:'/tools/ai-content',
 };
 for (const [type,path] of Object.entries(expected)) {
  const url = new URL(getJobResultDestination({id:'chosen&job',type,targetId:'note:original'}),'https://fixture.invalid');
  assert.equal(url.pathname,path,type);
  assert.equal(url.searchParams.get('job'),'chosen&job',type);
  if (path==='/create') assert.equal(url.searchParams.get('edit'),'original');
 }
 for (const type of ['rag_index','markdown_migration','batch_grade']) assert.equal(getJobResultDestination({id:'job',type}),null);
});

test('destinations restore the source passage, round, test, proposal and paper', () => {
 const query = (type,targetId,resultPayload) => new URL(getJobResultDestination({id:'chosen',type,targetId,resultPayload}),'https://fixture.invalid').searchParams;
 assert.equal(query('english_subjective_grade','english-round:passage-2:3').get('passage'),'passage-2');
 assert.equal(query('english_subjective_grade','english-round:passage-2:3').get('round'),'3');
 assert.equal(query('math3_step_grade','math3-step:test-2:question:step').get('test'),'test-2');
 assert.equal(query('ai_knowledge_quiz_generation','quiz-proposal:proposal-2').get('proposal'),'proposal-2');
 const math = query('math_paper_grade','math-confirmation:confirm-2',{paperId:'paper-2',confirmationId:'confirm-2'});
 assert.equal(math.get('paper'),'paper-2');
 assert.equal(math.get('confirmation'),'confirm-2');
 assert.equal(query('problem_ocr','draft:old-draft').get('edit'),null);
 assert.equal(query('math_paper_ocr').get('ocrJob'),'chosen');
});

import { selectJobResults } from '../lib/job-result-navigation.ts';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('only the requested completed result is recovered; a new workflow can restore normal job visibility', () => {
 const jobs=[{id:'other',status:'succeeded'},{id:'active',status:'running'},{id:'chosen',status:'succeeded'}];
 assert.deepEqual(selectJobResults(jobs,'chosen').map(job=>job.id),['chosen','active']);
 assert.deepEqual(selectJobResults(jobs,undefined).map(job=>job.id),['active']);
 assert.deepEqual(selectJobResults(jobs,'missing').map(job=>job.id),['active']);
 assert.equal(selectJobResults(jobs,null),jobs);
});

test('OCR result deep link opens the scanner once and leaves it closed after manual dismissal', () => {
 const source=readFileSync(new URL('../components/problems/ProblemEditor.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('editor.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let callback;
 function visit(node){
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('openedResultRef.current')) callback=node.arguments[0];
  ts.forEachChild(node,visit);
 }
 visit(ast);assert.ok(callback);
 const code=ts.transpileModule(`const effect=${callback.getText(ast)};`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 const openedResultRef={current:null};let opens=0;
 const effect=new Function('resultJobs','requestedJobId','taskTargetId','openedResultRef','setShowAIScan',`${code};return effect;`)(
 [{id:'other',type:'problem_ocr',targetId:'note:one'},{id:'chosen',type:'problem_ocr',targetId:'note:one'}],
 'chosen','note:one',openedResultRef,()=>{opens++});
 effect();effect();
 assert.equal(opens,1);
 assert.equal(openedResultRef.current,'chosen');
});
