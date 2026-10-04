const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const Module=require('node:module');
const load=Module._load;
const noop=()=>{};
Module._load=function(id,...args){
  if(id.endsWith('/uiUtils')) return {DialogOptions:{},DialogType:{},promptForOpenOutputChannel:noop};
  if(id==='vscode') return {env:{appName:'Code'},workspace:{getConfiguration:()=>({get:(key,fallback)=>fallback}),onDidChangeConfiguration:()=>({dispose:noop})},
    window:{createOutputChannel:()=>({append:noop,appendLine:noop,dispose:noop}),withProgress:async(options,run)=>run({report:noop})},ProgressLocation:{Notification:1}};
  return load.call(this,id,...args);
};
const {leetCodeExecutor}=require('../out/src/leetCodeExecutor');
Module._load=load;

test('real child process preserves special IDs, spaced paths and literal test cases',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'leetcode spaced path '));
  const cli=path.join(dir,'fixture cli.js');
  fs.writeFileSync(cli,'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
  const original=leetCodeExecutor.getLeetCodeBinaryPath;
  try {
    assert.ok(!(await original.call(leetCodeExecutor)).includes('"'));
    leetCodeExecutor.nodeExecutable=process.execPath;
    leetCodeExecutor.getLeetCodeBinaryPath=async()=>cli;
    assert.deepEqual(JSON.parse(await leetCodeExecutor.getDescription('面试题 01.01',true)),['show','面试题 01.01','-x']);
    const filename=path.join(dir,'LCP 01.ts');
    await leetCodeExecutor.showProblem({id:'LCP 01'},'typescript',filename,false,true);
    assert.deepEqual(JSON.parse(fs.readFileSync(filename,'utf8')),['show','LCP 01','-c','-l','typescript']);
    const cases='["literal $(never-run)","a b"]\\n1';
    assert.deepEqual(JSON.parse(await leetCodeExecutor.testSolution(filename,cases)),['test',filename,'-t',cases]);
    assert.deepEqual(JSON.parse(await leetCodeExecutor.submitSolution(filename)),['submit',filename]);
  } finally {leetCodeExecutor.getLeetCodeBinaryPath=original;fs.rmSync(dir,{recursive:true,force:true});}
});

test('CLI boundary waits for lazy preparation and uses the executable resolved by preparation', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'leetcode lazy CLI '));
  const cli=path.join(dir,'fixture.js');
  fs.writeFileSync(cli,'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
  const binary=leetCodeExecutor.getLeetCodeBinaryPath;
  const node=leetCodeExecutor.nodeExecutable;
  let preparationCalls=0;
  try {
    leetCodeExecutor.getLeetCodeBinaryPath=async()=>cli;
    leetCodeExecutor.nodeExecutable='missing-unprepared-node';
    leetCodeExecutor.setPreparation(async()=>{preparationCalls++;leetCodeExecutor.nodeExecutable=process.execPath;});
    assert.deepEqual(JSON.parse(await leetCodeExecutor.getUserInfo()),['user']);
    leetCodeExecutor.nodeExecutable='missing-unprepared-node';
    assert.deepEqual(JSON.parse(await leetCodeExecutor.getDescription('1',true)),['show','1','-x']);
    assert.equal(preparationCalls,2);
  } finally {
    leetCodeExecutor.setPreparation(async()=>undefined);
    leetCodeExecutor.nodeExecutable=node;leetCodeExecutor.getLeetCodeBinaryPath=binary;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
