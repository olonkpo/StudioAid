const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, shell, Notification, nativeImage, net } = require('electron');
const path = require('path');
const fs = require('fs');
const makeUpdater = require('./updater');

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
  win.webContents.once('did-finish-load', markGood);
  const external = url => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) { e.preventDefault(); external(url); } });
}

function togglePanel() {
  if (!alive()) { createWindow(); win.webContents.once('did-finish-load', () => win.webContents.send('toggle')); return; }
  win.show(); win.focus(); win.webContents.send('toggle');
}

function saveData(json) {
  try {
    fs.mkdirSync(backupDir(), { recursive: true });
    const tmp = dataFile() + '.tmp';
    fs.writeFileSync(tmp, json); fs.renameSync(tmp, dataFile());
    const day = path.join(backupDir(), 'data-' + new Date().toISOString().slice(0, 10) + '.json');
    if (!fs.existsSync(day)) {
      fs.writeFileSync(day, json);
      const old = fs.readdirSync(backupDir()).filter(f => f.startsWith('data-')).sort();
      old.slice(0, Math.max(0, old.length - 14)).forEach(f => fs.unlinkSync(path.join(backupDir(), f)));
    }
  } catch (e) { console.error('save failed', e); }
}

// ---- Updates
const REPO = 'olonkpo/StudioAid';
const updatesDir = () => path.join(app.getPath('userData'), 'updates');
let upd;
const U = () => upd || (upd = makeUpdater({ fetch: (u, o) => net.fetch(u, o), dir: updatesDir(), runVersion: RUN_VER, shellApi: SHELL_API, repo: REPO, platform: process.platform, arch: process.arch }));
function markGood() { // the app started properly, so the update is safe to keep
  try { const cf = path.join(updatesDir(), 'current.json'), cur = JSON.parse(fs.readFileSync(cf, 'utf8')); if (cur.tries) { cur.tries = 0; fs.writeFileSync(cf, JSON.stringify(cur)); } } catch (_) {}
  console.log('StudioAid ready, version', RUN_VER, 'from', __dirname);
}
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
ipcMain.on('save', (_e, json) => saveData(json));
ipcMain.on('load', e => { try { e.returnValue = fs.existsSync(dataFile()) ? fs.readFileSync(dataFile(), 'utf8') : null; } catch (_) { e.returnValue = null; } });
ipcMain.on('notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  n.on('click', togglePanel);
  n.show();
});

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', togglePanel);
app.on('window-all-closed', () => {}); // keep running in the menu bar

app.setAppUserModelId('com.studioaid.app');

app.whenReady().then(() => {
  if (app.dock) {
    if (prefs.dock) { app.dock.show(); app.dock.setMenu(Menu.buildFromTemplate([{ label: 'Show or hide panel', click: togglePanel }])); } else app.dock.hide();
  }
  createWindow();
  const readyAt = Date.now();
  app.on('activate', () => { if (Date.now() - readyAt > 2000) togglePanel(); }); // clicking the Dock icon

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', IS_MAC ? 'iconTemplate.png' : 'tray.png')));
  tray.setToolTip('StudioAid');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show or hide panel', click: togglePanel },
    { label: 'Open at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: 'Check for updates', click: async () => { const r = await U().check(); if (Notification.isSupported()) new Notification({ title: 'StudioAid', body: !r.ok ? 'Could not check for updates.' : r.newer ? 'Version ' + r.latest + ' is available. Open the panel, then Settings, then Updates.' : 'You have the latest version (' + r.current + ').' }).show(); } },
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
