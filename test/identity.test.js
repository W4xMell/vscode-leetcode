const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');

test('standalone identity, settings and views do not use upstream IDs', () => {
  assert.equal(`${manifest.publisher}.${manifest.name}`, 'Mafty43211.vscode-leetcode-study-plan');
  assert.ok(manifest.contributes.commands.every(command => command.command.startsWith('leetcodeStudyPlan.')));
  for(const command of manifest.contributes.commands) assert.ok(manifest.activationEvents.includes('onCommand:'+command.command),command.command);
  assert.ok(manifest.activationEvents.includes('onView:leetCodeStudyPlanPersonalLists'));
  const settings = manifest.contributes.configuration.flatMap(config => Object.keys(config.properties));
  assert.ok(settings.every(key => key.startsWith('leetcodeStudyPlan.')));
  assert.deepEqual(Object.keys(manifest.contributes.views), ['leetcode-study-plan']);
  assert.ok(manifest.contributes.views['leetcode-study-plan'].every(view => view.id.startsWith('leetCodeStudyPlan')));
  const shared = fs.readFileSync(path.join(root, 'src/shared.ts'), 'utf8');
  assert.equal((shared.match(/path=mafty43211\.vscode-leetcode-study-plan/g) || []).length, 2);
  assert.ok(!shared.includes('path=leetcode.vscode-leetcode'));
});

test('maintained documentation has valid local links and English pages contain no Chinese text', () => {
  for (const filename of ['README.md', 'README.zh-CN.md', 'docs/study-plan.md', 'docs/project-workflow.zh-CN.md', 'CHANGELOG.md', 'ACKNOWLEDGEMENTS.md']) {
    const full = path.join(root, filename);
    const content = fs.readFileSync(full, 'utf8');
    if (filename === 'README.md' || filename === 'docs/study-plan.md') assert.ok(!/[\u3400-\u9fff]/u.test(content), filename);
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (!target.startsWith('http') && !target.startsWith('#')) {
        assert.ok(fs.existsSync(path.resolve(path.dirname(full), target.split('#')[0])), `${filename}: ${target}`);
      }
    }
  }
  assert.ok(fs.existsSync(path.join(root, 'README.zh-CN.md')));
});

test('real CLI endpoint changes stay in the standalone cache', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'study-plan-cache-'));
  try {
    const original = path.join(home, '.lc');
    fs.mkdirSync(original);
    const sentinel = JSON.stringify({plugins:{'leetcode.cn':false},originalAccount:'upstream-fixture'});
    fs.writeFileSync(path.join(original,'config.json'),sentinel);
    const wrapper = path.join(root,'scripts/study-plan-cli.js');
    for (const flag of ['-e','-d']) {
      const script = `require('node:os').homedir=()=>${JSON.stringify(home)}; process.argv=['node',${JSON.stringify(wrapper)},'plugin',${JSON.stringify(flag)},'leetcode.cn']; require(${JSON.stringify(wrapper)});`;
      const result = spawnSync(process.execPath,['-e',script],{cwd:root,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr || result.stdout);
      assert.equal(fs.readFileSync(path.join(original,'config.json'),'utf8'),sentinel);
      const config = JSON.parse(fs.readFileSync(path.join(home,'.leetcode-study-plan/plugins.json'),'utf8'));
      assert.equal(config['leetcode.cn'],flag==='-e');
    }
    assert.deepEqual(fs.readdirSync(original),['config.json']);
    const executor=fs.readFileSync(path.join(root,'src/leetCodeExecutor.ts'),'utf8');
    assert.ok(!executor.includes('path.join(os.homedir(), ".lc")'));
    assert.ok(executor.includes('"study-plan-cli.js"'));
  } finally { fs.rmSync(home,{recursive:true,force:true}); }
});
