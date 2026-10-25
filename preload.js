const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('native', {
  interactive: on => ipcRenderer.send('interactive', on),
  load: () => ipcRenderer.sendSync('load'),
  save: json => ipcRenderer.send('save', json),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  version: () => ipcRenderer.sendSync('version'),
  openExternal: url => ipcRenderer.send('open-external', url),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  onToggle: cb => ipcRenderer.on('toggle', (_e, force) => cb(force))
});
