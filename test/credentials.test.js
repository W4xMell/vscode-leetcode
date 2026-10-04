const test=require('node:test');
const assert=require('node:assert/strict');
const {globalState}=require('../out/src/globalState');
test('logout clears memory immediately even while persistent removal is delayed',async()=>{
  const state=new Map(); const pending=[];
  globalState.initialize({globalState:{get:key=>state.get(key),update:(key,value)=>{pending.push(()=>value===undefined?state.delete(key):state.set(key,value));return Promise.resolve();}}});
  await globalState.setCookie('synthetic-session'); await globalState.setUserStatus({username:'alice',isSignedIn:true,isPremium:false});
  pending.splice(0).forEach(commit=>commit());
  assert.equal(globalState.getCookie(),'synthetic-session');
  globalState.removeAll();
  assert.equal(state.get('leetcode-cookie'),'synthetic-session','persistent store is deliberately stale');
  assert.equal(globalState.getCookie(),undefined);
  assert.equal(globalState.getUserStatus(),undefined);
  pending.splice(0).forEach(commit=>commit());
  await globalState.setCookie('new-synthetic-session');
  assert.equal(globalState.getCookie(),'new-synthetic-session');
  globalState.removeCookie(); assert.equal(globalState.getCookie(),undefined);
});
