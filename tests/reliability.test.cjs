'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const data = require('../studio-data');
const makeCloud = require('../cloud');
const makeUpdater = require('../updater');
const root = path.resolve(__dirname, '..');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const snapshot = name => JSON.stringify({ projects: name ? [{ id: 'p1', name, cells: {} }] : [] });
function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studioaid-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
function coreHarness(t, overrides = {}) {
  const dir = temporary(t), handles = new Map(), events = new Map(), sent = [], timers = [];
  const state = { signedIn: false, dirty: false, conflict: false };
  const calls = { pull: 0, accept: 0 };
  const cloud = Object.assign({
    status: () => ({ ...state }),
    markDirty: () => { state.dirty = true; },
    setConflict: () => { state.conflict = true; },
    signIn: async () => ({ ok: true }), signOut: async () => ({ ok: true }),
    check: async () => ({ ok: true, state: 'same' }),
    pull: async () => { calls.pull++; return { ok: true, json: snapshot('Cloud'), version: '2' }; },
    backup: async () => ({ ok: true }),
    accept: () => { calls.accept++; state.dirty = false; state.conflict = false; }
  }, overrides.cloud);
  const app = { getPath: () => dir, isPackaged: true, requestSingleInstanceLock: () => true,
    quit() {}, on() {}, setAppUserModelId() {}, whenReady: () => ({ then() {} }) };
  const contents = { send: (channel, value) => sent.push({ channel, value }), once() {}, setWindowOpenHandler() {}, on() {} };
  const window = { isDestroyed: () => false, webContents: contents };
  const electron = { app, ipcMain: { handle: (key, f) => handles.set(key, f), on: (key, f) => events.set(key, f) } };
  const realRequire = require;
  const context = { console: { log() {}, error() {} }, process: { platform: 'darwin', arch: 'arm64', env: {} }, global: {},
    __dirname: root, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval() {},
    require(name) {
      if (name === 'electron') return electron;
      if (name === 'fs') return overrides.fs || fs;
      if (name === './cloud') return () => cloud;
      if (name === './updater') return () => ({});
      if (name === './studio-data') return data;
      if (name === './package.json') return { version: '0.1.10' };
      return realRequire(name);
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'core.js'), 'utf8') + '\n;globalThis.testApi={startupSync,createWindow,revision:()=>dataRevision,setWindow:w=>{win=w;}};', context);
  context.testApi.setWindow(window);
  return { dir, handles, events, sent, state, calls, timers, cloud, window, contents, api: context.testApi,
    save: json => handles.get('save')({}, json), restore: (json, revision) => handles.get('restore')({}, json, revision),
    read: () => fs.readFileSync(path.join(dir, 'data.json'), 'utf8') };
}

test('disk failures reach the renderer and never advance the save revision', t => {
  const fakeFS = new Proxy(fs, { get(target, key) { if (key === 'writeFileSync') return (file, ...args) => {
    if (file.endsWith('data.json.tmp')) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    return target.writeFileSync(file, ...args);
  }; return target[key]; } });
  const h = coreHarness(t, { fs: fakeFS });
  const result = h.save(snapshot('Unsaved'));
  assert.equal(result.ok, false); assert.match(result.error, /disk full/); assert.equal(result.revision, 0);
  assert.equal(fs.existsSync(path.join(h.dir, 'data.json')), false);
});

test('acknowledged saves persist validated state before returning success', t => {
  const h = coreHarness(t), result = h.save(snapshot('Saved'));
  assert.equal(result.ok, true); assert.equal(result.revision, 1);
  assert.equal(JSON.parse(h.read()).projects[0].name, 'Saved');
});

test('malformed and stale restores preserve current data and revision', t => {
  const h = coreHarness(t); h.save(snapshot('Keep me'));
  const before = h.read();
  assert.equal(h.restore('{"projects":[null]}', 1).ok, false);
  assert.equal(h.restore(snapshot('Stale'), 0).ok, false);
  assert.equal(h.read(), before); assert.equal(h.api.revision(), 1);
});

test('restores require a successful safety copy before replacing current work', t => {
  const fakeFS = new Proxy(fs, { get(target, key) { if (key === 'writeFileSync') return (file, ...args) => {
    if (path.basename(file).startsWith('before-restore-')) throw new Error('recovery directory is read-only');
    return target.writeFileSync(file, ...args);
  }; return target[key]; } });
  const h = coreHarness(t, { fs: fakeFS }); h.save(snapshot('Keep me'));
  const before = h.read(), result = h.restore(snapshot('Replacement'), 1);
  assert.equal(result.ok, false); assert.match(result.error, /recovery directory/);
  assert.equal(h.read(), before); assert.equal(h.api.revision(), 1);
});

test('successful restores keep a recovery copy and atomically commit normalized state', t => {
  const h = coreHarness(t); h.save(snapshot('Before'));
  const before = h.read(), result = h.restore(snapshot('After'), 1);
  assert.equal(result.ok, true); assert.equal(result.revision, 2);
  assert.equal(JSON.parse(h.read()).projects[0].name, 'After');
  const recovery = fs.readdirSync(path.join(h.dir, 'backups')).find(f => f.startsWith('before-restore-'));
  assert.equal(fs.readFileSync(path.join(h.dir, 'backups', recovery), 'utf8'), before);
});

test('an edit during a cloud check causes conflict instead of a stale overwrite', async t => {
  const gate = deferred(), started = deferred();
  const h = coreHarness(t, { cloud: { check: () => { started.resolve(); return gate.promise; } } });
  h.save(snapshot('Before')); h.state.signedIn = true;
  const syncing = h.api.startupSync(); await started.promise;
  h.save(snapshot('New local edit')); gate.resolve({ ok: true, state: 'newer' }); await syncing;
  assert.equal(h.calls.pull, 0); assert.equal(h.state.conflict, true);
  assert.equal(JSON.parse(h.read()).projects[0].name, 'New local edit');
  assert.equal(h.sent.some(e => e.channel === 'cloud-apply'), false);
});

test('cloud proposals are not accepted or persisted before a guarded renderer restore', async t => {
  const h = coreHarness(t, { cloud: { check: async () => ({ ok: true, state: 'newer' }) } });
  h.save(snapshot('Local')); h.state.signedIn = true;
  await h.api.startupSync();
  const proposal = h.sent.find(e => e.channel === 'cloud-apply').value;
  assert.equal(h.calls.accept, 0); assert.equal(JSON.parse(h.read()).projects[0].name, 'Local');
  const result = h.restore(proposal.json, proposal.revision);
  assert.equal(result.ok, true); assert.equal(h.calls.accept, 1);
  assert.equal(JSON.parse(h.read()).projects[0].name, 'Cloud');
});

test('edits arriving after a cloud proposal invalidate its restore', async t => {
  const h = coreHarness(t, { cloud: { check: async () => ({ ok: true, state: 'newer' }) } });
  h.save(snapshot('Local')); h.state.signedIn = true;
  await h.api.startupSync();
  const proposal = h.sent.find(e => e.channel === 'cloud-apply').value;
  h.save(snapshot('New edit'));
  assert.equal(h.restore(proposal.json, proposal.revision).ok, false);
  assert.equal(h.calls.accept, 0); assert.equal(JSON.parse(h.read()).projects[0].name, 'New edit');
});

test('cloud sign-in preserves contacts-only studios instead of considering them empty', async t => {
  const h = coreHarness(t, { cloud: { check: async () => ({ ok: true, state: 'newer' }) } });
  h.save(JSON.stringify({ projects: [], contacts: [{ id: 'c1', name: 'Existing client' }] }));
  h.state.signedIn = true;
  await h.handles.get('cloud-signin')();
  assert.equal(h.state.conflict, true); assert.equal(h.calls.pull, 0);
  assert.equal(JSON.parse(h.read()).contacts[0].name, 'Existing client');
});

test('renderer readiness, not page-load completion, resets update failures', t => {
  const h = coreHarness(t), updates = path.join(h.dir, 'updates'); fs.mkdirSync(updates);
  const pointer = path.join(updates, 'current.json');
  fs.writeFileSync(pointer, JSON.stringify({ version: '0.1.10', file: 'app-0.1.10.asar', tries: 2 }));
  assert.equal(JSON.parse(fs.readFileSync(pointer)).tries, 2);
  h.events.get('renderer-ready')({ sender: {} }); assert.equal(JSON.parse(fs.readFileSync(pointer)).tries, 2);
  h.events.get('renderer-ready')({ sender: h.contents });
  const healthy = JSON.parse(fs.readFileSync(pointer));
  assert.equal(healthy.tries, 0); assert.equal(healthy.healthy, true);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'core.js'), 'utf8'), /once\('did-finish-load', markGood\)/);
});

function cloudHarness(fetch) {
  let state = { refresh_token: 'test-refresh', email: 'test@example.com', lastSeen: '1', dirty: true };
  const cloud = makeCloud({ clientId: 'test', clientSecret: 'test', device: 'test', openUrl() {},
    store: { get: () => state, set: value => { state = value; } }, fetch });
  return { cloud, state: () => state };
}
const jsonResponse = value => ({ ok: true, json: async () => value });
test('downloading cloud data leaves acceptance and dirty state unchanged until accept()', async () => {
  const h = cloudHarness(async url => {
    if (url.includes('/token')) return jsonResponse({ access_token: 'test-access' });
    if (url.includes('alt=media')) return { ok: true, text: async () => snapshot('Remote') };
    return jsonResponse({ files: [{ id: 'backup', version: '2' }] });
  });
  const result = await h.cloud.pull();
  assert.equal(result.ok, true); assert.equal(result.version, '2');
  assert.equal(h.state().lastSeen, '1'); assert.equal(h.state().dirty, true);
  h.cloud.accept(result.version);
  assert.equal(h.state().lastSeen, '2'); assert.equal(h.state().dirty, false);
});

test('edits during an upload remain dirty after the older upload finishes', async () => {
  const uploaded = deferred(), started = deferred();
  const h = cloudHarness(async (url, opts = {}) => {
    if (url.includes('/token')) return jsonResponse({ access_token: 'test-access' });
    if (opts.method === 'PATCH') { started.resolve(); return uploaded.promise; }
    return jsonResponse({ files: [{ id: 'backup', version: '1' }] });
  });
  const backup = h.cloud.backup(snapshot('Old')); await started.promise;
  h.cloud.markDirty(); uploaded.resolve(jsonResponse({ id: 'backup', version: '2' }));
  assert.equal((await backup).ok, true); assert.equal(h.state().lastSeen, '2'); assert.equal(h.state().dirty, true);
});

test('installing an update keeps the previous healthy package and atomically activates the next', async t => {
  const dir = temporary(t), oldName = 'app-0.1.9.asar';
  fs.writeFileSync(path.join(dir, oldName), 'old');
  fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify({ version: '0.1.9', file: oldName, tries: 0, healthy: true }));
  const bytes = Buffer.from('new verified update');
  const updater = makeUpdater({ dir, runVersion: '0.1.9', shellApi: 1, repo: 'test/repo', platform: 'darwin', arch: 'arm64',
    fetch: async () => ({ ok: true, arrayBuffer: async () => bytes }) });
  await updater.install({ version: '0.1.10', url: 'https://github.com/test/repo/releases/download/v0.1.10/app-update.asar', sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  const pointer = JSON.parse(fs.readFileSync(path.join(dir, 'current.json')));
  assert.equal(pointer.version, '0.1.10'); assert.equal(pointer.healthy, false);
  assert.equal(pointer.previous.version, '0.1.9'); assert.equal(pointer.previous.healthy, true);
  assert.equal(fs.existsSync(path.join(dir, oldName)), true); assert.equal(fs.existsSync(path.join(dir, 'current.json.tmp')), false);
});

test('the launcher falls back to the previous healthy update after three failed starts', t => {
  const dir = temporary(t), updates = path.join(dir, 'updates'); fs.mkdirSync(updates);
  const old = { version: '0.1.9', file: 'app-0.1.9.asar', tries: 0, healthy: true };
  fs.writeFileSync(path.join(updates, old.file), 'old'); fs.writeFileSync(path.join(updates, 'app-0.1.10.asar'), 'new');
  fs.writeFileSync(path.join(updates, 'current.json'), JSON.stringify({ version: '0.1.10', file: 'app-0.1.10.asar', tries: 3, previous: old }));
  let loaded;
  const context = { global: {}, __dirname: root, console, require(name) {
    if (name === 'electron') return { app: { getPath: () => dir } };
    if (name === './package.json') return { version: '0.1.0' };
    if (name.endsWith(path.join('.asar', 'core.js'))) { loaded = name; return {}; }
    return require(name);
  } };
  vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), context);
  assert.equal(loaded, path.join(updates, old.file, 'core.js'));
  const pointer = JSON.parse(fs.readFileSync(path.join(updates, 'current.json')));
  assert.equal(pointer.version, old.version); assert.equal(pointer.tries, 1);
});

test('an interrupted update-pointer replacement leaves the previous activated version intact', async t => {
  const dir = temporary(t), oldName = 'app-0.1.9.asar', pointer = path.join(dir, 'current.json');
  fs.writeFileSync(path.join(dir, oldName), 'old');
  const oldPointer = JSON.stringify({ version: '0.1.9', file: oldName, tries: 0, healthy: true });
  fs.writeFileSync(pointer, oldPointer);
  const fakeFS = new Proxy(fs, { get(target, key) { if (key === 'renameSync') return (from, to) => {
    if (to === pointer) throw new Error('interrupted pointer replacement');
    return target.renameSync(from, to);
  }; return target[key]; } });
  const module = { exports: {} }, context = { module, Buffer, URL, require: name => name === 'fs' ? fakeFS : require(name) };
  vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(root, 'updater.js'), 'utf8'), context);
  const bytes = Buffer.from('new update');
  const updater = module.exports({ dir, runVersion: '0.1.9', fetch: async () => ({ ok: true, arrayBuffer: async () => bytes }) });
  await assert.rejects(updater.install({ version: '0.1.10', url: 'https://github.com/test/repo/releases/download/v0.1.10/app-update.asar', sha256: crypto.createHash('sha256').update(bytes).digest('hex') }), /interrupted pointer/);
  assert.equal(fs.readFileSync(pointer, 'utf8'), oldPointer);
  assert.equal(fs.existsSync(path.join(dir, oldName)), true);
});

test('a failed safety-copy source read cannot be mistaken for an empty local studio', t => {
  const fakeFS = new Proxy(fs, { get(target, key) { if (key === 'readFileSync') return (file, ...args) => {
    if (path.basename(file) === 'data.json') throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    return target.readFileSync(file, ...args);
  }; return target[key]; } });
  const h = coreHarness(t, { fs: fakeFS });
  const result = h.restore(snapshot('Do not overwrite'), 0);
  assert.equal(result.ok, false); assert.match(result.error, /permission denied/);
  assert.equal(fs.existsSync(path.join(h.dir, 'data.json')), false);
});

test('load read errors return an explicit error and block saves and healthy-update acknowledgement', t => {
  const fakeFS = new Proxy(fs, { get(target, key) { if (key === 'readFileSync') return (file, ...args) => {
    if (path.basename(file) === 'data.json') throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    return target.readFileSync(file, ...args);
  }; return target[key]; } });
  const h = coreHarness(t, { fs: fakeFS });
  const updates = path.join(h.dir, 'updates'); fs.mkdirSync(updates);
  const pointer = path.join(updates, 'current.json');
  fs.writeFileSync(pointer, JSON.stringify({ version: '0.1.10', file: 'app-0.1.10.asar', tries: 2 }));
  const loadEvent = {}; h.events.get('load')(loadEvent);
  assert.equal(loadEvent.returnValue.ok, false); assert.match(loadEvent.returnValue.error, /permission denied/);
  const saved = h.save(snapshot('Must not replace unreadable work'));
  assert.equal(saved.ok, false); assert.equal(saved.revision, 0);
  assert.equal(fs.existsSync(path.join(h.dir, 'data.json')), false);
  h.events.get('renderer-ready')({ sender: h.contents });
  assert.equal(JSON.parse(fs.readFileSync(pointer)).tries, 2);
});

test('corrupt loaded data remains intact until an explicit validated restore keeps a recovery copy', t => {
  const h = coreHarness(t), file = path.join(h.dir, 'data.json');
  const corrupt = '{"projects":[null]}'; fs.writeFileSync(file, corrupt);
  const event = {}; h.events.get('load')(event);
  assert.equal(event.returnValue.ok, false);
  assert.equal(h.save(snapshot('New empty state')).ok, false);
  assert.equal(fs.readFileSync(file, 'utf8'), corrupt);
  const restored = h.restore(snapshot('Recovered'), 0);
  assert.equal(restored.ok, true);
  const backup = fs.readdirSync(path.join(h.dir, 'backups')).find(name => name.startsWith('before-restore-'));
  assert.equal(fs.readFileSync(path.join(h.dir, 'backups', backup), 'utf8'), corrupt);
  assert.equal(h.save(snapshot('Normal saves resume')).ok, true);
});

test('only a missing data file is a fresh installation', t => {
  const h = coreHarness(t), event = {}; h.events.get('load')(event);
  assert.equal(event.returnValue, null);
  assert.equal(h.save(snapshot('First project')).ok, true);
});

test('normal save and load preserve this computer preferences while cloud uploads omit them', async t => {
  let uploaded;
  const h = coreHarness(t, { cloud: { backup: async json => { uploaded = JSON.parse(json); return { ok: true }; } } });
  const prefs = { y: 321, side: 'l', vf: 'arch', sf: 'date', ln: '2026-11-06', un: '0.1.10', lb: 123, all: true, phase: 1 };
  assert.equal(h.save(JSON.stringify({ ...JSON.parse(snapshot('Local')), ...prefs })).ok, true);
  const loaded = {}; h.events.get('load')(loaded);
  const saved = JSON.parse(loaded.returnValue);
  for (const key of Object.keys(prefs)) assert.equal(saved[key], prefs[key], key);
  await h.handles.get('cloud-backup')({}, false);
  assert.equal(uploaded.app, 'StudioAid'); assert.equal(uploaded.schemaVersion, 1);
  for (const key of Object.keys(prefs)) assert.equal(key in uploaded.data, false, key);
  assert.equal(uploaded.data.projects[0].name, 'Local');
});

test('cloud proposals omit remote device preferences and accepted restores preserve local preferences', async t => {
  const remote = JSON.stringify({ ...JSON.parse(snapshot('Cloud')), y: 1, side: 'l', vf: 'all', sf: 'name', phase: 2 });
  const h = coreHarness(t, { cloud: {
    check: async () => ({ ok: true, state: 'newer' }),
    pull: async () => ({ ok: true, json: remote, version: '2' })
  } });
  const prefs = { y: 444, side: 'r', vf: 'arch', sf: 'date', phase: 1, lb: 123, un: '0.1.9', ln: '2026-11-06', all: true };
  h.save(JSON.stringify({ ...JSON.parse(snapshot('Local')), ...prefs })); h.state.signedIn = true;
  await h.api.startupSync();
  const proposal = h.sent.find(event => event.channel === 'cloud-apply').value;
  const candidate = JSON.parse(proposal.json);
  for (const key of Object.keys(prefs)) assert.equal(key in candidate, false, key);
  const result = h.restore(proposal.json, proposal.revision);
  assert.equal(result.ok, true); assert.equal(h.calls.accept, 1);
  const persisted = JSON.parse(h.read()), response = JSON.parse(result.json);
  for (const key of Object.keys(prefs)) { assert.equal(persisted[key], prefs[key], key); assert.equal(response[key], prefs[key], key); }
  assert.equal(persisted.projects[0].name, 'Cloud');
});
