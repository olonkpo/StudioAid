'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseBackup, createBackup, hasStudioData } = require('../studio-data');

const project = () => ({ id: 'p1', name: 'Portrait', amount: 1200, cells: { Editing: 'started' }, pay: [{ date: '2026-11-06', amt: 300, note: 'Deposit' }] });
const snapshot = () => ({ version: 1, currency: 'GHS', business: { biz: 'My Studio', tagline: '', contact: '', pay: 'Mobile money', foot: 'Thanks', color: '#225d47', title: 'Invoice', logo: '', tax: '10', social: '' }, data: { name: 'Portrait', client: 'Client', email: '', phone: '', inv: 'INV-1042', invDate: '2026-11-06', invDue: '', invNote: '', invDesc: '', pkg: '', amount: 1200, items: [{ d: 'Portrait', price: 1200, qty: 1 }], invDisc: 0, invTax: 10 } });
const complete = () => ({
  projects: [Object.assign(project(), { inv: 'INV-1042', invSnapshot: snapshot(), invHistory: [snapshot()], shots: [{ t: 'Portrait', d: false }], counts: { Editing: { d: 2, t: 10 } } })],
  cfg: { me: 'Photographer', inv: { biz: 'My Studio', logo: 'data:image/png;base64,AAAA', tax: '10' } },
  contacts: [{ id: 'c1', name: 'Client', email: 'client@example.com', phone: '', notes: '' }],
  docs: [{ id: 'd1', kind: 'quote', name: 'Quote', pid: 'p1', status: 'draft', body: 'Quote body', created: '2026-11-06' }],
  packages: [{ id: 'k1', name: 'Portrait', price: 1200, duration: '1 hour', starter: 'Event' }],
  dtpl: { quote: 'Custom quote {client}' }, mtpl: { Reminder: { s: 'Reminder', b: 'Custom reminder' } },
  view: 'S', y: 200, pid: 'p1', side: 'r'
});

test('complete backup round-trips every persistent collection and invoice snapshot', () => {
  const input = complete(), backup = createBackup(input);
  assert.equal(backup.app, 'StudioAid'); assert.equal(backup.schemaVersion, 1);
  const result = parseBackup(JSON.stringify(backup));
  for (const key of ['projects', 'contacts', 'docs', 'packages', 'dtpl', 'mtpl']) assert.deepEqual(result[key], input[key]);
  assert.equal(result.invN, 1042);
  for (const key of ['view', 'y', 'pid', 'side']) assert.equal(key in result, false);
  result.projects[0].name = 'Edited'; assert.equal(input.projects[0].name, 'Portrait');
});

test('old raw state and legacy manual backups normalize missing collections and defaults', () => {
  const legacy = { projects: [project()], cfg: { cur: 'USD' } };
  const result = parseBackup(JSON.stringify(legacy));
  assert.equal(result.cfg.cur, 'USD'); assert.equal(result.cfg.theme, 'auto'); assert.equal(result.cfg.inv.title, 'Invoice');
  assert.equal(result.phases[0].n, 'Booked');
  assert.deepEqual(result.contacts, []); assert.deepEqual(result.docs, []); assert.deepEqual(result.packages, []);
  assert.deepEqual(result.dtpl, {}); assert.deepEqual(result.mtpl, {});
  assert.equal(result.invN, 999);
});

test('invoice sequence never goes backwards after a restore', () => {
  assert.equal(parseBackup({ projects: [{ ...project(), inv: '1120' }], invN: 1000 }).invN, 1120);
  assert.equal(parseBackup({ projects: [{ ...project(), inv: 'INV-2026-42' }] }).invN, 999);
  assert.equal(parseBackup({ projects: [], invN: 1200 }).invN, 1200);
});

test('normal saves preserve local preferences, while transferable backups omit them', () => {
  const prefs = { y: 240, side: 'l', vf: 'arch', sf: 'date', ln: '2026-11-06', un: '0.1.12', lb: 1793966400000, all: false, phase: 2 };
  const saved = parseBackup({ projects: [], ...prefs, view: 'S', pid: 'p1', q: 'search' });
  for (const key of Object.keys(prefs)) assert.equal(saved[key], prefs[key], key);
  for (const key of ['view', 'pid', 'q']) assert.equal(key in saved, false);
  const exported = createBackup(saved).data;
  for (const key of Object.keys(prefs)) assert.equal(key in exported, false, key);
  assert.equal(hasStudioData(saved), false);
  assert.equal(hasStudioData(JSON.stringify(saved)), false);
  for (const bad of [{ y: -10 }, { lb: 'no' }, { side: 'top' }, { vf: 'bad' }, { sf: 'bad' }, { ln: '2026-02-30' }, { un: {} }, { all: 'false' }, { phase: 1.2 }]) {
    assert.throws(() => parseBackup({ projects: [], ...bad }), /Invalid/);
  }
});

test('reject unsupported envelopes and malformed JSON without attempting a partial restore', () => {
  for (const input of ['{', 'null', '[]', {}, { foo: 'bar' }, { app: 'Other', schemaVersion: 1, data: {} }, { app: 'StudioAid', schemaVersion: 1, data: {} }, { app: 'StudioAid', schemaVersion: 1, data: { cfg: {} } }, { app: 'StudioAid', schemaVersion: 2, data: {} }, { schemaVersion: 1 }, { data: {} }]) {
    assert.throws(() => parseBackup(input), /Invalid StudioAid backup/);
  }
});

test('reject malformed collections and nested project data', () => {
  const broken = [
    { projects: null }, { projects: {} }, { phases: [] }, { phases: [{ n: 'Booked', c: '#123456', s: null }] },
    { phases: [{ n: 'Booked', c: '#123456', s: [''] }] }, { cfg: null }, { cfg: { inv: [] } },
    { contacts: [null] }, { contacts: [{ id: 'c', name: [] }] },
    { docs: [{ id: 'd', name: 'Doc', kind: 'quote', body: {} }] },
    { docs: [{ id: 'd', name: 'Doc', kind: 'quote', body: 'Missing creation date' }] },
    { packages: [{ id: 'k', name: 'Pkg', price: 'oops' }] }, { dtpl: { quote: [] } }, { mtpl: { Reminder: { s: 'A' } } },
    ...[{ cells: [] }, { cells: { Editing: 'bogus' } }, { pay: {} }, { pay: [{ amt: 10, date: 'not a date' }] },
      { due: { Editing: '2026-02-30' } }, { counts: { Editing: null } }, { shots: [{}] }, { items: [null] },
      { items: [{ d: 'Photo', price: 'oops', qty: 1 }] }, { invSnapshot: [] }].map(bad => ({ projects: [{ ...project(), ...bad }] }))
  ];
  broken.forEach(input => assert.throws(() => parseBackup({ projects: [], ...input }), /Invalid StudioAid backup/));
});

test('reject duplicate identities and unsafe JSON values at any depth', () => {
  const duplicate = { projects: [project(), project()] };
  assert.throws(() => parseBackup(duplicate), /duplicated/);
  for (const value of [NaN, Infinity, -Infinity, 1n, () => true]) assert.throws(() => parseBackup({ projects: [{ ...project(), extra: value }] }), /Invalid/);
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const input = '{"projects":[],"cfg":{"extra":{"' + key + '":{"polluted":true}}}}';
    assert.throws(() => parseBackup(input), /not allowed/);
  }
  const cycle = {}; cycle.loop = cycle;
  assert.throws(() => parseBackup(cycle), /circular/);
  assert.throws(() => parseBackup({ cfg: new Date() }), /plain object/);
  assert.equal({}.polluted, undefined);
});

test('fresh defaults and UI state do not count as content; all studio collections and configured settings do', () => {
  assert.equal(hasStudioData(null), false); assert.equal(hasStudioData(''), false);
  assert.equal(hasStudioData({}), true, 'an unrecognized object must count as occupied');
  assert.equal(hasStudioData({ projects: [] }), false);
  assert.equal(hasStudioData(parseBackup({ projects: [] })), false);
  assert.equal(hasStudioData({ projects: [], view: 'S', y: 123, side: 'l', pid: 'old', all: true }), false);
  for (const key of ['projects', 'contacts', 'docs', 'packages', 'dtpl', 'mtpl']) {
    assert.equal(hasStudioData({ projects: [], [key]: complete()[key] }), true, key);
  }
  assert.equal(hasStudioData({ projects: [], cfg: { inv: { biz: 'My studio' } } }), true);
  assert.equal(hasStudioData({ projects: [], cfg: { cur: 'USD' } }), true);
  assert.equal(hasStudioData({ projects: [], cfg: { theme: 'dark' } }), true);
  assert.equal(hasStudioData({ projects: [], phases: [{ n: 'Custom', c: '#123456', s: ['Edit'] }] }), true);
  assert.equal(hasStudioData('{broken'), true, 'an unreadable local file cannot be overwritten as empty');
});

test('unlinked optional fields and valid extra invoice fields survive normalization safely', () => {
  const p = { ...project(), cid: undefined, invSnapshot: { ...snapshot(), issuedAt: 123 } };
  const result = parseBackup({ projects: [p] });
  assert.equal('cid' in result.projects[0], false);
  assert.deepEqual(result.projects[0].invSnapshot, p.invSnapshot);
});

test('reject malformed issued snapshots and revision history before restoration', () => {
  const bad = [null, [], {}, { ...snapshot(), version: 2 }, { ...snapshot(), currency: {} },
    { ...snapshot(), business: null }, { ...snapshot(), business: { tax: 'invalid' } },
    { ...snapshot(), data: null }, { ...snapshot(), data: {} },
    { ...snapshot(), data: { ...snapshot().data, client: {} } },
    { ...snapshot(), data: { ...snapshot().data, invDate: '2026-02-30' } },
    { ...snapshot(), data: { ...snapshot().data, items: {} } },
    { ...snapshot(), data: { ...snapshot().data, items: [null] } },
    { ...snapshot(), data: { ...snapshot().data, items: [{ d: 'Portrait', price: 1200, qty: {} }] } },
    { ...snapshot(), data: { ...snapshot().data, amount: 'NaN' } }];
  for (const invalid of bad) {
    assert.throws(() => parseBackup({ projects: [{ ...project(), invSnapshot: invalid }] }), /Invalid/);
    assert.throws(() => parseBackup({ projects: [{ ...project(), invHistory: [invalid] }] }), /Invalid/);
  }
  assert.throws(() => parseBackup({ projects: [{ ...project(), invHistory: {} }] }), /Invalid/);
});

test('actual invoice model snapshots round-trip and remain usable after restore', () => {
  const model = require('../studio-model');
  const p = { ...project(), inv: '1042', invDate: '2026-11-06' };
  model.issueInvoice(p, snapshot().business, 'GHS');
  const issued = parseBackup(createBackup({ projects: [p] })).projects[0];
  assert.equal(model.calculate(issued, { tax: 20 }).total, 1320);
  model.reviseInvoice(p);
  const revised = parseBackup({ projects: [p] }).projects[0];
  assert.equal(revised.invHistory.length, 1);
  assert.equal(revised.invSnapshot, undefined);
});

test('browser global exposes the same API without CommonJS', () => {
  const context = {}; vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../studio-data'), 'utf8'), context);
  assert.equal(typeof context.StudioData.parseBackup, 'function');
  assert.equal(context.StudioData.createBackup('{"projects":[]}').schemaVersion, 1);
});
