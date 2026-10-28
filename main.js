// Small launcher. It starts the newest verified update if there is one, and otherwise the version
// that came with the installer. If an update ever fails to start, it falls back automatically.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

global.__SHELL_API = 1;
const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const bundled = path.join(__dirname, 'core.js');

function pickCore() {
  const dir = path.join(app.getPath('userData'), 'updates'), cf = path.join(dir, 'current.json');
  try {
    const cur = JSON.parse(fs.readFileSync(cf, 'utf8')), file = path.join(dir, cur.file);
    if (cmp(cur.version, require('./package.json').version) <= 0 || !fs.existsSync(file) || (cur.tries || 0) >= 3) { fs.rmSync(cf, { force: true }); return bundled; }
    cur.tries = (cur.tries || 0) + 1; // reset to 0 by the app once it has started properly
    fs.writeFileSync(cf, JSON.stringify(cur));
    return path.join(file, 'core.js');
  } catch (_) { return bundled; }
}

const target = pickCore();
try { require(target); } catch (e) { console.error('Update failed to start, using the installed version:', e); require(bundled); }
