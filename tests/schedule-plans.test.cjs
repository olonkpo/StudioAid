'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../studio-workflow');
const B = require('../studio-booking');
const M = require('../studio-model');
const custom = () => ({ id: 'custom-commercial', name: 'Commercial', description: 'A studio campaign', phases: [{ n: 'Preparation', c: '#123456', s: ['Agree brief', 'Shoot'] }, { n: 'Delivery', c: '#654321', s: ['Retouch', 'Final delivery'] }], offsets: { 'Agree brief': -7, Shoot: 0, Retouch: 5, 'Final delivery': 10 } });
const job = () => ({ id: 'job', name: 'Campaign', amount: 1000, pay: [], cells: {} });
const installment = (id, amount, due = '2026-12-01', label = id) => ({ id, label, amount, due });

test('custom presets are sanitized, independent, and reusable alongside built-ins', () => {
  const raw = { ...custom(), ignored: 'not stored' }, studio = {};
  const saved = W.savePreset(studio, raw);
  assert.equal(saved.id, 'custom-commercial'); assert.equal(saved.ignored, undefined);
  saved.phases[0].s[0] = 'mutated'; raw.offsets.Shoot = 99;
  assert.equal(studio.workflowPresets[0].phases[0].s[0], 'Agree brief'); assert.equal(studio.workflowPresets[0].offsets.Shoot, 0);
  assert.equal(W.presets(studio.workflowPresets).length, 4); assert.equal(W.presets().length, 3);
  const p = job(); W.applyPreset(p, 'custom-commercial', '2026-12-01', studio.workflowPresets);
  assert.equal(p.workflow.preset, 'custom-commercial'); assert.equal(p.due['Agree brief'], '2026-11-24'); assert.equal(p.due['Final delivery'], '2026-12-11');
  W.setDue(p, 'Retouch', '2026-12-25'); W.reschedule(p, '2026-12-08');
  assert.equal(p.due.Shoot, '2026-12-08'); assert.equal(p.due.Retouch, '2026-12-25');
});

test('editing a stored custom preset replaces by ID and leaves already applied projects independent', () => {
  const studio = {}, p = job(); W.savePreset(studio, custom()); W.applyPreset(p, 'custom-commercial', '2026-12-01', studio.workflowPresets);
  const edited = custom(); edited.name = 'Commercial edited'; edited.offsets.Retouch = 8; W.savePreset(studio, edited);
  assert.equal(studio.workflowPresets.length, 1); assert.equal(W.presets(studio.workflowPresets)[3].name, 'Commercial edited');
  assert.equal(p.workflow.offsets.Retouch, 5); assert.equal(p.due.Retouch, '2026-12-06');
  W.applyPreset(p, 'custom-commercial', undefined, studio.workflowPresets); assert.equal(p.due.Retouch, '2026-12-09');
});

test('capturing existing projects preserves project offsets and derives legacy relative dates', () => {
  const p = job(); W.applyPreset(p, 'portrait', '2026-11-06'); W.setDue(p, 'Delivery', '2026-12-06');
  const captured = W.capturePreset(p, { id: 'custom-portraits', name: 'My portraits' });
  assert.equal(captured.offsets.Delivery, 10, 'capture the reusable schedule, not this project manual override');
  const legacy = { date: '2026-12-01', due: { Prep: '2026-11-28', Delivery: '2026-12-11' } };
  const fallback = [{ n: 'Work', c: '#123456', s: ['Prep', 'Shoot', 'Delivery'] }];
  const template = W.capturePreset(legacy, { id: 'custom-legacy', name: 'Legacy' }, fallback);
  assert.deepEqual(template.offsets, { Prep: -3, Shoot: 0, Delivery: 10 });
});

test('invalid custom presets fail before saving or modifying a project', () => {
  const invalid = [];
  for (const patch of [{ id: 'portrait' }, { id: 'custom-INVALID' }, { name: '' }, { phases: [] }, { offsets: { Shoot: 0 } }]) invalid.push({ ...custom(), ...patch });
  const duplicate = custom(); duplicate.phases[1].s.push('Shoot'); invalid.push(duplicate);
  const unsupported = custom(); unsupported.offsets.Retouch = '5'; invalid.push(unsupported);
  const extreme = custom(); extreme.offsets.Retouch = 3651; invalid.push(extreme);
  const unknown = custom(); unknown.offsets.Extra = 0; invalid.push(unknown);
  for (const candidate of invalid) {
    const studio = { workflowPresets: [custom()] }, before = JSON.stringify(studio);
    assert.throws(() => W.savePreset(studio, candidate), /Workflow:/); assert.equal(JSON.stringify(studio), before);
    const p = job(), projectBefore = JSON.stringify(p);
    assert.throws(() => W.applyPreset(p, 'custom-commercial', '2026-12-01', [candidate]), /Workflow:/);
    assert.equal(JSON.stringify(p), projectBefore);
  }
  assert.throws(() => W.presets([custom(), custom()]), /unique/);
});

test('installment configuration validates and copies all planned milestones atomically', () => {
  const p = job(), list = [installment('one', '250.005')];
  B.configure(p, { installments: list }); assert.equal(p.booking.installments[0].amount, 250.01);
  list[0].label = 'external change'; assert.equal(p.booking.installments[0].label, 'one');
  B.configure(p, { stage: 'booked' }); assert.equal(p.booking.installments.length, 1);
  for (const rows of [[installment('zero', 0)], [installment('tiny', 0.001)], [installment('bad', -1)], [installment('bad', Infinity)], [installment('bad', 20, '2026-02-30')], [installment('same', 10), installment('same', 20)], [{ ...installment('bad', 20), label: '' }]]) {
    const before = JSON.stringify(p); assert.throws(() => B.configure(p, { installments: rows }), /Invalid booking:/); assert.equal(JSON.stringify(p), before);
  }
  B.configure(p, { installments: [] }); assert.deepEqual(p.booking.installments, []);
});

test('payments allocate to deposit then installments in date order without double counting', () => {
  const p = job(); B.configure(p, { depositValue: 20, depositDue: '2026-11-01', balanceDue: '2026-12-30', installments: [installment('later', 500, '2026-12-10'), installment('first', 300, '2026-11-20')] });
  p.pay = [{ amt: 100 }]; let s = B.summary(p, { tax: 0 }, '2026-11-06');
  assert.equal(s.depositRemaining, 100); assert.equal(s.nextAmount, 100); assert.equal(s.nextDue, '2026-11-01'); assert.equal(s.overdue, true);
  p.pay.push({ amt: 250 }); s = B.summary(p, { tax: 0 }, '2026-11-21');
  assert.equal(s.depositPaid, 200); assert.equal(s.installments[0].id, 'first'); assert.equal(s.installments[0].paid, 150); assert.equal(s.installments[0].remaining, 150);
  assert.equal(s.installments[1].paid, 0); assert.equal(s.nextAmount, 150); assert.equal(s.nextDue, '2026-11-20'); assert.equal(s.overdue, true); assert.equal(s.balance, 650); assert.equal(s.unallocatedBalance, 0);
  p.pay.push({ amt: 650 }); s = B.summary(p, { tax: 0 }, '2026-12-20');
  assert.equal(s.nextAmount, 0); assert.equal(s.nextDue, ''); assert.equal(s.installments.reduce((n, x) => n + x.paid, 0), 800);
});

test('unallocated balance follows configured installments and honors the final balance due date', () => {
  const p = job(); B.configure(p, { depositValue: 20, balanceDue: '2026-12-31', installments: [installment('first', 300, '2026-12-01')] });
  p.pay = [{ amt: 200 }]; let s = B.summary(p, {}, '2026-11-06');
  assert.equal(s.unallocatedBalance, 500); assert.equal(s.nextAmount, 300); assert.equal(s.nextDue, '2026-12-01');
  p.pay.push({ amt: 300 }); s = B.summary(p, {}, '2026-12-20');
  assert.equal(s.nextAmount, 500); assert.equal(s.nextDue, '2026-12-31'); assert.equal(s.balance, 500);
});

test('overcommitted schedules are flagged and clipped rather than collecting more than the invoice', () => {
  const p = job(); B.configure(p, { depositValue: 20, installments: [installment('first', 600, '2026-11-01'), installment('second', 600, '2026-12-01')] });
  let s = B.summary(p, {}, '2026-11-06'); assert.equal(s.planOvercommitted, true);
  assert.equal(s.installments[0].scheduledAmount, 600); assert.equal(s.installments[1].scheduledAmount, 200); assert.equal(s.installments[1].amount, 600); assert.equal(s.installments[1].clipped, true);
  p.pay = [{ amt: 200 }, { amt: 600 }]; s = B.summary(p, {}, '2026-11-06'); assert.equal(s.nextAmount, 200); assert.equal(s.balance, 200);
  p.pay.push({ amt: 500 }); s = B.summary(p, {}, '2026-11-06'); assert.equal(s.nextAmount, 0); assert.equal(s.unallocatedBalance, 0); assert.equal(s.balance, 0);
});

test('installment plans use frozen invoice totals and reopen correctly after refunds', () => {
  const p = job(); M.issueInvoice(p, { tax: 10 }, 'GHS');
  B.configure(p, { depositValue: 20, installments: [installment('first', 440, '2026-11-01'), installment('second', 440, '2026-12-01')] });
  p.amount = 2000; p.pay = [{ amt: 660 }, { amt: -100 }];
  const s = B.summary(p, { tax: 50 }, '2026-11-06');
  assert.equal(s.total, 1100); assert.equal(s.depositRequired, 220); assert.equal(s.installments[0].paid, 340); assert.equal(s.installments[0].remaining, 100); assert.equal(s.nextAmount, 100); assert.equal(s.planOvercommitted, false);
});

test('canceled and no-date installment plans preserve history without spurious collections', () => {
  const p = job(); B.configure(p, { installments: [installment('undated', 200, ''), installment('dated', 300, '2026-12-01')], balanceDue: '2026-12-31' });
  let s = B.summary(p, {}, '2026-11-06'); assert.equal(s.nextDue, '2026-12-01'); assert.equal(s.installments[0].id, 'dated');
  B.configure(p, { stage: 'canceled' }); p.pay = [{ amt: 100 }]; s = B.summary(p, {}, '2026-11-06');
  assert.equal(s.nextAmount, 0); assert.equal(s.unallocatedBalance, 0); assert.equal(s.balance, 0); assert.equal(s.installments[0].paid, 100); assert(s.installments.every(x => x.remaining === 0 && !x.overdue));
});
