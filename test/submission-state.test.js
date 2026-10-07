const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

class TreeEvent {
  listeners = new Set();
  event = listener => {this.listeners.add(listener);return {dispose:()=>this.listeners.delete(listener)};};
  fire(value) {for(const listener of this.listeners) listener(value);}
  dispose() {this.listeners.clear();}
}
const root=path.resolve(__dirname,'../examples/custom-plan');
const disposable={dispose(){}};
const commands=new Map();
let site='leetcode-cn', configChanged;
const vscode={
  env:{appName:'Code'},EventEmitter:TreeEvent,
  TreeItem:class {constructor(label){this.label=label;}},TreeItemCollapsibleState:{Collapsed:1},
  ThemeIcon:class {constructor(id,color){this.id=id;this.color=color;}},ThemeColor:class {constructor(id){this.id=id;}},
  Uri:{file:fsPath=>({fsPath,scheme:'file'})},RelativePattern:class {},
  window:{createTreeView:()=>disposable},
  commands:{registerCommand:(id,handler)=>{commands.set(id,handler);return disposable;}},
  workspace:{workspaceFolders:[{uri:{fsPath:root,scheme:'file'}}],getConfiguration:()=>({get:(key,fallback)=>fallback}),
    openTextDocument:async()=>({getText:()=>''}),onDidChangeConfiguration:handler=>{configChanged=handler;return disposable;},
    onDidChangeTextDocument:()=>disposable,onDidChangeWorkspaceFolders:()=>disposable,
    createFileSystemWatcher:()=>({...disposable,onDidChange:()=>disposable,onDidCreate:()=>disposable,onDidDelete:()=>disposable})}
};
let LocalSubmissionStore,localSubmissionStore,isAcceptedSubmission,DailyPlanProvider,initializeDailyPlan;
const originalLoad=Module._load;
try {
  Module._load=function(id,...args){
    if(id==='vscode') return vscode;
    if(id==='../commands/plugin') return {getLeetCodeEndpoint:()=>site};
    if(id==='../commands/show') return {};
    if(id==='../explorer/explorerNodeManager') return {explorerNodeManager:{getNodeById:()=>({state:1})}};
    return originalLoad.call(this,id,...args);
  };
  ({LocalSubmissionStore,localSubmissionStore,isAcceptedSubmission}=require('../out/src/dailyPlan/LocalSubmissionStore'));
  ({DailyPlanProvider,initializeDailyPlan}=require('../out/src/dailyPlan/DailyPlanProvider'));
} finally {Module._load=originalLoad;}
const context=()=>{
  const values=new Map();
  return {subscriptions:[],workspaceState:{get:(key,fallback)=>values.has(key)?values.get(key):fallback,update:async(key,value)=>{values.set(key,value);}}};
};
const element=(id,day=1,kind='leetcode')=>({type:'problem',day:{day,title:'Day '+day},problem:{order:1,kind,leetcodeId:id,title:'Fixture',difficulty:'Easy'}});
test.beforeEach(()=>{site='leetcode-cn';});

test('only the accepted verdict records a local success; reject WA, Test output and embedded Accepted text',()=>{
  for(const output of ['  √ Accepted\n','  ✔ Accepted\r\n','  v Accepted\n','\x1b[32m  √ Accepted\x1b[0m\n']) assert.equal(isAcceptedSubmission(output),true);
  for(const output of ['  × Wrong Answer\n','  √ Output: Accepted\n','  √ Answer: Accepted\n','  × Accepted\n','Accepted','[ERROR] Accepted','  √ 10/10 cases passed (10 ms)\n','  × Wrong Answer\n  × Stdout: output\n  √ Accepted\n']) assert.equal(isAcceptedSubmission(output),false);
});

test('local accepted submissions persist across store recreation and isolate workspace roots/sites/special IDs',async()=>{
  const storage=context();const first=new LocalSubmissionStore();first.initialize(storage);
  await first.recordAccepted(root,site,'1');
  await first.recordAccepted(root,site,'LCP 01');
  const reloaded=new LocalSubmissionStore();reloaded.initialize(storage);
  assert.equal(reloaded.isAccepted(root,site,'1'),true);
  assert.equal(reloaded.isAccepted(root,site,'LCP 01'),true);
  assert.equal(reloaded.isAccepted(root+'/other',site,'1'),false);
  assert.equal(reloaded.isAccepted(root,'leetcode','1'),false);
  assert.equal(reloaded.isAccepted(root,site,'20'),false);
  first.dispose();reloaded.dispose();
});

test('online AC and PLAN.md checkboxes do not mark LeetCode practice as done locally',()=>{
  const store=new LocalSubmissionStore();store.initialize(context());
  const provider=new DailyPlanProvider(store);provider.root=root;
  provider.progress.set('1:1',{done:true});
  assert.equal(provider.isPracticeCompleted(element(1)),true);
  assert.equal(provider.isDone(element(1)),false);
  assert.doesNotMatch(provider.getTreeItem(element(1)).description,/AC/);
  assert.equal(provider.getTreeItem(element(1)).iconPath.id,'circle-outline');
  assert.equal(provider.isDone(element(1,1,'custom')),true,'local exercises keep manual completion');
  provider.dispose();store.dispose();
});

test('one local AC marks every review occurrence done and contributes to group counts without rewriting PLAN.md',async()=>{
  const store=new LocalSubmissionStore();store.initialize(context());
  await store.recordAccepted(root,site,'1');
  const provider=new DailyPlanProvider(store);provider.root=root;
  for(const entry of [element(1),element(1,2)]) {
    assert.equal(provider.isDone(entry),true);
    assert.equal(provider.isPracticeCompleted(entry),false);
    const item=provider.getTreeItem(entry);
    assert.equal(item.description,'Easy · AC');assert.equal(item.iconPath.color.id,'testing.iconPassed');
    assert.match(item.tooltip,/via this extension/);
  }
  assert.equal(provider.getTreeItem({type:'day',day:element(1).day,problems:[element(1),element(20)]}).description,'1/2');
  assert.equal(provider.isDone(element(1,1,'custom')),false);
  provider.dispose();store.dispose();
});

test('record notifications follow successful persistence, duplicates are idempotent and write failures stay pending',async()=>{
  const store=new LocalSubmissionStore();const storage=context();store.initialize(storage);
  let changes=0;store.onDidChange(()=>changes++);
  await store.recordAccepted(root,site,'1');await store.recordAccepted(root,site,'1');assert.equal(changes,1);
  storage.workspaceState.update=async()=>{throw new Error('disk full');};
  await assert.rejects(store.recordAccepted(root,site,'20'),/disk full/);
  assert.equal(store.isAccepted(root,site,'20'),false);assert.equal(changes,1);
  store.dispose();
});

test('local plan refresh never initializes remote services; record and endpoint changes redraw the plan',async()=>{
  const storage=context();localSubmissionStore.initialize(storage);
  let remoteCalls=0;
  const api=initializeDailyPlan(storage,undefined,async()=>{remoteCalls++;});await api.ready;
  let changes=0;api.provider.onDidChangeTreeData(()=>changes++);
  await localSubmissionStore.recordAccepted(root,site,'1');assert.equal(changes,1);
  await commands.get('leetcodeStudyPlan.dailyPlan.refresh')();assert.equal(remoteCalls,0);
  const first=api.provider.getChildren(api.provider.getChildren()[0])[0];
  assert.equal(api.provider.isDone(first),true);
  site='leetcode';configChanged({affectsConfiguration:key=>key==='leetcodeStudyPlan.endpoint'});
  assert.equal(api.provider.isDone(first),false);
  site='leetcode-cn';assert.equal(api.provider.isDone(first),true);
  for(const item of storage.subscriptions) item.dispose();
  assert.equal(localSubmissionStore.changed.listeners.size,0);
});
