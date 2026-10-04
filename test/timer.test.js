const test = require('node:test');
const assert = require('node:assert/strict');
const { TimerModel, formatTime } = require('../out/src/timer/model');
const group = {key:'day:1',title:'Day 1',members:[{key:'1',id:'1',title:'Two Sum'},{key:'2',id:'49',title:'Anagrams'}]};
function fixture(saved) { let now=1000; const model=new TimerModel(()=>now,saved); return {model,advance:milliseconds=>{now+=milliseconds;}}; }

test('manual start, simultaneous clocks, switch pauses only previous problem, manual resume',()=>{
  const {model:m,advance}=fixture();
  m.select(group,'1'); assert.equal(m.problemClock(),undefined);
  m.startGroup(group,120); m.startProblem(30); advance(60000);
  assert.equal(m.remaining(m.groupSession().clock),119*60000);
  assert.equal(m.remaining(m.problemClock()),29*60000);
  m.select(group,'2'); advance(60000);
  assert.equal(m.state.sessions[group.key].problems['1'].elapsed,60000);
  assert.equal(m.remaining(m.groupSession().clock),118*60000);
  m.select(group,'1'); assert.equal(m.problemClock().runningSince,undefined);
  m.resume(m.problemClock()); advance(30000);
  assert.equal(m.remaining(m.problemClock()),28.5*60000);
});

test('expiry notifies once, overtime continues, pause freezes overtime',()=>{
  const {model:m,advance}=fixture(); m.select(group,'1'); m.startProblem(1);
  advance(60000); assert.deepEqual(m.tick(),['Two Sum']); assert.deepEqual(m.tick(),[]);
  advance(15000); assert.equal(m.remaining(m.problemClock()),-15000); assert.equal(formatTime(-15000),'+0:15');
  m.pause(m.problemClock()); advance(5000); assert.equal(m.remaining(m.problemClock()),-15000);
  m.resume(m.problemClock()); assert.deepEqual(m.tick(),[]);
});

test('reload/crash restores sampled time as paused and excludes offline time',()=>{
  const {model:m,advance}=fixture(); m.select(group,'1'); m.startGroup(group,2); m.startProblem(1); advance(35000); m.tick();
  const saved=m.snapshot(); advance(60000); const reloaded=new TimerModel(()=>999999,saved);
  assert.equal(reloaded.remaining(reloaded.problemClock()),25000);
  assert.equal(reloaded.remaining(reloaded.groupSession().clock),85000);
  assert.equal(reloaded.problemClock().runningSince,undefined);
  assert.equal(reloaded.groupSession().clock.runningSince,undefined);
  assert.equal(m.problemClock().runningSince,1000,'checkpoint must not pause live clocks');
});

test('session fixes membership/order while source changes; new attempt adopts new source',()=>{
  const {model:m}=fixture(); m.startGroup(group,2); m.select(group,'1');
  const changed={...group,members:[group.members[1],{key:'3',id:'LCP 01',title:'Guess Numbers'}]};
  m.select(changed,'2'); assert.deepEqual(m.groupSession().group.members,group.members);
  group.members[0].title='mutated source'; assert.equal(m.groupSession().group.members[0].title,'Two Sum'); group.members[0].title='Two Sum';
  m.startGroup(changed,3); assert.deepEqual(m.groupSession().group.members,changed.members);
});

test('switching groups preserves old clocks and pauses them; resume leaves same-group single timer running',()=>{
  const {model:m,advance}=fixture(); m.select(group,'1'); m.startGroup(group,2); m.startProblem(1); advance(10000);
  const second={...group,key:'day:2',title:'Day 2'}; m.startGroup(second,3); advance(5000);
  const old=m.state.sessions[group.key]; assert.equal(old.clock.elapsed,10000); assert.equal(old.problems['1'].elapsed,10000);
  assert.equal(old.clock.runningSince,undefined); assert.equal(old.problems['1'].runningSince,undefined);
  m.select(second,'1'); m.startProblem(1); m.resumeGroup(second.key); assert.notEqual(m.problemClock().runningSince,undefined);
  m.resumeGroup(group.key); assert.equal(m.state.sessions[second.key].clock.runningSince,undefined);
  assert.equal(m.state.sessions[second.key].problems['1'].runningSince,undefined);
});
