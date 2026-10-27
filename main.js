const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, shell, Notification, nativeImage, net } = require('electron');
const path = require('path');
const fs = require('fs');

// Keyboard shortcut to show/hide the panel. The first one that is free is used.
// (On Windows, Alt+Space is reserved by the system, so it is not offered there.)
const IS_MAC = process.platform === 'darwin';
const SHORTCUTS = IS_MAC ? ['Alt+Space', 'Control+Alt+Space'] : ['Control+Alt+Space', 'Control+Shift+Space'];

let win, tray;
let quitting = false;
const alive = () => win && !win.isDestroyed();
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
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true }); // click-through until the pointer is over the bubble or panel
  // Closing the window (for example Cmd+W) only hides it; it is destroyed only when the app quits.
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
  win.loadFile('index.html');
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

// ---- Updates: compare this version with the newest GitHub release
const REPO = 'olonkpo/StudioAid';
const cmpVer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
async function checkUpdate() {
  try {
    const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'StudioAid', Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const latest = String(j.tag_name || '').replace(/^v/, '');
    const want = process.arch === 'arm64' ? 'arm64' : 'x64';
    const asset = (j.assets || []).find(a => a.name.endsWith(IS_MAC ? '.dmg' : '.exe') && (!IS_MAC || a.name.includes(want)));
    return { ok: true, current: app.getVersion(), latest, newer: cmpVer(latest, app.getVersion()) > 0, url: asset ? asset.browser_download_url : j.html_url };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}
ipcMain.handle('update-check', checkUpdate);
ipcMain.on('version', e => { e.returnValue = app.getVersion(); });
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
  if (app.dock) app.dock.hide();
  createWindow();

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', IS_MAC ? 'iconTemplate.png' : 'tray.png')));
  tray.setToolTip('StudioAid');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show or hide panel', click: togglePanel },
    { label: 'Open at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: 'Check for updates', click: async () => { const r = await checkUpdate(); if (r.ok && r.newer) shell.openExternal(r.url); else if (Notification.isSupported()) new Notification({ title: 'StudioAid', body: r.ok ? 'You have the latest version (' + r.current + ').' : 'Could not check for updates.' }).show(); } },
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
