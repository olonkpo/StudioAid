// Google sign-in and Drive backup. No Electron dependency, so it can be tested on its own.
// Sign-in uses the system browser with PKCE and a loopback address. The backup is one file kept in the
// hidden "app data" folder of the user's own Google Drive (the drive.appdata permission), which only
// this app can see.
const http = require('http');
const crypto = require('crypto');

const DEFAULTS = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
  drive: 'https://www.googleapis.com/drive/v3',
  upload: 'https://www.googleapis.com/upload/drive/v3'
};
const SCOPE = 'openid email https://www.googleapis.com/auth/drive.appdata';
const FILE = 'studioaid-backup.json';
const b64 = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const msg = e => (e && e.code === 'signedout') ? 'Please sign in again.' : String((e && e.message) || e);

module.exports = function makeCloud({ clientId, clientSecret, fetch, openUrl, store, device, endpoints }) {
  const E = Object.assign({}, DEFAULTS, endpoints || {});
  const configured = !!(clientId && clientSecret);
  let access = null, exp = 0;
  const st = () => store.get() || {};
  const put = o => store.set(Object.assign({}, st(), o));

  const status = () => { const s = st(); return { configured, signedIn: !!s.refresh_token, email: s.email || '', lastAt: s.lastAt || 0, dirty: !!s.dirty, conflict: !!s.conflict }; };

  async function tokenReq(body) {
    const r = await fetch(E.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error_description || j.error || ('HTTP ' + r.status)), { code: j.error });
    return j;
  }
  async function exchange(code, verifier, redirect) {
    const j = await tokenReq({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier });
    access = j.access_token; exp = Date.now() + (j.expires_in || 3600) * 1000 - 60000;
    const ui = await (await fetch(E.userinfo, { headers: { Authorization: 'Bearer ' + access } })).json();
    const prev = st(), same = prev.email === ui.email;
    put({ refresh_token: j.refresh_token || prev.refresh_token || '', email: ui.email || '', lastSeen: same ? prev.lastSeen : '', dirty: same ? !!prev.dirty : true, conflict: false });
    return { ok: true, email: ui.email };
  }

  function signIn() {
    if (!configured) return Promise.resolve({ ok: false, error: 'Cloud sign-in is not set up in this build.' });
    const verifier = b64(crypto.randomBytes(32)), challenge = b64(crypto.createHash('sha256').update(verifier).digest()), state = b64(crypto.randomBytes(16));
    return new Promise(resolve => {
      let done = false, redirect = '', timer;
      const srv = http.createServer(async (req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/') { res.writeHead(404); return res.end(); }
        const page = m => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><meta charset="utf-8"><title>StudioAid</title><body style="font-family:system-ui,sans-serif;text-align:center;margin-top:20vh"><h2>${m}</h2><p>You can close this tab and go back to StudioAid.</p></body>`); };
        const code = u.searchParams.get('code');
        if (u.searchParams.get('error')) { page('Sign-in was cancelled.'); return finish({ ok: false, error: 'Sign-in was cancelled.' }); }
        if (!code || u.searchParams.get('state') !== state) { page('Sign-in could not be verified.'); return finish({ ok: false, error: 'Sign-in could not be verified.' }); }
        try { const r = await exchange(code, verifier, redirect); page('You are signed in.'); finish(r); }
        catch (e) { page('Sign-in failed.'); finish({ ok: false, error: msg(e) }); }
      });
      const finish = r => { if (done) return; done = true; clearTimeout(timer); try { srv.close(); } catch (_) {} resolve(r); };
      timer = setTimeout(() => finish({ ok: false, error: 'Sign-in timed out.' }), 5 * 60 * 1000);
      srv.listen(0, '127.0.0.1', () => {
        redirect = 'http://127.0.0.1:' + srv.address().port;
        const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE, code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent' });
        openUrl(E.auth + '?' + q.toString());
      });
    });
  }

  async function token() {
    if (access && Date.now() < exp) return access;
    const s = st();
    if (!s.refresh_token) throw Object.assign(new Error('Not signed in'), { code: 'signedout' });
    try {
      const j = await tokenReq({ client_id: clientId, client_secret: clientSecret, refresh_token: s.refresh_token, grant_type: 'refresh_token' });
      access = j.access_token; exp = Date.now() + (j.expires_in || 3600) * 1000 - 60000; return access;
    } catch (e) { if (e.code === 'invalid_grant') { put({ refresh_token: '' }); access = null; e.code = 'signedout'; } throw e; }
  }
  async function raw(url, opts = {}) {
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + await token() }, opts.headers || {}) }));
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Google Drive said ' + r.status + (t ? ': ' + t.slice(0, 120) : '')); }
    return r;
  }
  const api = async (url, opts) => (await raw(url, opts)).json();
  async function find() {
    const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
    const r = await api(`${E.drive}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime,version,appProperties)`);
    return (r.files || [])[0] || null;
  }
  function multipart(meta, content) {
    const b = 'sa' + crypto.randomBytes(8).toString('hex');
    return { type: 'multipart/related; boundary=' + b, body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${b}--` };
  }
  const dev = f => (f && f.appProperties && f.appProperties.device) || '';

  async function backup(json, { force } = {}) {
    try {
      const f = await find(), s = st();
      if (f && !force && f.version !== s.lastSeen) { put({ conflict: true }); return { ok: false, conflict: true, modified: f.modifiedTime, device: dev(f) }; }
      const meta = { appProperties: { device: device || '', app: 'studioaid' } }, fields = 'id,modifiedTime,version';
      let res;
      if (f) { const m = multipart(meta, json); res = await api(`${E.upload}/files/${f.id}?uploadType=multipart&fields=${fields}`, { method: 'PATCH', headers: { 'Content-Type': m.type }, body: m.body }); }
      else { const m = multipart(Object.assign({ name: FILE, parents: ['appDataFolder'] }, meta), json); res = await api(`${E.upload}/files?uploadType=multipart&fields=${fields}`, { method: 'POST', headers: { 'Content-Type': m.type }, body: m.body }); }
      put({ lastSeen: res.version, lastAt: Date.now(), dirty: false, conflict: false });
      return { ok: true };
    } catch (e) { return { ok: false, error: msg(e) }; }
  }
  async function pull() {
    try {
      const f = await find();
      if (!f) return { ok: true, empty: true };
      const json = await (await raw(`${E.drive}/files/${f.id}?alt=media`)).text();
      put({ lastSeen: f.version, lastAt: Date.now(), dirty: false, conflict: false });
      return { ok: true, json, modified: f.modifiedTime, device: dev(f) };
    } catch (e) { return { ok: false, error: msg(e) }; }
  }
  async function check() {
    try {
      const f = await find();
      if (!f) return { ok: true, state: 'none' };
      return { ok: true, state: f.version === st().lastSeen ? 'same' : 'newer', modified: f.modifiedTime, device: dev(f) };
    } catch (e) { return { ok: false, error: msg(e) }; }
  }
  async function signOut() {
    const s = st();
    try { if (s.refresh_token) await fetch(E.revoke + '?token=' + encodeURIComponent(s.refresh_token), { method: 'POST' }); } catch (_) {}
    access = null; put({ refresh_token: '', email: '', lastSeen: '', dirty: false, conflict: false });
    return { ok: true };
  }
  return { status, signIn, signOut, backup, pull, check, configured,
    markDirty: () => { if (!st().dirty) put({ dirty: true }); },
    setConflict: () => put({ conflict: true }) };
};
