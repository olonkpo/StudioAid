const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, shell, Notification, nativeImage, net, safeStorage } = require('electron');
const os = require('os');
const makeCloud = require('./cloud');
const path = require('path');
const fs = require('fs');
const makeUpdater = require('./updater');
const { parseBackup, createBackup, hasStudioData } = require('./studio-data');

const APP_ICON = path.join(__dirname, 'assets', 'icon.png');

const RUN_VER = require('./package.json').version;
const SHELL_API = global.__SHELL_API || 1;

// Keyboard shortcut to show/hide the panel. The first one that is free is used.
// (On Windows, Alt+Space is reserved by the system, so it is not offered there.)
const IS_MAC = process.platform === 'darwin';
const SHORTCUTS = IS_MAC ? ['Alt+Space', 'Control+Alt+Space'] : ['Control+Alt+Space', 'Control+Shift+Space'];

let win, tray;
let quitting = false;
const alive = () => win && !win.isDestroyed();
const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json');
let prefs = { dock: true };
try { Object.assign(prefs, JSON.parse(fs.readFileSync(path.join(require('electron').app.getPath('userData'), 'prefs.json'), 'utf8'))); } catch (_) {}
const savePrefs = () => { try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(prefsFile(), JSON.stringify(prefs)); } catch (_) {} };
const dataFile = () => path.join(app.getPath('userData'), 'data.json');
const backupDir = () => path.join(app.getPath('userData'), 'backups');

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    x: area.x, y: area.y, width: area.width, height: area.height,
    icon: APP_ICON,
    frame: false, transparent: true, hasShadow: false, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.setAlwaysOnTop(true, IS_MAC ? 'floating' : 'screen-saver');
  // With the Dock icon shown, the window can't float over full-screen apps on Mac; hide the Dock icon in Settings for that.
  win.setVisibleOnAllWorkspaces(true, IS_MAC ? (prefs.dock ? { visibleOnFullScreen: false, skipTransformProcessType: true } : { visibleOnFullScreen: true }) : {});
  win.setIgnoreMouseEvents(true, { forward: true }); // click-through until the pointer is over the bubble or panel
  // Closing the window (for example Cmd+W) only hides it; it is destroyed only when the app quits.
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, 'index.html'));
  // A loaded page may still have broken renderer code. Only renderer-ready marks an update healthy.
  const external = url => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) { e.preventDefault(); external(url); } });
}

function togglePanel() {
  if (!alive()) { createWindow(); win.webContents.once('did-finish-load', () => win.webContents.send('toggle')); return; }
  win.show(); win.focus(); win.webContents.send('toggle');
}

// Changes are serialized by Electron's main thread; each committed snapshot gets a revision.
let dataRevision = 0, dataLoadError = null;
function atomicWrite(file, contents) {
  const tmp = file + '.tmp';
  try { fs.writeFileSync(tmp, contents); fs.renameSync(tmp, file); }
  catch (error) { try { fs.unlinkSync(tmp); } catch (_) {} throw error; }
}
function validatedJSON(json) { return JSON.stringify(parseBackup(json)); }
function transferableJSON(json) { return validatedJSON(createBackup(parseBackup(json))); }
const DEVICE_PREFS = ['y', 'side', 'vf', 'sf', 'ln', 'un', 'lb', 'all', 'phase'];
function saveData(json) {
  if (dataLoadError) throw new Error('Existing saved data could not be loaded. Restore a valid backup before saving new work.');
  const normalized = validatedJSON(json);
  fs.mkdirSync(backupDir(), { recursive: true });
  // A backup failure must not prevent saving the current work, or falsely report a failed save.
  let warning = '';
  const day = path.join(backupDir(), 'data-' + new Date().toISOString().slice(0, 10) + '.json');
  try {
    if (!fs.existsSync(day)) fs.writeFileSync(day, fs.existsSync(dataFile()) ? fs.readFileSync(dataFile(), 'utf8') : normalized);
    const old = fs.readdirSync(backupDir()).filter(f => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    old.slice(0, Math.max(0, old.length - 14)).forEach(f => fs.unlinkSync(path.join(backupDir(), f)));
  } catch (error) { warning = 'Saved, but the daily backup could not be updated.'; }
  atomicWrite(dataFile(), normalized);
  dataRevision++;
  return { ok: true, revision: dataRevision, warning };
}
function restoreData(json, expectedRevision) {
  const restored = parseBackup(createBackup(parseBackup(json))); // Validate studio content; imported device preferences never replace this computer's preferences.
  if (expectedRevision !== undefined && expectedRevision !== dataRevision) {
    return { ok: false, error: 'Your work changed while the restore was loading. Review the latest data and try again.', revision: dataRevision };
  }
  fs.mkdirSync(backupDir(), { recursive: true });
  const current = readData();
  if (current !== null) {
    try {
      const local = parseBackup(current);
      for (const key of DEVICE_PREFS) if (Object.prototype.hasOwnProperty.call(local, key)) restored[key] = local[key];
    } catch (_) { /* A corrupt file may be explicitly replaced, but still gets a recovery copy below. */ }
    // If the safety copy fails, leave the original data in place.
    const recovery = path.join(backupDir(), 'before-restore-' + Date.now() + '-' + dataRevision + '.json');
    fs.writeFileSync(recovery, current, { flag: 'wx' });
  }
  const normalized = JSON.stringify(restored);
  atomicWrite(dataFile(), normalized);
  dataRevision++;
  dataLoadError = null;
  return { ok: true, json: normalized, revision: dataRevision };
}

// ---- Cloud backup (Google Drive)
let cfgCloud = {}; try { cfgCloud = require('./cloud-config'); } catch (_) {}
const testEp = (!app.isPackaged && process.env.STUDIOAID_TEST_ENDPOINTS) ? JSON.parse(process.env.STUDIOAID_TEST_ENDPOINTS) : undefined; // test hook, development only
let cmem = null;
const cloudFile = () => path.join(app.getPath('userData'), 'cloud.bin');
const cstore = {
  get() { if (cmem) return cmem; try { const b = fs.readFileSync(cloudFile()); cmem = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString()); } catch (_) { cmem = {}; } return cmem; },
  set(o) { cmem = o; try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); const enc = safeStorage.isEncryptionAvailable(); const s = JSON.stringify(enc ? o : Object.assign({}, o, { refresh_token: '' })); fs.writeFileSync(cloudFile(), enc ? safeStorage.encryptString(s) : Buffer.from(s)); } catch (_) {} }
};
const cloud = makeCloud({
  clientId: process.env.STUDIOAID_GOOGLE_ID || cfgCloud.clientId || '', clientSecret: process.env.STUDIOAID_GOOGLE_SECRET || cfgCloud.clientSecret || '',
  fetch: (u, o) => net.fetch(u, o), store: cstore, device: os.hostname(), endpoints: testEp,
  openUrl: u => { if (testEp && process.env.STUDIOAID_TEST_OPENFILE) fs.writeFileSync(process.env.STUDIOAID_TEST_OPENFILE, u); else shell.openExternal(u); }
});
const readData = () => {
  try { return fs.readFileSync(dataFile(), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const send = (ch, p) => { if (alive()) win.webContents.send(ch, p); };
let bt, cloudQueue = Promise.resolve(), cloudCandidate = null;
const withCloud = work => {
  const next = cloudQueue.then(work, work);
  cloudQueue = next.catch(() => {});
  return next;
};
function signalConflict() {
  cloudCandidate = null;
  cloud.setConflict();
  send('cloud-event', { kind: 'conflict' });
}
async function backupCurrent(force) {
  const json = readData();
  if (!json) return { ok: false, error: 'Nothing to back up yet.' };
  const revision = dataRevision;
  const result = await cloud.backup(JSON.stringify(createBackup(parseBackup(json))), { force });
  if (dataRevision !== revision) cloud.markDirty();
  return result;
}
async function cloudProposal() {
  const revision = dataRevision;
  const pulled = await cloud.pull(); // Fetch only; acceptance happens after a validated restore.
  if (!pulled.ok || !pulled.json) return pulled;
  if (revision !== dataRevision) { signalConflict(); return { ok: false, conflict: true, error: 'Your work changed while the cloud copy was loading.', revision: dataRevision }; }
  try {
    const json = transferableJSON(pulled.json);
    cloudCandidate = { json, version: pulled.version, revision };
    return { ok: true, json, revision };
  } catch (error) {
    return { ok: false, error: 'The cloud backup is invalid: ' + error.message, revision: dataRevision };
  }
}
function scheduleBackup() {
  const status = cloud.status();
  if (!status.signedIn) return;
  cloud.markDirty();
  cloudCandidate = null;
  clearTimeout(bt);
  if (status.conflict) return;
  bt = setTimeout(() => withCloud(async () => {
    if (cloud.status().conflict || !cloud.status().signedIn) return;
    const r = await backupCurrent(false);
    send('cloud-event', { kind: r.ok ? 'backup' : r.conflict ? 'conflict' : 'error', error: r.error });
  }).catch(error => send('cloud-event', { kind: 'error', error: error.message })), 20000);
}
async function syncCloud() {
  const status = cloud.status();
  if (!status.signedIn || status.conflict || cloudCandidate) return;
  const revision = dataRevision;
  const checked = await cloud.check();
  if (!checked.ok) return checked;
  if (checked.state === 'newer') {
    // Re-read state after the network request, including writes made while it was in flight.
    if (revision !== dataRevision || cloud.status().dirty) { signalConflict(); return; }
    const proposal = await cloudProposal();
    if (proposal.ok && proposal.json) send('cloud-apply', { json: proposal.json, revision: proposal.revision });
  } else if (checked.state === 'none' || (checked.state === 'same' && cloud.status().dirty)) {
    const r = await backupCurrent(false);
    send('cloud-event', { kind: r.ok ? 'backup' : r.conflict ? 'conflict' : 'error', error: r.error });
  }
}
function startupSync() { return withCloud(syncCloud).catch(error => send('cloud-event', { kind: 'error', error: error.message })); }
ipcMain.handle('cloud-status', () => cloud.status());
ipcMain.handle('cloud-signin', () => withCloud(async () => {
  const r = await cloud.signIn();
  if (!r.ok) return r;
  const revision = dataRevision;
  const c = await cloud.check();
  if (!c.ok) return c;
  if (c.state === 'none') await backupCurrent(false);
  else if (c.state === 'newer') {
    let occupied = true;
    try { const raw = readData(); occupied = raw !== null && hasStudioData(parseBackup(raw)); } catch (_) { /* Unreadable existing data must never be treated as an empty computer. */ }
    if (!occupied && revision === dataRevision) {
      const proposal = await cloudProposal();
      if (proposal.ok && proposal.json) send('cloud-apply', { json: proposal.json, revision: proposal.revision });
    } else signalConflict();
  }
  return r;
}));
ipcMain.handle('cloud-signout', () => withCloud(() => { clearTimeout(bt); cloudCandidate = null; return cloud.signOut(); }));
ipcMain.handle('cloud-check', () => withCloud(() => cloud.check()));
ipcMain.handle('cloud-backup', (_e, force) => withCloud(() => backupCurrent(!!force)));
ipcMain.handle('cloud-pull', () => withCloud(cloudProposal));
ipcMain.handle('cloud-conflict', () => { signalConflict(); return { ok: true }; });

// ---- Updates
const REPO = 'olonkpo/StudioAid';
const updatesDir = () => path.join(app.getPath('userData'), 'updates');
let upd;
const U = () => upd || (upd = makeUpdater({ fetch: (u, o) => net.fetch(u, o), dir: updatesDir(), runVersion: RUN_VER, shellApi: SHELL_API, repo: REPO, platform: process.platform, arch: process.arch }));
function markGood(event) {
  if (!alive() || event.sender !== win.webContents || dataLoadError) return;
  try {
    const cf = path.join(updatesDir(), 'current.json');
    const cur = JSON.parse(fs.readFileSync(cf, 'utf8'));
    if (cur.version === RUN_VER) atomicWrite(cf, JSON.stringify(Object.assign({}, cur, { tries: 0, healthy: true })));
  } catch (_) {}
  console.log('StudioAid ready, version', RUN_VER, 'from', __dirname);
}
ipcMain.on('renderer-ready', markGood);
function restartApp() { setTimeout(() => { quitting = true; app.relaunch(); app.quit(); }, 700); }
ipcMain.handle('update-check', () => U().check());
ipcMain.handle('update-install', async () => {
  try { const r = await U().check(); if (!r.ok || !r.patch) return { ok: false, error: 'No small update is available' }; await U().install(r.patch); restartApp(); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.on('version', e => { e.returnValue = RUN_VER; });
ipcMain.on('get-dock', e => { e.returnValue = !!prefs.dock; });
ipcMain.on('set-dock', (_e, on) => { prefs.dock = !!on; savePrefs(); restartApp(); });
ipcMain.on('open-external', (_e, url) => { if (typeof url === 'string' && url.startsWith(`https://github.com/${REPO}/`)) shell.openExternal(url); });

ipcMain.on('interactive', (_e, on) => alive() && win.setIgnoreMouseEvents(!on, { forward: true }));
ipcMain.handle('save', (_e, json) => {
  try { const result = saveData(json); scheduleBackup(); return result; }
  catch (error) { return { ok: false, error: 'Could not save your work: ' + error.message, revision: dataRevision }; }
});
ipcMain.on('data-revision', event => { event.returnValue = dataRevision; });
ipcMain.handle('restore', (_e, json, expectedRevision) => {
  try {
    const normalized = transferableJSON(json);
    const candidate = cloudCandidate;
    const result = restoreData(normalized, expectedRevision);
    if (!result.ok) return result;
    cloudCandidate = null;
    if (candidate && candidate.json === normalized && candidate.revision === expectedRevision) {
      cloud.accept(candidate.version);
    } else scheduleBackup();
    return result;
  } catch (error) { return { ok: false, error: 'Could not restore your work: ' + error.message, revision: dataRevision }; }
});
ipcMain.on('load', event => {
  try {
    const json = readData();
    if (json !== null) parseBackup(json); // A corrupt snapshot is not a fresh installation.
    dataLoadError = null;
    event.returnValue = json;
  } catch (error) {
    dataLoadError = 'Could not read saved data: ' + error.message;
    event.returnValue = { ok: false, error: dataLoadError, revision: dataRevision };
  }
});
ipcMain.on('notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: APP_ICON });
  n.on('click', togglePanel);
  n.show();
});

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', togglePanel);
app.on('window-all-closed', () => {}); // keep running in the menu bar

app.setAppUserModelId('com.studioaid.app');

app.whenReady().then(() => {
  if (app.dock) {
    app.dock.setIcon(APP_ICON);
    if (prefs.dock) { app.dock.show(); app.dock.setMenu(Menu.buildFromTemplate([{ label: 'Show or hide panel', click: togglePanel }])); } else app.dock.hide();
  }
  createWindow();
  win.webContents.once('did-finish-load', () => setTimeout(startupSync, 3000));
  setInterval(startupSync, 30 * 60 * 1000);
  const readyAt = Date.now();
  app.on('activate', () => { if (Date.now() - readyAt > 2000) togglePanel(); }); // clicking the Dock icon

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', IS_MAC ? 'iconTemplate.png' : 'tray.png')));
  tray.setToolTip('StudioAid');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show or hide panel', click: togglePanel },
    { label: 'Open at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: 'Check for updates', click: async () => { const r = await U().check(); if (Notification.isSupported()) new Notification({ icon: APP_ICON, title: 'StudioAid', body: !r.ok ? 'Could not check for updates.' : r.newer ? 'Version ' + r.latest + ' is available. Open the panel, then Settings, then Updates.' : 'You have the latest version (' + r.current + ').' }).show(); } },
    { label: 'Show data folder', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' }
  ]));

  if (!IS_MAC) tray.on('click', togglePanel);
  for (const s of SHORTCUTS) if (globalShortcut.register(s, togglePanel)) break;

  const fit = () => {
    if (!alive()) return;
    const a = screen.getPrimaryDisplay().workArea;
    win.setBounds({ x: a.x, y: a.y, width: a.width, height: a.height });
  };
  ['display-metrics-changed', 'display-added', 'display-removed'].forEach(ev => screen.on(ev, fit));
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());

