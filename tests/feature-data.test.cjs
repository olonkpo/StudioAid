'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBackup, createBackup } = require('../studio-data');
const project = () => ({ id: 'p1', name: 'Wedding', date: '2026-11-06', cells: { Editing: 'started' }, due: { Editing: '2026-11-10', 'Retired task': '2026-11-15' } });
const workflow = () => ({ preset: 'wedding', phases: [{ n: 'Production', c: '#225d47', s: ['Editing', 'Delivery'] }], offsets: { Editing: 4, Delivery: 14, 'Pre-shoot call': -7 }, autoDates: { Editing: '2026-11-10', Delivery: '2026-11-20' }, manualDates: { 'Retired task': true, Editing: false } });
const booking = () => ({ stage: 'deposit', depositType: 'percent', depositValue: 30, depositDue: '2026-10-30', balanceDue: '2026-11-20' });
const readProject = patch => parseBackup({ projects: [{ ...project(), ...patch }] }).projects[0];

test('feature metadata and manually managed due dates round-trip in complete studio backups', () => {
  const original = { ...project(), workflow: workflow(), booking: booking() };
  const result = parseBackup(JSON.stringify(createBackup({ projects: [original] }))).projects[0];
  assert.deepEqual(result, original);
  result.workflow.phases[0].s.push('New task');
  result.booking.depositValue = 50;
  assert.equal(original.workflow.phases[0].s.length, 2);
  assert.equal(original.booking.depositValue, 30);
});

test('legacy projects keep their workflow and dates without gaining booking metadata', () => {
  const legacy = project(), restored = readProject({});
  assert.deepEqual(restored, legacy);
  assert.equal('workflow' in restored, false);
  assert.equal('booking' in restored, false);
});

test('all supported workflow presets and booking stages are accepted', () => {
  for (const preset of ['wedding', 'portrait', 'event']) assert.equal(readProject({ workflow: { ...workflow(), preset } }).workflow.preset, preset);
  for (const stage of ['enquiry', 'quote', 'deposit', 'booked', 'completed', 'canceled']) assert.equal(readProject({ booking: { ...booking(), stage } }).booking.stage, stage);
  assert.equal(readProject({ booking: { ...booking(), depositValue: 0, depositDue: '', balanceDue: '' } }).booking.depositValue, 0);
  assert.equal(readProject({ booking: { ...booking(), depositValue: 100 } }).booking.depositValue, 100);
  assert.equal(readProject({ booking: { ...booking(), depositType: 'fixed', depositValue: 1200.5 } }).booking.depositValue, 1200.5);
});

test('reject malformed project workflows before any restore is attempted', () => {
  const invalid = [null, [], {}, { ...workflow(), preset: 'unknown' },
    { ...workflow(), phases: [] }, { ...workflow(), phases: null },
    { ...workflow(), phases: [{ n: '', c: '#225d47', s: ['Editing'] }] },
    { ...workflow(), phases: [{ n: 'Production', c: 'red', s: ['Editing'] }] },
    { ...workflow(), phases: [{ n: 'Production', c: '#225d47', s: [] }] },
    { ...workflow(), phases: [{ n: 'Production', c: '#225d47', s: [''] }] },
    { ...workflow(), offsets: null }, { ...workflow(), offsets: [] },
    { ...workflow(), offsets: { Editing: 1.5 } }, { ...workflow(), offsets: { Editing: '4' } }, { ...workflow(), offsets: { Editing: 'tomorrow' } },
    { ...workflow(), offsets: { '': 1 } },
    { ...workflow(), autoDates: null }, { ...workflow(), autoDates: [] },
    { ...workflow(), autoDates: { Editing: '2026-02-30' } },
    { ...workflow(), autoDates: { Editing: '' } },
    { ...workflow(), manualDates: null }, { ...workflow(), manualDates: [] },
    { ...workflow(), manualDates: { Editing: 'true' } }];
  for (const value of invalid) assert.throws(() => readProject({ workflow: value }), /Invalid StudioAid backup/, JSON.stringify(value));
});

test('reject malformed booking milestones and invalid deposit terms', () => {
  const invalid = [null, [], {}, { ...booking(), stage: 'paid' },
    { ...booking(), depositType: 'ratio' }, { ...booking(), depositValue: -1 },
    { ...booking(), depositValue: 100.01 }, { ...booking(), depositValue: '' },
    { ...booking(), depositValue: 'soon' }, { ...booking(), depositValue: Infinity },
    { ...booking(), depositValue: true }, { ...booking(), depositDue: null },
    { ...booking(), depositDue: '2026-02-30' }, { ...booking(), balanceDue: 'next month' }];
  for (const value of invalid) assert.throws(() => readProject({ booking: value }), /Invalid StudioAid backup/);
});


test('actual workflow module state stays usable after backup and rescheduling', () => {
  const W = require('../studio-workflow');
  const p = project();
  W.applyPreset(p, 'portrait', '2026-11-06');
  W.setDue(p, 'Delivery', '2026-11-25');
  W.setDue(p, 'Send Reminder', '');
  const restored = parseBackup(JSON.stringify(createBackup({ projects: [p] }))).projects[0];
  assert.deepEqual(W.getPhases(restored), W.getPhases(p));
  W.reschedule(restored, '2026-12-06');
  assert.equal(restored.due.Delivery, '2026-11-25');
  assert.equal(restored.due['Send Reminder'], undefined);
  assert.equal(restored.due['Retired task'], '2026-11-15');
  assert.equal(restored.due['Photograph Session'], '2026-12-06');
  assert.doesNotThrow(() => parseBackup({ projects: [restored] }));
});

test('actual booking module output and frozen invoice milestones survive restore', () => {
  const B = require('../studio-booking'), M = require('../studio-model');
  const p = { ...project(), amount: 1200, pay: [{ date: '2026-11-01', amt: 300, note: 'Deposit' }] }, defaults = { tax: '10', biz: 'My Studio' };
  B.configure(p, { stage: 'deposit', depositType: 'percent', depositValue: '30', depositDue: '2026-11-05', balanceDue: '2026-11-20' });
  M.issueInvoice(p, defaults, 'GHS');
  const expected = B.summary(p, defaults, '2026-11-06');
  const restored = parseBackup(JSON.stringify(createBackup({ projects: [p] }))).projects[0];
  assert.deepEqual(B.summary(restored, { tax: '20' }, '2026-11-06'), expected);
  assert.equal(expected.depositRemaining, 96);
  assert.equal(expected.overdue, true);
  restored.pay.push({ date: '2026-11-06', amt: 96, note: 'Rest of deposit' });
  assert.equal(B.summary(restored, defaults, '2026-11-06').depositRemaining, 0);
  assert.equal(B.summary(restored, defaults, '2026-11-06').nextDue, '2026-11-20');
  assert.doesNotThrow(() => parseBackup({ projects: [restored] }));
});
