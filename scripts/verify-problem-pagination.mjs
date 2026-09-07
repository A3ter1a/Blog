import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const factories = [];
const add = (id, code) => factories.push(`${JSON.stringify(id)}:function(module,exports,require){${code}\n}`);
for (const [id, file] of Object.entries({ react:'react/cjs/react.production.js', 'react/jsx-runtime':'react/cjs/react-jsx-runtime.production.js', 'react-dom':'react-dom/cjs/react-dom.production.js', 'react-dom/client':'react-dom/cjs/react-dom-client.production.js', scheduler:'scheduler/cjs/scheduler.production.js' })) add(id, readFileSync(`node_modules/${file}`, 'utf8'));
const source = readFileSync('components/notes/NoteReaderClient.tsx','utf8');
const parsed = ts.createSourceFile('reader.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const mocked = new Map();
for(const statement of parsed.statements) {
 if(!ts.isImportDeclaration(statement)) continue;
 const id=statement.moduleSpecifier.text;
 if(id==='react')continue;
 const names=statement.importClause?.namedBindings;
 const exports=names&&ts.isNamedImports(names)?names.elements.filter(e=>!e.isTypeOnly).map(e=>`exports.${e.propertyName?.text||e.name.text}=()=>null;`).join(''):'';
 mocked.set(id,exports+(statement.importClause?.name?'exports.default=()=>null;':''));
}
mocked.set('next/link',"exports.default=({children,href})=>require('react').createElement('a',{href},children);");
mocked.set('next/navigation','const router={back(){},push(){}};exports.useRouter=()=>router;');
mocked.set('@/hooks/useAdminAuth',"const state={isAdmin:false,user:null};exports.useAdminAuth=()=>state;");
mocked.set('@/components/ui/Toast','const toast={success(){},error(){}};exports.useToast=()=>toast;');
mocked.set('@/lib/types',"exports.typeMap={problem:'题集'};exports.subjectMap={math:'数学'};");
mocked.set('@/lib/useReadingPreferences',"exports.useReadingPreferences=()=>({preferences:{tocPosition:'hidden',fontSize:16,lineHeight:1.72}});");
mocked.set('@/lib/utils',"exports.stripRedundantLeadingMarkdownTitle=x=>x;exports.estimateReadingTime=()=>1;exports.getDescendantIds=id=>new Set([id]);");
mocked.set('@/lib/chapter-utils','exports.getRootChapters=chapters=>chapters;');
mocked.set('@/lib/math3-practice','exports.getPracticeProblemKey=(n,p)=>n+p;exports.getVisibleNoteTags=x=>x;');
mocked.set('@/lib/booklet-contract','exports.extractBookletSourceManifest=()=>[];');
mocked.set('@/lib/chapters-api','exports.chaptersApi={getByNoteId:async()=>window.fixtureChapters};');
mocked.set('@/lib/supabase','exports.notesApi={getAiAuthorProfile:async()=>null,getById:async()=>window.fixtureNote,getPublishedById:async()=>window.fixtureNote};');
mocked.set('@/lib/note-reader-cache',(mocked.get('@/lib/note-reader-cache')||'')+'exports.normalizeNoteReaderValue=x=>x;exports.noteReaderValuesEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);exports.readOwnerNoteCache=()=>({value:window.fixtureNote,stale:false});');
mocked.set('@/components/problems/ProblemCard',"exports.ProblemCard=({problem})=>require('react').createElement('div',{'data-problem':problem.id,id:'problem-'+problem.id},problem.question);");
mocked.set('@/components/chapters/ChapterFilter',"exports.ChapterFilter=({onSelect,chapters})=>require('react').createElement('div',null,chapters.map(c=>require('react').createElement('button',{key:c.id,onClick:()=>onSelect(c.id)},'筛选'+c.name)));");
mocked.set('@/lib/markdown','exports.extractTocItems=()=>[];');
for(const [id,code] of mocked)add(id,code);
add('reader',ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText);
const bundle=`const process={env:{NODE_ENV:'production'}};const factories={${factories.join(',')}},loaded={};function require(id){if(!loaded[id]){const m=loaded[id]={exports:{}};factories[id](m,m.exports,require)}return loaded[id].exports}const React=require('react');const grouped=location.pathname==='/grouped';window.fixtureChapters=grouped?[{id:'c1',name:'第一章'},{id:'c2',name:'第二章'}]:[];window.fixtureNote={id:'fixture',type:'problem',title:'30 道题的题集',content:'',tags:[],videos:[],problems:Array.from({length:30},(_,i)=>({id:'p'+(i+1),question:'题目 '+(i+1),chapterId:i<26?'c1':'c2'})),createdAt:new Date(),updatedAt:new Date()};const root=require('react-dom/client').createRoot(document.getElementById('root'));const props={noteId:'fixture',initialNote:window.fixtureNote,...(grouped?{initialChapters:window.fixtureChapters,initialChaptersLoaded:true}:{accessScope:'owner'})};root.render(React.createElement(require('reader').NoteReaderClient,props));`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle:'<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 const outcomes=[];
 for(const [path,total] of [['/',30],['/grouped',26]]) {
  await page.goto(`http://127.0.0.1:${server.address().port}${path}`);
  await page.locator('[data-problem]').first().waitFor({timeout:3000});
  await page.waitForTimeout(100);
  const initial=await page.locator('[data-problem]').count();
  await page.getByRole('button',{name:/继续加载/}).click();
  await page.waitForTimeout(150);
  const afterClick=await page.locator('[data-problem]').count();
  console.log(JSON.stringify({path,initial,afterClick,errors}));
  assert.equal(initial,12);assert.equal(afterClick,24,'Load more must remain at 24 after reset effects settle');
  await page.getByRole('button',{name:/继续加载/}).click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-problem]').count(),total);
  assert.equal(await page.getByRole('button',{name:/继续加载/}).count(),0);
    if(path==='/grouped') {
   await page.getByRole('button',{name:'题集导航',exact:true}).click();
   await page.getByRole('button',{name:'筛选第二章'}).click();
   await page.waitForTimeout(100);
   assert.equal(await page.locator('[data-problem]').count(),4);
   await page.getByRole('button',{name:'筛选第一章'}).click();
   await page.waitForTimeout(100);
   assert.equal(await page.locator('[data-problem]').count(),12);
   await page.getByRole('button',{name:/继续加载/}).click();
   await page.waitForTimeout(100);
   assert.equal(await page.locator('[data-problem]').count(),24);
  }
  outcomes.push({path,counts:[12,24,total]});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',outcomes}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
