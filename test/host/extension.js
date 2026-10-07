const vscode = require('vscode');
const fs = require('fs/promises');
const path = require('path');
// Inject only picker/input responses while keeping native editors, views and status bars.
const Module = require('node:module');
const originalLoad = Module._load;
let testPick;
let testInput;
const treeViews = new Map();
const testWindow = new Proxy(vscode.window, {get(target,key) {
  if(key==='createTreeView') return (id,options) => {const view=target.createTreeView(id,options);treeViews.set(id,view);return view;};
  if(key==='showQuickPick') return async (items,options) => testPick === undefined ? target.showQuickPick(items,options) : typeof testPick === 'string' ? testPick : (await items)[0];
  if(key==='showInputBox') return async options => testInput === undefined ? target.showInputBox(options) : testInput;
  return Reflect.get(target,key);
}});
const testVscode = new Proxy(vscode, {get(target,key) {return key==='window' ? testWindow : Reflect.get(target,key);}});
Module._load = function(id,...args) { if(id==='vscode') return testVscode; return originalLoad.call(this,id,...args); };

const { activate: activateStudyPlan } = require('../../out/src/extension');
const { leetCodeManager } = require('../../out/src/leetCodeManager');
const { globalState } = require('../../out/src/globalState');
const { leetCodeExecutor } = require('../../out/src/leetCodeExecutor');
const axios = require('axios').default;
const { UserStatus } = require('../../out/src/shared');

async function activate(context) {
  globalState.initialize(context);
  const calls = [];
  // 只替换网络/CLI 边界，树、预览页、Code Now、编辑器和 CodeLens 使用原实现。
  const description = Array(18).fill('# unused');
  description[2] = 'https://leetcode.cn/problems/two-sum/description/';
  description[8] = '# Algorithms';
  description[9] = '# Easy';
  description[10] = '# Likes: 0';
  description[11] = '# Dislikes: 0';
  description.push('<p>Daily plan integration fixture</p>');
  leetCodeExecutor.getDescription = async id => { calls.push({kind:'description',id}); return description.join('\n'); };
  leetCodeExecutor.showProblem = async (node,language,filename) => {
    calls.push({kind:'template',id:node.id,language,filename});
    await fs.mkdir(path.dirname(filename),{recursive:true});
    try { await fs.access(filename); }
    catch { await fs.writeFile(filename,`/*\n * @lc app=leetcode.cn id=${node.id} lang=${language}\n */\n// @lc code=start\nfunction twoSum(nums: number[], target: number): number[] {\n  return [];\n}\n// @lc code=end\n`); }
  };
  // Occupy upstream command IDs while activating the actual standalone extension.
  const upstreamCalls = [];
  for (const command of ['leetcode.showProblem', 'leetcode.signin', 'leetcode.testSolution', 'leetcode.submitSolution']) {
    context.subscriptions.push(vscode.commands.registerCommand(command, () => upstreamCalls.push(command)));
  }
  let problemOutput = '';
  let websiteProblemOutput = '';
  let submissionAccepted = true;
  leetCodeExecutor.listProblems = async (showLocked,translation,forceRefresh) => {
    if (forceRefresh) problemOutput=websiteProblemOutput;
    return problemOutput;
  };
  leetCodeExecutor.getCompaniesAndTags = async () => ({companies:{},tags:{}});
  leetCodeExecutor.submitSolution = async filename => {
    calls.push({kind:'submit',filename});
    problemOutput = `    ${submissionAccepted ? 'v' : 'X'} [   1] Two Sum Easy (50.0 %)`;
    if (submissionAccepted) websiteProblemOutput=problemOutput;
    return submissionAccepted ? '  √ Accepted\n' : '  × Wrong Answer\n';
  };
  let requirementsCalls = 0;
  leetCodeExecutor.meetRequirements = async () => { requirementsCalls++; return true; };
  leetCodeExecutor.switchEndpoint = async () => '';
  leetCodeManager.getLoginStatus = async () => undefined;
  let account;
  let offline = false;
  let releaseRequest;
  let heldRequest;
  let listProblems = [
    {id:100107,questionFrontendId:'LCP 01',title:'Guess Numbers',translatedTitle:'猜数字',titleSlug:'guess-numbers',difficulty:'EASY',paidOnly:false},
    {id:100158,questionFrontendId:'面试题 01.01',title:'Is Unique',titleSlug:'is-unique-lcci',difficulty:'EASY',paidOnly:false}
  ];
  leetCodeManager.getUser = () => account;
  leetCodeManager.getStatus = () => account ? UserStatus.SignedIn : UserStatus.SignedOut;
  axios.post = async (url,body) => {
    if (heldRequest) { const wait=heldRequest; heldRequest=undefined; await wait; }
    if (offline) throw new Error('offline fixture');
    const data = body.query.includes('studyPlanCreatedLists') ? {myCreatedFavoriteList:{favorites:[{name:'My private list',slug:'mine',favoriteType:'NORMAL'}],hasMore:false}}
      : body.query.includes('studyPlanListDetail') ? {favoriteDetailV2:{slug:'mine',name:'My private list',favoriteType:'NORMAL'}}
      : {favoriteQuestionList:{questions:listProblems,totalLength:listProblems.length,hasMore:false}};
    return {data:{data}};
  };
  const dailyPlan = await activateStudyPlan(context);
  return { ...dailyPlan, calls, upstreamCalls, treeViews,
    startupRequirementsCalls: requirementsCalls,
    requirementsCalls: () => requirementsCalls,
    isPersonalListsHintDismissed: () => context.globalState.get('personalLists.hintDismissed', false),
    setPick: value => {testPick=value;},
    setInput: value => {testInput=value;},
    setAccount: async (name) => { account=name; if(name) await globalState.setCookie('csrftoken=synthetic; session=fixture');else globalState.removeAll();leetCodeManager.emit('statusChanged'); },
    holdNextRequest: () => {heldRequest=new Promise(resolve=>{releaseRequest=resolve;});},
    releaseRequest: () => releaseRequest(),
    setOffline: value => {offline=value;},
    setListProblems: value => {listProblems=value;},
    setWebsiteProblemOutput: value => {websiteProblemOutput=value;problemOutput=value;},
    setSubmissionAccepted: value => {submissionAccepted=value;}
  };
}
module.exports = {activate};
