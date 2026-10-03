const vscode = require('vscode');
const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { leetCodePreviewProvider } = require('../../out/src/webview/leetCodePreviewProvider');
const { CustomCodeLensProvider } = require('../../out/src/codelens/CustomCodeLensProvider');

async function run() {
  const api=await vscode.extensions.getExtension('local-test.daily-plan-test-host').activate();
  await api.ready;
  const commands=await vscode.commands.getCommands(true);
  for(const id of ['leetcode.showProblem','leetcodeStudyPlan.showProblem','leetcodeStudyPlan.testSolution','leetcodeStudyPlan.submitSolution']) assert.ok(commands.includes(id),id);
  const days=api.provider.getChildren();
  assert.equal(days.length,2);
  assert.equal(days.reduce((sum,day)=>sum+api.provider.getChildren(day).length,0),4);
  const first=api.provider.getChildren(days[0])[0];
  const root=vscode.workspace.workspaceFolders[0].uri.fsPath;
  const before=await fs.readFile(path.join(root,'PLAN.md'),'utf8');

  await vscode.commands.executeCommand('leetcodeStudyPlan.dailyPlan.preview',first);
  assert(leetCodePreviewProvider.panel,'原插件的预览面板未创建');
  assert(leetCodePreviewProvider.panel.webview.html.includes('Code Now'));
  assert.equal(leetCodePreviewProvider.node.id,'1');
  await leetCodePreviewProvider.onDidReceiveMessage({command:'ShowProblem'});
  const native=api.calls.find(call=>call.kind==='template');
  assert.deepEqual({id:native.id,language:native.language},{id:'1',language:'typescript'});
  assert.equal(native.filename,path.join(root,'solutions','1.ts'));
  assert.equal(vscode.window.activeTextEditor.document.uri.fsPath,native.filename);
  const lenses=new CustomCodeLensProvider().provideCodeLenses(vscode.window.activeTextEditor.document);
  assert.deepEqual(lenses.map(lens=>lens.command.title),['Study Plan: Submit','Study Plan: Test']);
  assert.deepEqual(lenses.map(lens=>lens.command.command),['leetcodeStudyPlan.submitSolution','leetcodeStudyPlan.testSolution']);
  assert.deepEqual(api.upstreamCalls,[],'Code Now must not call upstream commands');
  console.log('PASS 原题预览 → Code Now → TypeScript 模板 → Test/Submit CodeLens');

  await vscode.commands.executeCommand('leetcodeStudyPlan.dailyPlan.toggleDone',first);
  assert.equal(api.provider.isDone(first),true);
  assert.equal(api.provider.getTreeItem(api.provider.getChildren()[0]).description,'1/3');
  await vscode.commands.executeCommand('leetcodeStudyPlan.dailyPlan.toggleDone',first);
  assert.equal(api.provider.isDone(first),false);
  assert.equal(await fs.readFile(path.join(root,'PLAN.md'),'utf8'),before);
  console.log('PASS 完成状态保存、每日进度和恢复');

  const variant=api.provider.getChildren(api.provider.getChildren()[0])[2];
  const count=api.calls.filter(call=>call.kind==='template').length;
  await vscode.commands.executeCommand('leetcodeStudyPlan.dailyPlan.codeNow',variant);
  assert.equal(vscode.window.activeTextEditor.document.uri.fsPath,path.join(root,variant.problem.solutionPath));
  assert.equal(api.calls.filter(call=>call.kind==='template').length,count);
  console.log('PASS 本地变式打开模板，不进入力扣生成/提交流程');

  const jsonFile=path.join(root,'data/custom-plan.json');
  const original=await fs.readFile(jsonFile,'utf8');
  await fs.writeFile(jsonFile,'{broken');
  await assert.rejects(api.refresh());
  assert.equal(api.provider.getChildren().length,2,'格式错误不应丢失现有题单');
  await fs.writeFile(jsonFile,original);
  await api.refresh();
  console.log('PASS 无效题单保留已有视图，恢复后可重新加载');

  // 验证工作区配置可以切换题单，以及旧 Notion 路径兼容。
  const alternate=path.join(root,'alternate.json');
  await fs.writeFile(alternate,JSON.stringify({days:[{day:3,title:'专题练习',problems:[{order:1,title:'Two Sum',kind:'leetcode',leetcodeId:1,difficulty:'简单'}]}]}));
  const config=vscode.workspace.getConfiguration('leetcodeStudyPlan',vscode.workspace.workspaceFolders[0].uri);
  await config.update('dailyPlan.path','alternate.json',vscode.ConfigurationTarget.WorkspaceFolder);
  await api.refresh();
  assert.equal(api.provider.getChildren().length,1);
  assert.equal(api.provider.getChildren()[0].day.day,3);
  await config.update('dailyPlan.path','data/custom-plan.json',vscode.ConfigurationTarget.WorkspaceFolder);
  await fs.rename(jsonFile,path.join(root,'data/notion-plan.json'));
  await api.refresh();
  assert.equal(api.provider.getChildren().length,2);
  await fs.rename(path.join(root,'data/notion-plan.json'),jsonFile);
  await api.refresh();
  console.log('PASS 配置切换题单与旧 Notion 快照兼容');

  const summary={days:2,problems:4,nativeCodeNow:true,codeLens:['Study Plan: Submit','Study Plan: Test'],completionRoundTrip:true,customLocal:true,invalidPlanRecovery:true,configuredPlan:true,legacyNotionFallback:true,standaloneActivation:true,upstreamCommandIsolation:true};
  await fs.writeFile(path.join(root,'test-result.json'),JSON.stringify(summary,null,2));
}
module.exports={run};
