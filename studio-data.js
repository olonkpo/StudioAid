(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudioData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_PHASES = [
    { n: 'Booked', c: '#3b6ea5', s: ['Confirm Booking', 'Send Reminder'] },
    { n: 'Processing', c: '#6a5aa5', s: ['Meeting', 'Event', 'Completion', 'Delivery'] },
    { n: 'Post-project', c: '#2f8a6b', s: ['Social Posts', 'Follow-up', 'Referrals'] }
  ];
  const DEFAULT_CFG = { theme: 'auto', size: 44, fade: true, cur: 'GHS', me: 'Ebenezer', cc: '233' };
  const DEFAULT_INV = { biz: '', tagline: '', contact: '', pay: '', foot: 'Thank you!', color: '#2b2b2b', title: 'Invoice', logo: '', tax: '0', social: '' };
  const DEVICE_PREFS = ['y', 'side', 'vf', 'sf', 'ln', 'un', 'lb', 'all', 'phase'];
  const PERSISTENT = ['projects', 'phases', 'cfg', 'contacts', 'docs', 'packages', 'dtpl', 'mtpl', 'invN', ...DEVICE_PREFS];
  const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const fail = (path, reason) => { throw new Error('Invalid StudioAid backup: ' + path + ' ' + reason); };

  // Clone before normalization so callers cannot accidentally mutate the input.
  // Object-only undefined fields are omitted like JSON.stringify, which supports
  // existing live state such as an explicitly unlinked project's cid: undefined.
  function jsonClone(value, path, ancestors, depth) {
    if (depth > 80) fail(path, 'is nested too deeply');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail(path, 'must contain finite numbers');
      return value;
    }
    if (typeof value !== 'object') fail(path, 'must contain JSON values');
    if (ancestors.has(value)) fail(path, 'contains a circular reference');
    ancestors.add(value);
    let result;
    if (Array.isArray(value)) {
      result = Array.from(value, (item, i) => jsonClone(item, path + '[' + i + ']', ancestors, depth + 1));
    } else {
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) fail(path, 'must be a plain object');
      result = {};
      for (const key of Object.keys(value)) {
        if (BAD_KEYS.has(key)) fail(path + '.' + key, 'is not allowed');
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !own(descriptor, 'value')) fail(path + '.' + key, 'must be a stored value');
        if (descriptor.value !== undefined) result[key] = jsonClone(descriptor.value, path + '.' + key, ancestors, depth + 1);
      }
    }
    ancestors.delete(value);
    return result;
  }
  const clone = value => jsonClone(value, 'data', new Set(), 0);
  function object(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
    return value;
  }
  function array(value, path) {
    if (!Array.isArray(value)) fail(path, 'must be an array');
    return value;
  }
  function string(value, path, nonempty) {
    if (typeof value !== 'string' || (nonempty && !value.trim())) fail(path, 'must be ' + (nonempty ? 'a nonempty string' : 'a string'));
  }
  function id(value, path) {
    if ((typeof value !== 'string' || !value.trim()) && !(typeof value === 'number' && Number.isFinite(value))) fail(path, 'must be an identifier');
  }
  function number(value, path, options) {
    const o = options || {};
    if (o.blank && value === '') return;
    if (!(typeof value === 'number' || (typeof value === 'string' && value.trim()))) fail(path, 'must be numeric');
    const n = Number(value);
    if (!Number.isFinite(n) || (o.min !== undefined && n < o.min) || (o.integer && !Number.isSafeInteger(n))) fail(path, 'must be a valid number');
  }
  function fields(o, keys, path, check) {
    for (const key of keys) if (own(o, key)) check(o[key], path + '.' + key);
  }
  function strings(o, keys, path) { fields(o, keys, path, string); }
  function booleans(o, keys, path) { fields(o, keys, path, (v, p) => { if (typeof v !== 'boolean') fail(p, 'must be a boolean'); }); }
  function date(value, path) {
    string(value, path);
    if (!value) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail(path, 'must be a calendar date');
  }
  function uniqueRecords(values, path, validate) {
    const ids = new Set();
    array(values, path).forEach((value, i) => {
      const p = path + '[' + i + ']';
      object(value, p); id(value.id, p + '.id');
      const key = String(value.id);
      if (ids.has(key)) fail(p + '.id', 'is duplicated');
      ids.add(key); validate(value, p);
    });
    return values;
  }
  function validateInvoiceSettings(inv, path) {
    object(inv, path);
    strings(inv, ['biz', 'tagline', 'contact', 'pay', 'foot', 'color', 'title', 'logo', 'social'], path);
    fields(inv, ['tax'], path, (v, p) => number(v, p, { blank: true }));
  }
  function validateInvoiceItems(items, path) {
    array(items, path).forEach((item, i) => {
      const k = path + '[' + i + ']'; object(item, k); string(item.d, k + '.d');
      number(item.price, k + '.price'); number(item.qty, k + '.qty', { min: 0 });
    });
  }
  function validateInvoiceSnapshot(snapshot, path) {
    object(snapshot, path);
    if (snapshot.version !== 1) fail(path + '.version', 'is unsupported');
    string(snapshot.currency, path + '.currency', true);
    validateInvoiceSettings(snapshot.business, path + '.business');
    const data = object(snapshot.data, path + '.data');
    for (const key of ['name', 'client', 'email', 'phone', 'invNote', 'invDesc', 'pkg']) string(data[key], path + '.data.' + key);
    if (data.inv !== '') id(data.inv, path + '.data.inv');
    for (const key of ['invDate', 'invDue']) date(data[key], path + '.data.' + key);
    for (const key of ['amount', 'invDisc', 'invTax']) number(data[key], path + '.data.' + key);
    validateInvoiceItems(data.items, path + '.data.items');
  }
  function validateProject(p, path) {
    string(p.name, path + '.name');
    strings(p, ['client', 'email', 'phone', 'link', 'time', 'location', 'pkg', 'brief', 'notes', 'invDesc', 'invNote', 'invCurrency'], path);
    fields(p, ['cid', 'inv'], path, id);
    fields(p, ['date', 'invDate', 'invDue'], path, date);
    fields(p, ['amount', 'invDisc', 'invTax'], path, (v, k) => number(v, k, { blank: true }));
    booleans(p, ['arch', 'invSent', 'invCancel'], path);
    if (!own(p, 'cells')) p.cells = {};
    object(p.cells, path + '.cells');
    for (const key of Object.keys(p.cells)) if (!['', 'started', 'done', 'paused'].includes(p.cells[key])) fail(path + '.cells.' + key, 'is not a workflow status');
    if (own(p, 'due')) {
      object(p.due, path + '.due');
      for (const key of Object.keys(p.due)) date(p.due[key], path + '.due.' + key);
    }
    if (own(p, 'counts')) {
      object(p.counts, path + '.counts');
      for (const key of Object.keys(p.counts)) {
        const counts = object(p.counts[key], path + '.counts.' + key);
        fields(counts, ['d', 't'], path + '.counts.' + key, (v, k) => number(v, k, { min: 0 }));
      }
    }
    for (const key of ['shots', 'gear']) if (own(p, key)) array(p[key], path + '.' + key).forEach((item, i) => {
      const k = path + '.' + key + '[' + i + ']'; object(item, k); string(item.t, k + '.t'); booleans(item, ['d'], k);
    });
    if (own(p, 'items')) validateInvoiceItems(p.items, path + '.items');
    if (own(p, 'pay')) array(p.pay, path + '.pay').forEach((payment, i) => {
      const k = path + '.pay[' + i + ']'; object(payment, k); number(payment.amt, k + '.amt'); date(payment.date, k + '.date'); strings(payment, ['note'], k);
    });
    if (own(p, 'log')) array(p.log, path + '.log').forEach((entry, i) => {
      const k = path + '.log[' + i + ']'; object(entry, k); number(entry.ts, k + '.ts', { min: 0 }); string(entry.k, k + '.k'); string(entry.t, k + '.t');
    });
    if (own(p, 'invSnapshot')) validateInvoiceSnapshot(p.invSnapshot, path + '.invSnapshot');
    if (own(p, 'invHistory')) array(p.invHistory, path + '.invHistory').forEach((snapshot, i) => validateInvoiceSnapshot(snapshot, path + '.invHistory[' + i + ']'));
    fields(p, ['invRevision'], path, (value, key) => number(value, key, { min: 0, integer: true }));
  }
  function normalize(source) {
    object(source, 'data');
    if (!own(source, 'projects')) fail('projects', 'is required');
    const data = {};
    for (const key of PERSISTENT) if (own(source, key)) data[key] = source[key];
    fields(data, ['y', 'lb'], 'preferences', (value, key) => number(value, key, { min: 0 }));
    fields(data, ['phase'], 'preferences', (value, key) => number(value, key, { min: 0, integer: true }));
    fields(data, ['ln'], 'preferences', date);
    fields(data, ['un'], 'preferences', string);
    booleans(data, ['all'], 'preferences');
    for (const [key, choices] of [['side', ['l', 'r']], ['vf', ['act', 'arch', 'all']], ['sf', ['add', 'date', 'name']]]) {
      if (own(data, key) && !choices.includes(data[key])) fail('preferences.' + key, 'is not supported');
    }
    data.projects = uniqueRecords(data.projects, 'projects', validateProject);
    data.phases = own(data, 'phases') ? data.phases : clone(DEFAULT_PHASES);
    array(data.phases, 'phases');
    if (!data.phases.length) fail('phases', 'must include at least one phase');
    data.phases.forEach((phase, i) => {
      const path = 'phases[' + i + ']'; object(phase, path); string(phase.n, path + '.n', true); string(phase.c, path + '.c');
      if (!/^#[0-9a-f]{6}$/i.test(phase.c)) fail(path + '.c', 'must be a hex color');
      array(phase.s, path + '.s');
      if (!phase.s.length) fail(path + '.s', 'must include a step');
      phase.s.forEach((step, n) => string(step, path + '.s[' + n + ']', true));
    });
    const cfg = own(data, 'cfg') ? object(data.cfg, 'cfg') : {};
    strings(cfg, ['theme', 'cur', 'me', 'cc'], 'cfg'); booleans(cfg, ['fade'], 'cfg');
    if (own(cfg, 'theme') && !['auto', 'light', 'dark'].includes(cfg.theme)) fail('cfg.theme', 'is not a supported theme');
    fields(cfg, ['size'], 'cfg', (v, p) => number(v, p, { min: 1 }));
    const inv = own(cfg, 'inv') ? cfg.inv : {};
    validateInvoiceSettings(inv, 'cfg.inv');
    data.cfg = Object.assign({}, DEFAULT_CFG, cfg, { inv: Object.assign({}, DEFAULT_INV, inv) });
    data.contacts = uniqueRecords(own(data, 'contacts') ? data.contacts : [], 'contacts', (c, p) => {
      string(c.name, p + '.name'); strings(c, ['email', 'phone', 'notes'], p);
    });
    data.docs = uniqueRecords(own(data, 'docs') ? data.docs : [], 'docs', (d, p) => {
      string(d.name, p + '.name'); string(d.body, p + '.body'); string(d.kind, p + '.kind');
      if (!['contract', 'quote', 'questionnaire'].includes(d.kind)) fail(p + '.kind', 'is not supported');
      if (!own(d, 'status')) d.status = 'draft';
      if (!['draft', 'progress', 'completed', 'canceled'].includes(d.status)) fail(p + '.status', 'is not supported');
      if (own(d, 'pid') && d.pid !== '') id(d.pid, p + '.pid');
      date(d.created, p + '.created');
    });
    data.packages = uniqueRecords(own(data, 'packages') ? data.packages : [], 'packages', (pkg, p) => {
      string(pkg.name, p + '.name'); number(pkg.price, p + '.price', { min: 0 }); strings(pkg, ['duration', 'starter'], p);
    });
    data.dtpl = own(data, 'dtpl') ? object(data.dtpl, 'dtpl') : {};
    for (const key of Object.keys(data.dtpl)) string(data.dtpl[key], 'dtpl.' + key);
    data.mtpl = own(data, 'mtpl') ? object(data.mtpl, 'mtpl') : {};
    for (const key of Object.keys(data.mtpl)) {
      const template = object(data.mtpl[key], 'mtpl.' + key);
      string(template.s, 'mtpl.' + key + '.s'); string(template.b, 'mtpl.' + key + '.b');
    }
    if (own(data, 'invN')) number(data.invN, 'invN', { integer: true, min: 0 });
    const numbers = data.projects.map(p => String(p.inv || '').match(/(?:^|\D)(\d+)$/)).filter(Boolean).map(m => Number(m[1])).filter(Number.isSafeInteger);
    data.invN = numbers.reduce((max, n) => Math.max(max, n), Math.max(999, Number(data.invN) || 0));
    return data;
  }
  function parseBackup(input) {
    let source;
    try { source = typeof input === 'string' ? JSON.parse(input) : input; }
    catch (_) { fail('input', 'is not valid JSON'); }
    source = clone(source);
    object(source, 'input');
    if (own(source, 'schemaVersion') || own(source, 'app') || own(source, 'data')) {
      if (source.app !== 'StudioAid' || source.schemaVersion !== 1 || !own(source, 'data')) fail('schema', 'is unsupported');
      source = source.data;
    }
    return normalize(source);
  }
  function createBackup(state) {
    const data = parseBackup(state);
    // Normal save/load keeps each device's preferences. Transfers carry only
    // studio content so they do not move another device's bubble or filters.
    for (const key of DEVICE_PREFS) delete data[key];
    return { app: 'StudioAid', schemaVersion: 1, data };
  }
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => own(b, k) && equal(a[k], b[k]));
  }
  function hasStudioData(state) {
    if (state === null || state === undefined || state === '') return false;
    // An unreadable local file must count as occupied, so cloud sign-in cannot
    // silently replace it. Restore still calls parseBackup and rejects it.
    let data;
    try { data = parseBackup(state); } catch (_) { return true; }
    return Boolean(data.projects.length || data.contacts.length || data.docs.length || data.packages.length ||
      Object.keys(data.dtpl).length || Object.keys(data.mtpl).length || data.invN > 999 ||
      !equal(data.phases, DEFAULT_PHASES) || !equal(data.cfg, Object.assign({}, DEFAULT_CFG, { inv: DEFAULT_INV })));
  }
  return Object.freeze({ parseBackup, createBackup, hasStudioData });
});
