'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Data = require('../studio-data');
const Workflow = require('../studio-workflow');
const Booking = require('../studio-booking');
const Operations = require('../studio-operations');
const Client = require('../studio-client');

const project = () => ({ id: 'p1', name: 'Portrait', date: '2026-12-01', time: '10:00', amount: 1000, cells: {} });
const preset = () => ({ id: 'custom-portraits', name: 'Portrait delivery', description: 'Studio process', phases: [{ n: 'Production', c: '#225d47', s: ['Edit', 'Send gallery'] }], offsets: { Edit: 2, 'Send gallery': 7 } });
const milestone = () => ({ id: 'second', label: 'Second payment', amount: 400, due: '2026-12-05' });
const restoreProject = patch => Data.parseBackup({ projects: [{ ...project(), ...patch }] }).projects[0];

test('all new feature state survives backup and remains usable by its feature modules', () => {
  const p = project(), custom = preset(), defaults = { biz: 'Studio', tax: 10 };
  Workflow.applyPreset(p, custom.id, p.date, [custom]);
  Workflow.setDue(p, 'Send gallery', '2026-12-12');
  Booking.configure(p, { stage: 'quote', depositValue: 30, installments: [milestone()] });
  Operations.configureSchedule(p, { durationMinutes: 90, setupMinutes: 20, travelMinutes: 30 });
  Operations.configureDelivery(p, { stage: 'gallery_sent', gallerySentAt: '2026-12-02', selectionsDue: '2026-12-04', revisions: 'Two edits' });
  Operations.addExpense(p, { id: 'expense', date: '2026-11-06', category: 'Travel', description: 'Transport', amount: 50, currency: 'GHS' });
  Operations.addTime(p, { id: 'editing', date: '2026-11-06', description: 'Editing', minutes: 90, rate: 40, currency: 'GHS' });
  Operations.saveDraft(p, 'Reminder', 'Your portrait', 'Personal message', '2026-11-06T12:00:00Z');
  p.clientOffer = Operations.createOffer(p, defaults, 'GHS', { id: 'offer', createdAt: '2026-11-06T12:00:00Z' });
  Client.applyResponse(p, { app: 'StudioAidClientResponse', version: 1, offerId: 'offer', projectId: 'p1', status: 'approved', submittedAt: '2026-11-07T12:00:00Z', response: { preferences: 'Natural light' } }, defaults, 'GHS');
  const source = { projects: [p], workflowPresets: [custom] }, snapshot = structuredClone(source);
  const restored = Data.parseBackup(JSON.stringify(Data.createBackup(source))), result = restored.projects[0];
  assert.deepEqual(result, p);
  assert.deepEqual(source, snapshot, 'backup must not mutate studio state');
  assert.deepEqual(Workflow.presets(restored.workflowPresets).at(-1), custom);
  assert.deepEqual(Operations.interval(result), Operations.interval(p));
  assert.deepEqual(Operations.profitability(result, defaults, 'GHS'), Operations.profitability(p, defaults, 'GHS'));
  assert.deepEqual(Operations.deliverySummary(result, '2026-12-06'), Operations.deliverySummary(p, '2026-12-06'));
  assert.deepEqual(Booking.summary(result, defaults, '2026-12-06'), Booking.summary(p, defaults, '2026-12-06'));
  assert.equal(Operations.getDraft(result, 'Reminder').body, 'Personal message');
  assert.equal(result.clientResponses[0].response.preferences, 'Natural light');
  assert.equal(result.quoteApproval.status, 'approved');
  Workflow.reschedule(result, '2027-01-01');
  assert.equal(result.due.Edit, '2027-01-03');
  assert.equal(result.due['Send gallery'], '2026-12-12');
  assert.doesNotThrow(() => Data.parseBackup(restored));
});

test('undated installment plans created by Booking remain savable and usable after restore', () => {
  const p = project();
  Booking.configure(p, { depositValue: 20, balanceDue: '2026-12-10', installments: [{ ...milestone(), due: '' }] });
  const expected = Booking.summary(p, {}, '2026-12-06');
  const result = Data.parseBackup(Data.createBackup({ projects: [p] })).projects[0];
  assert.equal(result.booking.installments[0].due, '');
  assert.deepEqual(Booking.summary(result, {}, '2026-12-06'), expected);
});

test('restored custom presets meet the same validation rules as presets created in the app', () => {
  const cases = [
    { ...preset(), name: 'x'.repeat(101) },
    { ...preset(), description: 'x'.repeat(501) },
    { ...preset(), phases: Array.from({ length: 13 }, (_, i) => ({ n: 'Phase', c: '#225d47', s: ['Step ' + i] })) },
    { ...preset(), phases: [{ n: 'Production', c: '#225d47', s: ['Edit', 'Edit'] }] },
    { ...preset(), phases: [{ n: 'Production', c: '#225d47', s: ['constructor'] }], offsets: {} },
    { ...preset(), phases: [{ n: 'x'.repeat(101), c: '#225d47', s: ['Edit'] }], offsets: { Edit: 0 } },
    { ...preset(), phases: [{ n: 'Production', c: '#225d47', s: Array.from({ length: 101 }, (_, i) => 'Step ' + i) }], offsets: Object.fromEntries(Array.from({ length: 101 }, (_, i) => ['Step ' + i, 0])) },
    { ...preset(), offsets: { Edit: 2 } },
    { ...preset(), offsets: { Edit: 2, 'Send gallery': 3651 } },
    { ...preset(), offsets: { Edit: 2, 'Send gallery': 7, Unexpected: 0 } }
  ];
  for (const value of cases) {
    assert.throws(() => Workflow.validatePreset(value), /Workflow:/);
    assert.throws(() => Data.parseBackup({ projects: [], workflowPresets: [value] }), /Invalid StudioAid backup: workflowPresets/);
  }
  assert.throws(() => Data.parseBackup({ projects: [], workflowPresets: [preset(), preset()] }), /duplicated/);
  const value = { ...preset(), name: '  Portrait delivery  ', description: undefined };
  const restored = Data.parseBackup({ projects: [], workflowPresets: [value] }).workflowPresets[0];
  assert.deepEqual(restored, Workflow.validatePreset(value));
  assert.equal(Data.hasStudioData({ projects: [], workflowPresets: [preset()] }), true);
});

test('invalid installment imports are rejected before they can break booking summaries', () => {
  const p = project(); Booking.configure(p, { installments: [milestone()] });
  const invalid = [
    null, Array.from({ length: 37 }, (_, i) => ({ ...milestone(), id: 'i' + i })),
    [milestone(), milestone()], [{ ...milestone(), id: 1 }], [{ ...milestone(), id: 'constructor' }],
    [{ ...milestone(), id: 'i'.repeat(81) }], [{ ...milestone(), label: 'x'.repeat(121) }],
    [{ ...milestone(), amount: 0 }], [{ ...milestone(), due: '2026-02-30' }]
  ];
  for (const installments of invalid) assert.throws(() => restoreProject({ booking: { ...p.booking, installments } }), /Invalid StudioAid backup/);
});

test('malformed operations metadata is rejected before restore', () => {
  const cases = [
    { schedule: { durationMinutes: 0, setupMinutes: 0, travelMinutes: 0 } },
    { schedule: { durationMinutes: 60, setupMinutes: 0.5, travelMinutes: 0 } },
    { schedule: { durationMinutes: 60, setupMinutes: 0, travelMinutes: 10081 } },
    { delivery: { stage: 'unknown', gallerySentAt: '', selectionsDue: '', approvedAt: '', deliveredAt: '', revisions: '' } },
    { expenses: [{ id: 'e', date: '2026-02-30', category: 'Other', description: '', amount: 10, currency: 'GHS' }] },
    { timeEntries: [{ id: 't', date: '2026-11-06', description: '', minutes: 0, rate: 10, currency: 'GHS' }] },
    { messageDrafts: { Reminder: { subject: '', body: 'Saved', updatedAt: 'invalid' } } },
    { clientOffer: { app: 'StudioAidOffer', version: 2 } },
    { clientResponses: [{ offerId: 'o', projectId: 'p1', status: 'invalid', submittedAt: '2026-11-06T12:00:00Z', response: {} }] }
  ];
  for (const value of cases) assert.throws(() => restoreProject(value), /Invalid StudioAid backup/);
});

test('browser data validation uses the workflow validator and preserves legacy empty backups', () => {
  const context = {}; vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../studio-workflow'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../studio-data'), 'utf8'), context);
  const valid = JSON.stringify({ projects: [], workflowPresets: [preset()] });
  assert.equal(context.StudioData.parseBackup(valid).workflowPresets[0].name, 'Portrait delivery');
  assert.throws(() => context.StudioData.parseBackup(JSON.stringify({ projects: [], workflowPresets: [{ ...preset(), name: 'x'.repeat(101) }] })), /Invalid StudioAid backup/);
  assert.equal(context.StudioData.parseBackup('{"projects":[]}').workflowPresets.length, 0);
});
