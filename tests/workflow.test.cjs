'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const W = require('../studio-workflow');

test('three complete independent presets cover preparation, shoot, and delivery', () => {
  const presets = W.presets();
  assert.deepEqual(presets.map(p => p.id), ['wedding', 'portrait', 'event']);
  for (const preset of presets) {
    assert.ok(preset.name && preset.description);
    assert.deepEqual(Object.keys(preset.offsets).sort(), preset.phases.flatMap(p => p.s).sort());
    assert.ok(Object.values(preset.offsets).some(n => n < 0));
    assert.ok(Object.values(preset.offsets).some(n => n === 0));
    assert.ok(Object.values(preset.offsets).some(n => n > 0));
  }
  presets[0].phases[0].s[0] = 'Changed';
  assert.equal(W.presets()[0].phases[0].s[0], 'Confirm Booking');
});

test('applying a preset schedules useful dates and preserves existing progress and manual dates', () => {
  const p = { date: '2026-11-06', cells: { 'Confirm Booking': 'done', Editing: 'started' }, due: { 'Confirm Booking': '2026-10-01', 'Confirm Brief': '2026-11-01', 'Other step': '2026-12-01' } };
  const cells = p.cells;
  assert.equal(W.applyPreset(p, 'portrait'), p);
  assert.equal(p.due['Collect Deposit'], '2026-10-23');
  assert.equal(p.due['Photograph Session'], '2026-11-06');
  assert.equal(p.due.Delivery, '2026-11-16');
  assert.equal(p.due['Confirm Brief'], '2026-11-01');
  assert.equal(p.due['Other step'], '2026-12-01');
  assert.equal(p.cells, cells);
  assert.equal(p.workflow.manualDates['Confirm Brief'], true);
  assert.equal(p.workflow.autoDates.Delivery, '2026-11-16');
});

test('rescheduling moves only automatic unfinished work', () => {
  const p = { date: '2026-11-06', cells: {} };
  W.applyPreset(p, 'portrait');
  p.cells['Back Up Photos'] = 'done';
  const completedDate = p.due['Back Up Photos'];
  W.setDue(p, 'Delivery', '2026-11-20');
  W.setDue(p, 'Send Reminder', '');
  W.reschedule(p, '2026-11-13');
  assert.equal(p.date, '2026-11-13');
  assert.equal(p.due['Prepare Gear'], '2026-11-12');
  assert.equal(p.due['Back Up Photos'], completedDate);
  assert.equal(p.due.Delivery, '2026-11-20');
  assert.equal(p.due['Send Reminder'], undefined);
});

test('direct edits and clears are detected as manual overrides', () => {
  const p = {};
  W.applyPreset(p, 'event', '2026-11-06');
  p.due.Delivery = '2026-11-25';
  delete p.due['Send Reminder'];
  W.reschedule(p, '2026-12-06');
  assert.equal(p.due.Delivery, '2026-11-25');
  assert.equal(p.due['Send Reminder'], undefined);
  assert.equal(p.workflow.manualDates.Delivery, true);
  assert.equal(p.workflow.manualDates['Send Reminder'], true);
});

test('reset returns a manual or cleared deadline to automatic scheduling', () => {
  const p = {};
  W.applyPreset(p, 'portrait', '2026-11-06');
  W.setDue(p, 'Delivery', '');
  W.resetDue(p, 'Delivery');
  assert.equal(p.due.Delivery, '2026-11-16');
  assert.equal(p.workflow.manualDates.Delivery, undefined);
  W.reschedule(p, '2026-11-13');
  assert.equal(p.due.Delivery, '2026-11-23');
  p.cells.Delivery = 'done';
  W.setDue(p, 'Delivery', '2026-11-01');
  W.resetDue(p, 'Delivery');
  assert.equal(p.due.Delivery, '2026-11-01');
});

test('switching presets removes obsolete auto deadlines but retains manual and completed history', () => {
  const p = {};
  W.applyPreset(p, 'wedding', '2026-11-06');
  W.setDue(p, 'Confirm Wedding Timeline', '2026-10-28');
  p.cells['Photograph Wedding'] = 'done';
  W.applyPreset(p, 'portrait');
  assert.equal(p.due['Send Sneak Peeks'], undefined);
  assert.equal(p.due['Confirm Wedding Timeline'], '2026-10-28');
  assert.equal(p.due['Photograph Wedding'], '2026-11-06');
  assert.equal(p.due.Delivery, '2026-11-16');
  assert.equal(W.getSteps(p).includes('Confirm Wedding Timeline'), false);
  assert.equal(p.cells['Photograph Wedding'], 'done');
});

test('blank shoot dates never produce fake deadlines and retain manual/completed dates', () => {
  const p = {};
  W.applyPreset(p, 'event');
  assert.equal(p.date, ''); assert.deepEqual(p.due, {}); assert.deepEqual(p.workflow.autoDates, {});
  W.reschedule(p, '2026-11-06');
  assert.equal(p.due.Delivery, '2026-11-13');
  W.setDue(p, 'Confirm Brief', '2026-11-01');
  p.cells['Back Up Photos'] = 'done';
  W.reschedule(p, '');
  assert.equal(p.due.Delivery, undefined);
  assert.equal(p.due['Confirm Brief'], '2026-11-01');
  assert.equal(p.due['Back Up Photos'], '2026-11-06');
  W.resetDue(p, 'Confirm Brief');
  assert.equal(p.due['Confirm Brief'], undefined);
  W.reschedule(p, '2026-12-06');
  assert.equal(p.due['Confirm Brief'], '2026-11-29');
});

test('calendar arithmetic handles leap days, month/year boundaries and DST dates', () => {
  for (const [date, before, after] of [
    ['2024-02-29', '2024-02-28', '2024-03-10'],
    ['2026-01-01', '2025-12-31', '2026-01-11'],
    ['2026-03-08', '2026-03-07', '2026-03-18'],
    ['2026-11-01', '2026-10-31', '2026-11-11']
  ]) {
    const p = {};
    W.applyPreset(p, 'portrait', date);
    assert.equal(p.due['Prepare Gear'], before);
    assert.equal(p.due.Delivery, after);
  }
});

test('invalid preset/date inputs never partially mutate the project', () => {
  const p = { name: 'Shoot', cells: { Editing: 'started' }, due: { Editing: '2026-11-06' } };
  for (const apply of [
    () => W.applyPreset(p, 'unknown', '2026-11-06'),
    () => W.applyPreset(p, 'portrait', '2026-02-30'),
    () => W.applyPreset(p, 'event', null),
    () => W.reschedule(p, 'tomorrow'),
    () => W.setDue(p, 'Editing', '2026-13-01'),
    () => W.setDue(p, '__proto__', '2026-11-01')
  ]) {
    const before = JSON.stringify(p);
    assert.throws(apply, /Workflow/);
    assert.equal(JSON.stringify(p), before);
  }
});

test('projects without a preset retain legacy fallback workflow and manual due dates', () => {
  const fallback = [{ n: 'Editing', c: '#123456', s: ['Select', 'Deliver'] }];
  const p = { due: { Select: '2026-11-01' } };
  assert.deepEqual(W.getPhases(p, fallback), fallback);
  assert.deepEqual(W.getSteps(p, fallback), ['Select', 'Deliver']);
  W.reschedule(p, '2026-12-06');
  assert.equal(p.due.Select, '2026-11-01');
  W.setDue(p, 'Select', '');
  assert.equal(p.due.Select, undefined);
  const before = JSON.stringify(p);
  W.resetDue(p, 'Select');
  assert.equal(JSON.stringify(p), before);
});

test('browser global exports the workflow API', () => {
  const context = {}; vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../studio-workflow'), 'utf8'), context);
  assert.equal(typeof context.StudioWorkflow.applyPreset, 'function');
  const p = {};
  context.StudioWorkflow.applyPreset(p, 'event', '2026-11-06');
  assert.equal(p.due.Delivery, '2026-11-13');
});
