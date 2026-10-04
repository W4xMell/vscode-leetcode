const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { releaseInfo } = require('../scripts/release-info');

function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-plan-release-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'vscode-leetcode-study-plan', publisher: 'Mafty43211', version: '0.2.1' }));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ version: '0.2.1', packages: { '': { version: '0.2.1' } } }));
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '## [0.2.1] - 2026-10-05\n\n### Fixed\n\n- Callback identity.\n\n## [0.2.0]\n\n- Old changes.\n');
    fn(root);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('release notes include only the selected version', () => fixture(root => {
  const info = releaseInfo(root, 'v0.2.1');
  assert.equal(info.vsix, 'vscode-leetcode-study-plan-0.2.1.vsix');
  assert.match(info.notes, /Callback identity/);
  assert.doesNotMatch(info.notes, /Old changes/);
}));

test('release rejects arbitrary refs, version mismatches and absent notes', () => fixture(root => {
  for (const tag of ['master', 'v0.2.1-rc.1', 'v0.2.1\nextra', 'v0.2.0']) assert.throws(() => releaseInfo(root, tag));
  const lockPath = path.join(root, 'package-lock.json');
  const original = fs.readFileSync(lockPath);
  for (const lock of [{version:'0.2.0',packages:{'':{version:'0.2.1'}}}, {version:'0.2.1',packages:{'':{version:'0.2.0'}}}]) {
    fs.writeFileSync(lockPath, JSON.stringify(lock));
    assert.throws(() => releaseInfo(root, 'v0.2.1'), /versions must match/);
  }
  fs.writeFileSync(lockPath, original);
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '## [0.2.0]\n\n- Only old notes.\n');
  assert.throws(() => releaseInfo(root, 'v0.2.1'), /include this release/);
}));
