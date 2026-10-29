const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('native', {
  interactive: on => ipcRenderer.send('interactive', on),
  load: () => ipcRenderer.sendSync('load'),
  save: json => ipcRenderer.send('save', json),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  cloudStatus: () => ipcRenderer.invoke('cloud-status'),
  cloudSignIn: () => ipcRenderer.invoke('cloud-signin'),
  cloudSignOut: () => ipcRenderer.invoke('cloud-signout'),
  cloudCheck: () => ipcRenderer.invoke('cloud-check'),
  cloudBackup: force => ipcRenderer.invoke('cloud-backup', !!force),
  cloudPull: () => ipcRenderer.invoke('cloud-pull'),
  onCloud: cb => { ipcRenderer.on('cloud-event', (_e, p) => cb('event', p)); ipcRenderer.on('cloud-apply', (_e, j) => cb('apply', j)); },
  installUpdate: () => ipcRenderer.invoke('update-install'),
  getDock: () => ipcRenderer.sendSync('get-dock'),
  setDock: on => ipcRenderer.send('set-dock', on),
  platform: process.platform,
  version: () => ipcRenderer.sendSync('version'),
  openExternal: url => ipcRenderer.send('open-external', url),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  onToggle: cb => ipcRenderer.on('toggle', (_e, force) => cb(force))
});
