const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, shell, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Keyboard shortcut to show/hide the panel. The first one that is free is used.
// (On Windows, Alt+Space is reserved by the system, so it is not offered there.)
const IS_MAC = process.platform === 'darwin';
const SHORTCUTS = IS_MAC ? ['Alt+Space', 'Control+Alt+Space'] : ['Control+Alt+Space', 'Control+Shift+Space'];

let win, tray;
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
  win.loadFile('index.html');
  const external = url => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) { e.preventDefault(); external(url); } });
}

function togglePanel() { win.show(); win.focus(); win.webContents.send('toggle'); }

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

ipcMain.on('interactive', (_e, on) => win && win.setIgnoreMouseEvents(!on, { forward: true }));
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
    { label: 'Show data folder', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' }
  ]));

  if (!IS_MAC) tray.on('click', togglePanel);
  for (const s of SHORTCUTS) if (globalShortcut.register(s, togglePanel)) break;

  screen.on('display-metrics-changed', () => {
    const a = screen.getPrimaryDisplay().workArea;
    win.setBounds({ x: a.x, y: a.y, width: a.width, height: a.height });
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
