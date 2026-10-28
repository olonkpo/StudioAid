// Update logic with no Electron dependency, so it can be tested on its own.
// check():   asks GitHub for the latest release and says whether a small "patch" update or a full installer is needed.
// install(): downloads the small update, verifies its SHA-256 fingerprint, and stores it for the next start.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function makeUpdater({ fetch, dir, runVersion, shellApi, repo, platform, arch }) {
  const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
  const trusted = u => { try { const h = new URL(u).hostname; return h === 'github.com' || h.endsWith('.github.com') || h.endsWith('.githubusercontent.com'); } catch (_) { return false; } };
  const headers = { 'User-Agent': 'StudioAid', Accept: 'application/vnd.github+json' };

  async function check() {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const latest = String(j.tag_name || '').replace(/^v/, '');
      const assets = j.assets || [];
      const want = arch === 'arm64' ? 'arm64' : 'x64';
      const full = assets.find(a => a.name.endsWith(platform === 'darwin' ? '.dmg' : '.exe') && (platform !== 'darwin' || a.name.includes(want)));
      const out = { ok: true, current: runVersion, latest, newer: cmp(latest, runVersion) > 0, url: full ? full.browser_download_url : j.html_url, patch: null };
      const man = assets.find(a => a.name === 'update.json');
      if (out.newer && man) {
        try {
          const m = await (await fetch(man.browser_download_url, { headers })).json();
          const a = assets.find(x => x.name === m.file);
          if (a && /^[0-9a-f]{64}$/.test(m.sha256 || '') && (m.shell || 1) <= shellApi && m.version === latest && trusted(a.browser_download_url)) {
            out.patch = { version: m.version, file: m.file, sha256: m.sha256, url: a.browser_download_url, size: a.size };
          }
        } catch (_) { /* no usable patch; fall back to the full installer */ }
      }
      return out;
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }

  async function install(patch) {
    if (!patch || !trusted(patch.url)) throw new Error('Untrusted update source');
    const r = await fetch(patch.url, { headers: { 'User-Agent': 'StudioAid' } });
    if (!r.ok) throw new Error('Download failed: HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const sum = crypto.createHash('sha256').update(buf).digest('hex');
    if (sum !== patch.sha256) throw new Error('The downloaded update did not match its fingerprint');
    fs.mkdirSync(dir, { recursive: true });
    const name = `app-${patch.version}.asar`, final = path.join(dir, name), tmp = final + '.tmp';
    fs.writeFileSync(tmp, buf); fs.renameSync(tmp, final);
    fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify({ version: patch.version, file: name, tries: 0 }));
    fs.readdirSync(dir).filter(f => /^app-.*\.asar$/.test(f) && f !== name).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} });
    return true;
  }
  return { check, install, cmp };
};
