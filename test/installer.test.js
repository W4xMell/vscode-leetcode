const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { main, parseArgs } = require('../scripts/install-extension');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study plan installer '));
  const manifest = { name: 'vscode-leetcode-study-plan', version: '0.2.0' };
  fs.writeFileSync(path.join(directory, `${manifest.name}-${manifest.version}.vsix`), 'fixture VSIX payload');
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
  const messages = [];
  return { directory, manifest, output: { log: message => messages.push(message), error: message => messages.push(message) }, messages,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('installer uses repository-relative VSIX, literal paths/profile, explicit code, and force by default', () => {
  const f = fixture();
  try {
    let call;
    const status = main(['--code', '/path with spaces/code', '--profile', 'Practice & Review'], {
      ...f, env: { VSCODE_EXECUTABLE: 'ignored' }, spawnSync: (...args) => { call = args; return { status: 0 }; }
    });
    assert.equal(status, 0);
    assert.deepEqual(call, ['/path with spaces/code', ['--install-extension', path.join(f.directory, `${f.manifest.name}-${f.manifest.version}.vsix`), '--force', '--profile', 'Practice & Review'], { stdio: 'inherit', shell: false }]);
    assert(f.messages.some(message => message.includes('Installation complete')));
    assert.equal(parseArgs(['--no-force'], {}).force, false);
    assert.equal(parseArgs([], { VSCODE_EXECUTABLE: 'code-insiders' }).code, 'code-insiders');
  } finally { f.cleanup(); }
});

test('missing VSIX and invalid input cannot start installation; help/version do not install', () => {
  const f = fixture();
  let calls = 0;
  const run = () => { calls++; return { status: 0 }; };
  try {
    fs.unlinkSync(path.join(f.directory, `${f.manifest.name}-${f.manifest.version}.vsix`));
    assert.equal(main([], { ...f, spawnSync: run }), 1);
    assert.equal(main(['--code'], { ...f, spawnSync: run }), 1);
    assert.equal(main(['delete'], { ...f, spawnSync: run }), 1);
    assert.equal(main(['--help'], { ...f, spawnSync: run }), 0);
    assert.equal(main(['--version'], { ...f, spawnSync: run }), 0);
    assert.equal(calls, 0);
  } finally { f.cleanup(); }
});

test('CLI-not-found and nonzero/signal outcomes fail without reporting success', () => {
  const f = fixture();
  try {
    assert.equal(main([], { ...f, spawnSync: () => ({ error: { code: 'ENOENT' } }) }), 1);
    assert(f.messages.some(message => message.includes('PATH')));
    assert.equal(main([], { ...f, spawnSync: () => ({ status: 7 }) }), 7);
    assert.equal(main([], { ...f, spawnSync: () => ({ signal: 'SIGTERM' }) }), 1);
    assert.ok(!f.messages.some(message => message.includes('Installation complete')));
  } finally { f.cleanup(); }
});
