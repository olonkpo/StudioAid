// Small launcher. Run a verified update and keep the last healthy version for recovery.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

global.__SHELL_API = 1;
const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const bundled = path.join(__dirname, 'core.js');
const updatesDir = path.join(app.getPath('userData'), 'updates');
const currentFile = path.join(updatesDir, 'current.json');
const bundledVersion = require('./package.json').version;
function writePointer(current) {
  const tmp = currentFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(current));
  fs.renameSync(tmp, currentFile);
}
function usable(current) {
  return current && /^\d+\.\d+\.\d+$/.test(current.version) && current.file === `app-${current.version}.asar` &&
    cmp(current.version, bundledVersion) > 0 && fs.existsSync(path.join(updatesDir, current.file));
}
function recover(current) {
  const previous = current && current.previous;
  if (usable(previous) && previous.healthy && (previous.tries || 0) < 3) {
    writePointer(previous);
    return previous;
  }
  try { fs.unlinkSync(currentFile); } catch (_) {}
  return null;
}
function pickCore() {
  try {
    let current = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
    if (!usable(current) || (current.tries || 0) >= 3) current = recover(current);
    if (!current) return bundled;
    current.tries = (current.tries || 0) + 1;
    writePointer(current); // Only renderer-ready resets this counter after successful initialization.
    return path.join(updatesDir, current.file, 'core.js');
  } catch (_) { return bundled; }
}

const target = pickCore();
try { require(target); }
catch (error) {
  if (target === bundled) throw error;
  console.error('Update failed to start. Restarting with the previous version:', error);
  try { recover(JSON.parse(fs.readFileSync(currentFile, 'utf8'))); } catch (_) { try { fs.unlinkSync(currentFile); } catch (_) {} }
  // Never require a second core in the same process: a partially started update may own IPC handlers.
  app.relaunch();
  app.exit(1);
}
