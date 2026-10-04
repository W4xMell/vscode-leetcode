const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'leetcode-custom-plan-'));
const workspace = path.join(directory, 'workspace');
const profile = path.join(directory, 'profile');
const extensions = path.join(directory, 'extensions');
fs.cpSync(path.join(__dirname, '../examples/custom-plan'), workspace, { recursive: true });
fs.mkdirSync(path.join(profile, 'User'), { recursive: true });
fs.mkdirSync(extensions);
fs.writeFileSync(path.join(profile, 'User/settings.json'), JSON.stringify({
  'leetcode.endpoint': 'leetcode',
  'leetcode.defaultLanguage': 'python3',
  'leetcode.workspaceFolder': path.join(directory, 'upstream-solutions'),
  'leetcodeStudyPlan.allowReportData': false,
  'leetcodeStudyPlan.endpoint': 'leetcode-cn',
  'leetcodeStudyPlan.defaultLanguage': 'typescript',
  'leetcodeStudyPlan.workspaceFolder': workspace,
  'leetcodeStudyPlan.filePath': { default: { folder: 'solutions', filename: '${id}.${ext}' } },
  'leetcodeStudyPlan.nodePath': process.execPath,
  'leetcodeStudyPlan.showDescription': 'In Webview',
  'leetcodeStudyPlan.editor.shortcuts': ['submit', 'test'],
  'leetcodeStudyPlan.hint.configWebviewMarkdown': false,
  'leetcodeStudyPlan.hint.commentDescription': false,
  'leetcodeStudyPlan.hint.setDefaultLanguage': false,
  'leetcodeStudyPlan.hint.commandShortcut': false
}, null, 2));
const result = spawnSync(process.env.VSCODE_EXECUTABLE || (process.platform === 'win32' ? 'code.cmd' : 'code'), [
  '--new-window', '--user-data-dir', profile, '--extensions-dir', extensions,
  '--extensionDevelopmentPath=' + path.join(__dirname, 'host'),
  '--extensionTestsPath=' + path.join(__dirname, 'host/run.js'),
  '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', workspace
], { stdio: 'inherit', timeout: 120000, shell: process.platform === 'win32' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
async function report() {
  const filename = path.join(workspace, 'test-result.json');
  const deadline = Date.now() + 30000;
  while (!fs.existsSync(filename) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!fs.existsSync(filename)) throw new Error('Extension host did not produce test results. Inspect logs in ' + profile);
  const summary = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if(summary.error) throw new Error(summary.error);
  console.log(JSON.stringify(summary, null, 2));
  console.log('Test workspace: ' + workspace);
}
report().catch(error => { console.error(error); process.exitCode = 1; });
