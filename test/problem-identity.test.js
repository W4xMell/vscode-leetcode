const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {install}=require('../scripts/cli-compat');
const Module=require('node:module');
const originalLoad=Module._load;
Module._load=function(id,...args){if(id==='vscode') return {env:{appName:'Code'}};return originalLoad.call(this,id,...args);};
const {getNodeIdFromFile}=require('../out/src/utils/problemUtils');
Module._load=originalLoad;
const file=require('vsc-leetcode-cli/lib/file');

for(const id of ['1','LCP 01','面试题 01.01','LCR 001']) test('extension and shipped CLI preserve '+id+' in metadata and route internal ID',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'leetcode-identity-')); const filename=path.join(dir,id+'.ts');
  fs.writeFileSync(filename,`/*\n * @lc app=leetcode.cn id=${id} lang=typescript\n */\n// @lc code=start\nconst answer=1;\n// @lc code=end`);
  try {
    const adapted={...file}; const problem={id:'100158',fid:id,slug:'sample'}; let routed;
    const core={getProblems:(translation,cb)=>cb(null,[problem]),next:{getProblem:(p,t,cb)=>{routed=p.id;cb(null,p);}}};
    install(adapted,core); assert.equal(adapted.meta(filename).id,id); assert.equal(adapted.meta(filename).lang,'typescript');
    assert.equal(await getNodeIdFromFile(filename),id);
    for(const input of [id,filename,'sample']) await new Promise((resolve,reject)=>core.getProblem(input,true,(e,p)=>{if(e)reject(e);else{assert.equal(p,problem);resolve();}}));
    assert.equal(routed,'100158'); assert.equal(adapted.codeData(filename),'const answer=1;');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('display ID/internal ID collision never resolves the wrong problem',async()=>{
  const adapted={...file}; const intended={id:999,fid:'1'},other={id:1,fid:'2'};
  const core={getProblems:(t,cb)=>cb(null,[other,intended]),next:{getProblem:(p,t,cb)=>cb(null,p)}};install(adapted,core);
  await new Promise((resolve,reject)=>core.getProblem('1',true,(e,p)=>{if(e)reject(e);else{assert.equal(p,intended);resolve();}}));
});
test('old numeric filenames and special filenames without markers still resolve',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'leetcode-old-'));
  try {const adapted={...file}; install(adapted,{});
    for(const [filename,id] of [['1.two-sum.ts','1'],['面试题 01.01.ts','面试题 01.01']]){
      const full=path.join(dir,filename);fs.writeFileSync(full,'// old code');assert.equal(await getNodeIdFromFile(full),id);assert.equal(adapted.meta(full).id,id);
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
