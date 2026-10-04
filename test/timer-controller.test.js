const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '../out/src');
let runtime;
const disposable = { dispose() {} };
const mocks = new Map([
  [path.join(root, 'commands/plugin.js'), { getLeetCodeEndpoint: () => 'leetcode-cn' }],
  [path.join(root, 'commands/show.js'), {}],
  [path.join(root, 'explorer/LeetCodeNode.js'), {}],
  [path.join(root, 'leetCodeManager.js'), { leetCodeManager: { getUser: () => 'fixture', getStatus: () => 1 } }],
  [path.join(root, 'globalState.js'), { globalState: { getCookie: () => 'csrftoken=fixture' } }],
  [path.join(root, 'shared.js'), { UserStatus: { SignedIn: 1 }, Endpoint: { LeetCodeCN: 'leetcode-cn' }, ProblemState: { Unknown: 3 } }],
  [path.join(root, 'utils/problemUtils.js'), { getNodeIdFromFile: async () => '' }]
]);
const vscode = {
  StatusBarAlignment: { Left: 1 },
  EventEmitter: class { constructor() { this.event = () => disposable; } fire() {} dispose() {} },
  window: {
    createStatusBarItem: () => ({ show() {}, dispose() {} }),
    onDidChangeActiveTextEditor: handler => { runtime.editorChanged = handler; return disposable; },
    showInputBox: async () => { if (runtime.duringInput) await runtime.duringInput(); return '1'; },
    showQuickPick: async items => runtime.choices.length ? runtime.choices.shift() : items[0],
    showInformationMessage() {},
    showErrorMessage: async message => { throw new Error(message); }
  },
  workspace: { getConfiguration: () => ({ get: (key, fallback) => fallback }) },
  commands: { registerCommand: (name, handler) => { runtime.commands.set(name, handler); return disposable; } }
};
const axios = { default: { post: async (url, body) => {
  const data = body.query.includes('studyPlanCreatedLists')
    ? { myCreatedFavoriteList: { favorites: [{ name: 'List', slug: 'mine', favoriteType: 'NORMAL' }], hasMore: false } }
    : body.query.includes('studyPlanListDetail')
    ? { favoriteDetailV2: { name: 'List', slug: 'mine', favoriteType: 'NORMAL' } }
    : { favoriteQuestionList: { questions: runtime.questions, totalLength: runtime.questions.length, hasMore: false } };
  return { data: { data } };
} } };
const originalLoad = Module._load;
let TimerController, TimerModel, PersonalListsProvider;
try {
  Module._load = function(id, parent, ...args) {
    if (id === 'vscode') return vscode;
    if (id === 'axios') return axios;
    const resolved = Module._resolveFilename(id, parent);
    if (mocks.has(resolved)) return mocks.get(resolved);
    return originalLoad.call(this, id, parent, ...args);
  };
  ({ TimerController } = require('../out/src/timer/TimerController'));
  ({ TimerModel } = require('../out/src/timer/model'));
  ({ PersonalListsProvider } = require('../out/src/personalLists/PersonalListsProvider'));
} finally { Module._load = originalLoad; }

function state() {
  const values = new Map();
  return { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, update: async (key, value) => values.set(key, value) };
}
const question = id => ({ id: id * 11, questionFrontendId: String(id), title: `Problem ${id}`, titleSlug: `problem-${id}`, difficulty: 'EASY' });
function fixture(context = { workspaceState: state(), globalState: state(), subscriptions: [] }) {
  runtime = { commands: new Map(), choices: [], questions: [question(1)] };
  const current = runtime;
  const timer = new TimerController(context);
  let now = 1000;
  timer.model = new TimerModel(() => now, context.workspaceState.get('timedPractice.v1'));
  const provider = new PersonalListsProvider(context, timer);
  return { timer, provider, context, runtime: current,
    advance: ms => { now += ms; },
    menu: async choice => { current.choices.push(choice); await current.commands.get('leetcodeStudyPlan.timer.group')(); },
    editor: async filename => {
      current.editorChanged({ document: { uri: { scheme: 'file', fsPath: filename }, getText: () => 'function exercise() {}' } });
      await new Promise(resolve => setImmediate(resolve));
    },
    dispose: async () => { timer.dispose(); provider.dispose(); await timer.flush(); }
  };
}

test('provider refresh supplies new attempts while resumed/snapshot selections retain the original scope', async () => {
  const f = fixture();
  try {
    await f.provider.add();
    const group = f.provider.group(f.provider.getChildren()[0].list);
    f.timer.select(group, '11');
    await f.timer.startGroup(group);
    const saved = f.timer.model.groupSession();
    f.runtime.questions = [question(2), question(1)];
    await f.provider.refresh();
    assert.deepEqual(saved.group.members.map(member => member.id), ['1']);
    await f.menu('Pause');
    await f.menu('Resume');
    assert.equal(f.timer.model.groupSession(), saved);
    // Selecting a captured session member must not overwrite the latest source.
    f.timer.select(saved.group, '11');
    await f.menu('Start selected group');
    assert.deepEqual(f.timer.model.groupSession().group.members.map(member => member.id), ['2', '1']);
  } finally { await f.dispose(); }
});

test('new attempts from an outside member use the latest parent source, including refresh during the duration prompt', async () => {
  const f = fixture();
  try {
    await f.provider.add();
    const group = f.provider.group(f.provider.getChildren()[0].list);
    f.timer.select(group, '11'); await f.timer.startGroup(group);
    f.runtime.questions = [question(1), question(2)]; await f.provider.refresh();
    const source = f.provider.group(f.provider.getChildren()[0].list);
    f.timer.select(source, '22');
    assert(f.timer.model.selectedSession().group.key.includes(':outside:'));
    f.runtime.duringInput = async () => {
      f.runtime.questions.push(question(3)); await f.provider.refresh();
    };
    await f.menu('Start selected group');
    assert.equal(f.timer.model.groupSession().group.key, group.key);
    assert.deepEqual(f.timer.model.groupSession().group.members.map(member => member.id), ['1', '2', '3']);
    assert.equal(f.timer.model.selectedSession().selected, '22');
  } finally { await f.dispose(); }
});

test('reload uses provider cache for new attempts while preserving the old paused session', async () => {
  const f = fixture();
  await f.provider.add();
  const group = f.provider.group(f.provider.getChildren()[0].list);
  f.timer.select(group, '11'); await f.timer.startGroup(group);
  f.runtime.questions = [question(1), question(2)]; await f.provider.refresh();
  await f.dispose();
  const reloaded = fixture(f.context);
  try {
    reloaded.provider.accountChanged();
    assert.equal(reloaded.timer.model.groupSession().group.members.length, 1);
    assert.equal(reloaded.timer.model.groupSession().clock.runningSince, undefined);
    await reloaded.menu('Start selected group');
    assert.equal(reloaded.timer.model.groupSession().group.members.length, 2);
  } finally { await reloaded.dispose(); }
});

test('local editor tab transitions pause the previous problem but keep group time running', async () => {
  const f = fixture();
  try {
    const group = { key: 'day:fixture:1', title: 'Day', members: [
      { key: 'a', id: 'local:a.ts', title: 'A', localPath: path.resolve('practice/a.ts') },
      { key: 'b', id: 'local:b.ts', title: 'B', localPath: path.resolve('practice/b.ts') },
      { key: 'c', id: 'local:2.ts', title: 'C', localPath: path.resolve('practice/2.ts') }
    ] };
    f.timer.select(group, 'a'); await f.timer.startGroup(group); f.timer.model.startProblem(1);
    const clockA = f.timer.model.problemClock();
    f.advance(5000); await f.editor(group.members[1].localPath);
    assert.equal(f.timer.model.selectedSession().selected, 'b');
    assert.equal(clockA.runningSince, undefined);
    assert.equal(clockA.elapsed, 5000);
    f.advance(5000);
    assert.equal(f.timer.model.elapsed(clockA), 5000);
    assert.equal(f.timer.model.elapsed(f.timer.model.groupSession().clock), 10000);
    await f.editor(path.resolve('README.md'));
    assert.equal(f.timer.model.selectedSession().selected, 'b');
    assert.equal(f.timer.model.groupSession().group.key, group.key);
    await f.editor(group.members[2].localPath);
    assert.equal(f.timer.model.selectedSession().selected, 'c', 'known local paths take priority over numeric filenames');
    assert.equal(f.timer.model.selectedSession().group.key, group.key);
  } finally { await f.dispose(); }
});

test('legacy saved outside-member sessions still resolve the current parent source after reload', async () => {
  const f = fixture();
  try {
    await f.provider.add();
    const group = f.provider.group(f.provider.getChildren()[0].list);
    f.timer.select(group, '11'); await f.timer.startGroup(group);
    f.runtime.questions = [question(1), question(2)]; await f.provider.refresh();
    f.timer.select(f.provider.group(f.provider.getChildren()[0].list), '22');
    await f.dispose();
    const saved = f.context.workspaceState.get('timedPractice.v1');
    delete saved.sessions[saved.selectedGroup].group.sourceKey;
    const reloaded = fixture(f.context);
    try {
      reloaded.provider.accountChanged();
      await reloaded.menu('Start selected group');
      assert.equal(reloaded.timer.model.groupSession().group.key, group.key);
      assert.equal(reloaded.timer.model.groupSession().group.members.length, 2);
      assert.equal(reloaded.timer.model.selectedSession().selected, '22');
    } finally { await reloaded.dispose(); }
  } finally { if (runtime === f.runtime) await f.dispose(); }
});

test('removed sources cannot silently start stale attempts but their saved session can resume', async () => {
  const f = fixture();
  try {
    await f.provider.add();
    const group = f.provider.group(f.provider.getChildren()[0].list);
    f.timer.select(group, '11'); await f.timer.startGroup(group);
    const saved = f.timer.model.groupSession();
    await f.provider.remove(f.provider.getChildren()[0]);
    await assert.rejects(f.menu('Start selected group'), /no longer available/);
    assert.equal(f.timer.model.groupSession(), saved);
    await f.menu('Pause'); await f.menu('Resume');
    assert.notEqual(saved.clock.runningSince, undefined);
  } finally { await f.dispose(); }
});

test('idle/paused timers have no heartbeat; running clocks keep second precision and expiry notices', async () => {
  const nativeSet = global.setInterval, nativeClear = global.clearInterval;
  const callbacks = new Map(); let next = 0; let notices = 0;
  global.setInterval = callback => { callbacks.set(++next, callback); return next; };
  global.clearInterval = id => callbacks.delete(id);
  const notify = vscode.window.showInformationMessage;
  vscode.window.showInformationMessage = () => { notices++; };
  const f = fixture();
  let writes = 0;
  const update = f.context.workspaceState.update;
  f.context.workspaceState.update = async (...args) => { writes++; await update(...args); };
  try {
    assert.equal(callbacks.size, 0);
    for (let second=0; second<60; second++) for (const callback of callbacks.values()) callback();
    await f.timer.flush(); assert.equal(writes, 0, 'idle startup must not snapshot or persist');
    const group = {key:'day:timer',title:'Day',members:[{key:'a',id:'1',title:'A'}]};
    f.timer.select(group,'a'); await f.timer.startGroup(group); await f.timer.flush();
    assert.equal(callbacks.size,1);
    f.advance(61000); for (const callback of callbacks.values()) callback(); await f.timer.flush();
    assert.equal(notices,1); assert.equal(f.timer.model.remaining(f.timer.model.groupSession().clock),-1000);
    for (const callback of callbacks.values()) callback(); await f.timer.flush(); assert.equal(notices,1);
    await f.menu('Pause'); await f.timer.flush(); assert.equal(callbacks.size,0);
    const pausedWrites = writes;
    f.advance(60000); for (const callback of callbacks.values()) callback(); await f.timer.flush();
    assert.equal(writes,pausedWrites); assert.equal(f.timer.model.remaining(f.timer.model.groupSession().clock),-1000);
    await f.menu('Resume'); assert.equal(callbacks.size,1);
  } finally {
    await f.dispose(); global.setInterval=nativeSet; global.clearInterval=nativeClear; vscode.window.showInformationMessage=notify;
  }
});

test('slow timer storage coalesces snapshots and flush persists the latest selection', async () => {
  const f = fixture(); let release; let writes=0, snapshots=0;
  const blocked = new Promise(resolve=>{release=resolve;});
  const update = f.context.workspaceState.update;
  f.context.workspaceState.update = async (...args) => { if (++writes===1) await blocked; await update(...args); };
  const snapshot=f.timer.model.snapshot.bind(f.timer.model);
  f.timer.model.snapshot=()=>{snapshots++;return snapshot();};
  const group={key:'day:slow',title:'Day',members:[{key:'a',id:'1',title:'A'},{key:'b',id:'2',title:'B'}]};
  try {
    f.timer.select(group,'a'); await new Promise(resolve=>setImmediate(resolve));
    for(let change=0; change<60; change++) f.timer.select(group,change%2 ? 'b' : 'a');
    assert.equal(snapshots,1,'pending requests must not repeatedly clone session history');
    release(); await f.timer.flush();
    assert.equal(writes,2); assert.equal(snapshots,2);
    assert.equal(f.context.workspaceState.get('timedPractice.v1').sessions[group.key].selected,'b');
  } finally {release();await f.dispose();}
});
