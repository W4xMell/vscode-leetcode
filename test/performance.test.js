const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const {RefreshQueue} = require('../out/src/utils/RefreshQueue');
const {LazyInitialization} = require('../out/src/utils/LazyInitialization');
const turn = () => new Promise(resolve=>setImmediate(resolve));

test('refresh bursts retain one pending refresh and full refresh subsumes progress', async () => {
  const calls=[]; let release;
  const blocked=new Promise(resolve=>{release=resolve;});
  const queue=new RefreshQueue(async priority=>{calls.push(priority);if(calls.length===1) await blocked;});
  const first=queue.request(2); await turn();
  const requests=Array.from({length:50},()=>queue.request(1));
  requests.push(queue.request(2)); release();
  await Promise.all([first,...requests]);
  assert.deepEqual(calls,[2,2]);
});

test('refresh failures are reported and a later refresh can recover', async () => {
  let fail=true;
  const queue=new RefreshQueue(async()=>{if(fail) throw new Error('invalid plan');});
  await assert.rejects(queue.request(2),/invalid plan/);
  fail=false; await queue.request(2);
});

test('lazy initialization does no eager work and concurrent/repeated callers share one attempt', async () => {
  let calls=0;
  const lazy=new LazyInitialization(async()=>{calls++;});
  await turn(); assert.equal(calls,0);
  await Promise.all(Array.from({length:50},()=>lazy.ensure()));
  await lazy.ensure(); assert.equal(calls,1);
  lazy.invalidate(); await lazy.ensure(); assert.equal(calls,2);
});

test('failed initialization retries, and configuration invalidation serializes with an in-flight attempt', async () => {
  let calls=0,release;
  const blocked=new Promise(resolve=>{release=resolve;});
  const lazy=new LazyInitialization(async()=>{calls++;if(calls===1) throw new Error('missing node');if(calls===2) await blocked;});
  await assert.rejects(lazy.ensure(),/missing node/);
  const first=lazy.ensure(); await turn(); lazy.invalidate(); const changed=lazy.ensure();
  await turn(); assert.equal(calls,2,'configuration change must not run initialization in parallel');
  release(); await Promise.all([first,changed]); assert.equal(calls,3);
});

let runtime;
const disposable={dispose(){}};
const example=path.resolve(__dirname,'../examples/custom-plan');
const plan=JSON.parse(fs.readFileSync(path.join(example,'data/custom-plan.json'),'utf8'));
const markdown=fs.readFileSync(path.join(example,'PLAN.md'),'utf8');
const vscode={
  EventEmitter:class { constructor(){this.event=()=>disposable;} fire(){} dispose(){} },
  Uri:{file:fsPath=>({fsPath,scheme:'file'})},
  RelativePattern:class {},
  window:{createTreeView:()=>{runtime.view={...disposable};return runtime.view;},showTextDocument:async()=>undefined,showErrorMessage:async message=>{throw new Error(message);}},
  commands:{registerCommand:(name,handler)=>{runtime.commands.set(name,handler);return disposable;}},
  workspace:{workspaceFolders:[{uri:{scheme:'file',fsPath:example}}],getConfiguration:()=>({get:(key,fallback)=>fallback}),
    openTextDocument:async uri=>{if(path.basename(uri.fsPath)==='PLAN.md') runtime.progressReads++;return {getText:()=>runtime.text};},
    onDidChangeTextDocument:handler=>{runtime.changed=handler;return disposable;},
    onDidChangeWorkspaceFolders:()=>disposable,onDidChangeConfiguration:()=>disposable,
    createFileSystemWatcher:()=>({...disposable,onDidChange:()=>disposable,onDidCreate:()=>disposable,onDidDelete:()=>disposable})}
};
const originalLoad=Module._load;
let initializeDailyPlan;
try {
  Module._load=function(id,...args){
    if(id==='vscode') return vscode;
    if(id==='fs-extra') return {pathExists:async()=>true,readJson:async()=>{runtime.jsonReads++;return plan;}};
    if(id==='../commands/show') return {showProblem:async()=>undefined,previewProblem:async()=>undefined};
    if(id==='../explorer/explorerNodeManager') return {explorerNodeManager:{getNodeById:()=>undefined}};
    if(id==='../explorer/LeetCodeNode') return {LeetCodeNode:class {constructor(node){Object.assign(this,node);}}};
    return originalLoad.call(this,id,...args);
  };
  ({initializeDailyPlan}=require('../out/src/dailyPlan/DailyPlanProvider'));
} finally {Module._load=originalLoad;}

test('50 PLAN.md edits debounce into one progress read without reloading JSON or timer membership', async () => {
  runtime={commands:new Map(),text:markdown,jsonReads:0,progressReads:0};
  const context={workspaceState:{get:()=>undefined},subscriptions:[]};
  const timers={updateGroupSources:()=>{runtime.sourceUpdates++;},select(){}};
  runtime.sourceUpdates=0; let remoteCalls=0;
  const api=initializeDailyPlan(context,timers,async()=>{remoteCalls++;});
  await api.ready;
  const day=api.provider.getChildren()[0], first=api.provider.getChildren(day)[0];
  const local=api.provider.getChildren(day).find(element=>element.problem.kind==='custom');
  await runtime.commands.get('leetcodeStudyPlan.dailyPlan.codeNow')(local); assert.equal(remoteCalls,0);
  await runtime.commands.get('leetcodeStudyPlan.dailyPlan.preview')(first); assert.equal(remoteCalls,1);
  const nativeSet=global.setTimeout,nativeClear=global.clearTimeout;
  const scheduled=new Map();let next=0;
  global.setTimeout=callback=>{scheduled.set(++next,callback);return next;};
  global.clearTimeout=id=>scheduled.delete(id);
  try {
    runtime.text=markdown.replace('- [ ]','- [x]');
    for(let edit=0;edit<50;edit++) runtime.changed({document:{uri:{fsPath:path.join(example,'PLAN.md')}}});
    assert.equal(scheduled.size,1);
    for(const callback of scheduled.values()) callback(); await turn();
    assert.equal(runtime.jsonReads,1);assert.equal(runtime.progressReads,2);assert.equal(runtime.sourceUpdates,1);
    assert.equal(api.provider.isDone(first),true);assert.equal(api.provider.getChildren()[0],day,'progress must preserve existing Day/problem nodes');
    await Promise.all(Array.from({length:50},()=>api.refresh()));
    assert.equal(runtime.jsonReads,2);assert.equal(runtime.sourceUpdates,2);
    runtime.text='## Day 1\n- [ ] 1. First\n- [ ] 1. Duplicate';
    runtime.changed({document:{uri:{fsPath:path.join(example,'PLAN.md')}}});
    const fireScheduled=()=>{const callbacks=[...scheduled.values()];scheduled.clear();for(const callback of callbacks) callback();};
    fireScheduled();await turn();
    assert(runtime.view.message.includes('Duplicate'));
    assert.equal(api.provider.isDone(api.provider.getChildren(api.provider.getChildren()[0])[0]),true,'invalid progress must keep valid completion data');
    runtime.text=markdown;
    runtime.changed({document:{uri:{fsPath:path.join(example,'PLAN.md')}}});
    fireScheduled();await turn();
    assert.equal(runtime.view.message,undefined,'a successful progress update must clear its previous error');
    assert.equal(api.provider.isDone(api.provider.getChildren(api.provider.getChildren()[0])[0]),false);
    assert.equal(runtime.jsonReads,2,'progress error recovery must not reload plan structure');
  } finally {
    for(const item of context.subscriptions) item.dispose();
    global.setTimeout=nativeSet;global.clearTimeout=nativeClear;
  }
});
