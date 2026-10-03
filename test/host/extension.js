const vscode = require('vscode');
const fs = require('fs/promises');
const path = require('path');
const { activate: activateStudyPlan } = require('../../out/src/extension');
const { leetCodeManager } = require('../../out/src/leetCodeManager');
const { globalState } = require('../../out/src/globalState');
const { leetCodeExecutor } = require('../../out/src/leetCodeExecutor');

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
  leetCodeExecutor.meetRequirements = async () => true;
  leetCodeExecutor.switchEndpoint = async () => '';
  leetCodeManager.getLoginStatus = async () => undefined;
  const dailyPlan = await activateStudyPlan(context);
  return { ...dailyPlan, calls, upstreamCalls };
}
module.exports = {activate};
