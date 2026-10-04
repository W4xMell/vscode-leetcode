const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
// shared.ts only needs env.appName when loading its endpoint constants.
const originalLoad=Module._load;
Module._load=function(id,...args){ if(id==='vscode') return {env:{appName:'Code'}}; return originalLoad.call(this,id,...args); };
const {PersonalListClient,createdQuery,detailQuery,questionsQuery,accountKey,completionKey}=require('../out/src/personalLists/model');
Module._load=originalLoad;
const q=(id,display=String(id))=>({id,questionFrontendId:display,title:'Problem',titleSlug:'problem-'+id,difficulty:'EASY',paidOnly:false,acRate:0.5});

test('ordinary owned catalog excludes smart lists and refuses silent truncation',async()=>{
  const client=new PersonalListClient(async()=>({myCreatedFavoriteList:{favorites:[{slug:'mine',favoriteType:'NORMAL'},{slug:'smart',favoriteType:'SMART_LIST'}],hasMore:false}}));
  assert.deepEqual((await client.created()).map(x=>x.slug),['mine']);
  await assert.rejects(new PersonalListClient(async()=>({myCreatedFavoriteList:{favorites:[],hasMore:true}})).created(),/incomplete/);
});

test('loads all pages in custom order, distinguishes internal/display IDs and special IDs',async()=>{
  const calls=[];
  const client=new PersonalListClient(async(query,vars)=>{
    calls.push([query,vars]);
    if(query===detailQuery) return {favoriteDetailV2:{slug:'mine',name:'My List',favoriteType:'NORMAL'}};
    return {favoriteQuestionList: vars.skip===0 ? {questions:[q(100107,'LCP 01'),q(100158,'面试题 01.01')],totalLength:3,hasMore:true} : {questions:[q(1)],totalLength:3,hasMore:false}};
  });
  const list=await client.load('mine'); assert.deepEqual(list.problems.map(x=>x.id),['LCP 01','面试题 01.01','1']);
  assert.equal(list.problems[0].internalId,'100107'); assert.equal(list.problems[0].difficulty,'Easy');
  assert.deepEqual(calls.filter(([query])=>query===questionsQuery).map(([,vars])=>vars.skip),[0,2]);
  assert.ok(questionsQuery.includes('sortField: CUSTOM')); assert.equal(list.cached,false);
});

test('partial, duplicate, empty and changing pages fail instead of replacing valid data',async()=>{
  for(const result of [
    {questions:[q(1)],totalLength:2,hasMore:false},
    {questions:[],totalLength:2,hasMore:true},
    {questions:[q(1),q(1)],totalLength:2,hasMore:false}
  ]) {
    const client=new PersonalListClient(async query=>query===detailQuery?{favoriteDetailV2:{slug:'mine',name:'Mine',favoriteType:'NORMAL'}}:{favoriteQuestionList:result});
    await assert.rejects(client.load('mine'));
  }
  let page=0;
  const changed=new PersonalListClient(async query=>query===detailQuery?{favoriteDetailV2:{slug:'mine',favoriteType:'NORMAL'}}:{favoriteQuestionList:page++?{questions:[q(2)],totalLength:3,hasMore:false}:{questions:[q(1)],totalLength:2,hasMore:true}});
  await assert.rejects(changed.load('mine'),/changed/);
});

test('completion identity survives reorder/deletion/re-addition and separates sites/accounts',()=>{
  const a=accountKey('leetcode-cn','alice'), b=accountKey('leetcode-cn','bob'), c=accountKey('leetcode','alice');
  const done=new Set([completionKey(a,'mine','100107')]);
  for(const order of [[q(100107),q(1)],[q(1)], [q(1),q(100107)]]) for(const item of order) assert.equal(done.has(completionKey(a,'mine',String(item.id))),item.id===100107);
  assert.ok(!done.has(completionKey(b,'mine','100107'))); assert.ok(!done.has(completionKey(c,'mine','100107')));
});
