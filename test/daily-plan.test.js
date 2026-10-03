const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { validatePlan, parseProgress, workspacePath, toLeetCodeProblem } = require('../out/src/dailyPlan/model');
const root = path.resolve(__dirname, '../examples/custom-plan');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'data/custom-plan.json'), 'utf8'));

test('全部题目可传递给原插件，变式保持本地练习', () => {
  validatePlan(plan);
  let native = 0;
  let custom = 0;
  for (const day of plan.days) for (const problem of day.problems) {
    if (problem.solutionPath) workspacePath(root, problem.solutionPath);
    if (problem.kind === 'leetcode') {
      const node = toLeetCodeProblem(problem);
      assert.equal(node.id, String(problem.leetcodeId));
      assert.ok(['Easy','Medium','Hard'].includes(node.difficulty));
      assert.equal(node.locked, Boolean(problem.paidOnly));
      native++;
    } else {
      assert.throws(() => toLeetCodeProblem(problem), /locally/);
      custom++;
    }
  }
  assert.equal(native,3);
  assert.equal(custom,1);
});

test('同一题的多次复习拥有独立完成状态，兼容 CRLF', () => {
  const markdown = '## Day 8｜复习\r\n\r\n- [x] 8. [70 · 爬楼梯](url)\r\n## Day 9｜动态规划\r\n- [ ] 1. [70 · 爬楼梯](url)\r\n';
  const progress = parseProgress(markdown);
  assert.equal(progress.get('8:8').done,true);
  assert.equal(progress.get('9:1').done,false);
  const offset = progress.get('9:1').offset;
  assert.equal(markdown[offset],' ');
  const modified = markdown.slice(0,offset)+'x'+markdown.slice(offset+1);
  assert.equal(parseProgress(modified).get('9:1').done,true);
  assert.equal(parseProgress(modified).get('8:8').done,true);
});

test('示例 Markdown 与题单中的练习逐一对应', () => {
  const progress = parseProgress(fs.readFileSync(path.join(root,'PLAN.md'),'utf8'));
  assert.equal(progress.size,4);
  for(const day of plan.days) for(const p of day.problems) assert.ok(progress.has(`${day.day}:${p.order}`));
});

test('拒绝重复练习标识及仓库外模板路径', () => {
  assert.throws(() => parseProgress('## Day 1\n- [ ] 1. A\n- [ ] 1. B'),/Duplicate/);
  assert.throws(() => workspacePath(root,'../outside.ts'),/workspace/);
  assert.throws(() => workspacePath(root,'/tmp/outside.ts'),/relative/);
  const invalid = structuredClone(plan);
  invalid.days[0].problems[1].order=1;
  assert.throws(() => validatePlan(invalid),/order/);
});


test('来源可省略，拒绝无效来源和空条目', () => {
  assert.doesNotThrow(() => validatePlan(plan));
  for (const url of ['javascript:alert(1)', 'http://example.com', 'not a url']) {
    const invalid = structuredClone(plan);
    invalid.days[0].sourceUrl = url;
    assert.throws(() => validatePlan(invalid), /HTTPS/);
  }
  const invalid = structuredClone(plan);
  invalid.days[0].problems.push(null);
  assert.throws(() => validatePlan(invalid), /order/);
});
