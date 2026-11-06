'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Model = require('../studio-model');
const Booking = require('../studio-booking');
const today = '2026-11-06';
const defaults = { tax: '10', biz: 'My Studio', title: 'Invoice' };
const project = () => ({ id: 'p1', name: 'Portrait session', amount: 1000, pay: [] });

test('legacy projects use zero deposit and enquiry stage without being changed', () => {
  const p = project(), before = JSON.stringify(p);
  const result = Booking.summary(p, defaults, today);
  assert.equal(result.stage, 'enquiry'); assert.equal(result.label, 'Enquiry');
  assert.equal(result.total, 1100); assert.equal(result.balance, 1100);
  assert.equal(result.depositRequired, 0); assert.equal(result.depositRemaining, 0);
  assert.equal(result.nextAmount, 1100); assert.equal(result.nextDue, '');
  assert.equal(result.readyToBook, true); assert.equal(result.overdue, false);
  assert.equal(JSON.stringify(p), before);
});

test('configuration emits a complete schema, preserves unchanged fields and normalizes numeric input', () => {
  const p = project();
  const result = Booking.configure(p, { stage: 'quote', depositType: 'fixed', depositValue: '250.005', depositDue: '2026-11-10' });
  assert.deepEqual(result, { stage: 'quote', depositType: 'fixed', depositValue: 250.01, depositDue: '2026-11-10', balanceDue: '' });
  assert.equal(result, p.booking);
  Booking.configure(p, { balanceDue: '2026-12-01' });
  assert.equal(p.booking.depositValue, 250.01); assert.equal(p.booking.balanceDue, '2026-12-01');
});

test('invalid configuration never partially mutates the project', () => {
  const invalid = [
    { stage: 'unknown' }, { depositType: 'ratio' }, { depositValue: -1 }, { depositValue: NaN },
    { depositValue: Infinity }, { depositValue: null }, { depositValue: '' }, { depositValue: 'wrong' },
    { depositType: 'percent', depositValue: 100.01 }, { depositType: 'fixed', depositValue: 1e308 }, { depositDue: '2026-02-30' },
    { balanceDue: '2026-2-01' }, { balanceDue: '2026-11-31' }, { extra: true }
  ];
  for (const patch of invalid) {
    const p = project(); Booking.configure(p, { stage: 'quote', depositValue: 20 });
    const before = JSON.stringify(p), booking = p.booking;
    assert.throws(() => Booking.configure(p, { ...patch, balanceDue: patch.balanceDue ?? '2026-12-01' }), /Invalid booking/);
    assert.equal(JSON.stringify(p), before); assert.equal(p.booking, booking);
  }
  const fresh = project(); assert.throws(() => Booking.configure(fresh, { stage: 'wrong' })); assert.equal('booking' in fresh, false);
});

test('percentage deposits use the full invoice total and live payments without moving the stage', () => {
  const p = project();
  Booking.configure(p, { stage: 'deposit', depositType: 'percent', depositValue: 30, depositDue: '2026-11-01', balanceDue: '2026-11-20' });
  p.pay.push({ amt: 100 });
  const result = Booking.summary(p, defaults, today);
  assert.equal(result.depositRequired, 330); assert.equal(result.depositPaid, 100); assert.equal(result.depositRemaining, 230);
  assert.equal(result.balance, 1000); assert.equal(result.nextAmount, 230); assert.equal(result.nextDue, '2026-11-01');
  assert.equal(result.overdue, true); assert.equal(result.readyToBook, false);
  p.pay.push({ amt: 230 });
  const satisfied = Booking.summary(p, defaults, today);
  assert.equal(satisfied.stage, 'deposit'); assert.equal(p.booking.stage, 'deposit');
  assert.equal(satisfied.depositRemaining, 0); assert.equal(satisfied.readyToBook, true);
  assert.equal(satisfied.nextAmount, 770); assert.equal(satisfied.nextDue, '2026-11-20'); assert.equal(satisfied.overdue, false);
});

test('fixed deposit is capped at total and overpaid projects never show negative collections', () => {
  const p = project(); Booking.configure(p, { depositType: 'fixed', depositValue: 2000 });
  assert.equal(Booking.summary(p, defaults, today).depositRequired, 1100);
  p.pay = [{ amt: 1500 }];
  const result = Booking.summary(p, defaults, today);
  assert.equal(result.paid, 1500); assert.equal(result.balance, 0);
  assert.equal(result.depositPaid, 1100); assert.equal(result.depositRemaining, 0);
  assert.equal(result.nextAmount, 0); assert.equal(result.nextDue, ''); assert.equal(result.overdue, false);
});

test('issued invoice totals and due date stay frozen while payments remain live', () => {
  const p = project(); p.invDue = '2026-11-01';
  Model.issueInvoice(p, defaults, 'GHS');
  Booking.configure(p, { depositType: 'percent', depositValue: 30 });
  p.amount = 9999; p.invDue = '2027-01-01';
  const newer = { ...defaults, tax: '50' };
  const result = Booking.summary(p, newer, today);
  assert.equal(result.total, 1100); assert.equal(result.depositRequired, 330);
  p.pay.push({ amt: 330 });
  const paidDeposit = Booking.summary(p, newer, today);
  assert.equal(paidDeposit.balance, 770); assert.equal(paidDeposit.nextDue, '2026-11-01'); assert.equal(paidDeposit.overdue, true);
  assert.equal(Model.invoiceCurrency(p, 'USD'), 'GHS');
});

test('canceled stages and canceled invoices suppress collection without erasing financial history', () => {
  for (const cancelInvoice of [false, true]) {
    const p = project(); p.pay = [{ amt: 100 }];
    Booking.configure(p, { stage: cancelInvoice ? 'booked' : 'canceled', depositValue: 30, depositDue: '2026-01-01' });
    if (cancelInvoice) p.invCancel = true;
    const result = Booking.summary(p, defaults, today);
    assert.equal(result.total, 1100); assert.equal(result.paid, 100); assert.equal(result.depositRequired, 330);
    assert.equal(result.balance, 0); assert.equal(result.depositRemaining, 0); assert.equal(result.nextAmount, 0);
    assert.equal(result.nextDue, ''); assert.equal(result.overdue, false); assert.equal(result.readyToBook, false);
  }
});

test('explicit booked/completed stage does not bypass an outstanding deposit or auto-change', () => {
  for (const stage of ['booked', 'completed']) {
    const p = project(); Booking.configure(p, { stage, depositValue: 25, depositDue: '2026-11-06' });
    const result = Booking.summary(p, defaults, today);
    assert.equal(result.stage, stage); assert.equal(result.nextAmount, 275); assert.equal(result.readyToBook, false);
    assert.equal(result.overdue, false, 'due today is not overdue');
  }
});

test('deposit and balances round to cents and refund payments reopen readiness', () => {
  const p = { name: 'Small session', amount: 10.01, pay: [{ amt: 3.33 }, { amt: -1 }] };
  Booking.configure(p, { depositValue: 33.3, depositDue: '2026-11-07' });
  const result = Booking.summary(p, { tax: 0 }, today);
  assert.equal(result.total, 10.01); assert.equal(result.paid, 2.33); assert.equal(result.balance, 7.68);
  assert.equal(result.depositRequired, 3.33); assert.equal(result.depositPaid, 2.33); assert.equal(result.depositRemaining, 1);
  assert.equal(result.readyToBook, false); assert.equal(result.nextAmount, 1);
});

test('zero totals never require deposits or show overdue amounts; invalid today dates are rejected', () => {
  const p = { name: 'Free session', amount: 0, pay: [] };
  Booking.configure(p, { depositType: 'fixed', depositValue: 100, depositDue: '2026-01-01' });
  const result = Booking.summary(p, {}, today);
  assert.equal(result.depositRequired, 0); assert.equal(result.nextAmount, 0); assert.equal(result.readyToBook, true); assert.equal(result.overdue, false);
  assert.throws(() => Booking.summary(p, {}, '2026-02-30'), /Invalid booking/);
});

test('browser global exposes the same stages and calculations without CommonJS', () => {
  const context = { StudioModel: Model }; vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../studio-booking'), 'utf8'), context);
  const BookingBrowser = context.StudioBooking;
  assert.equal(BookingBrowser.stages.map(stage => stage.id).join(','), 'enquiry,quote,deposit,booked,completed,canceled');
  const p = project(); BookingBrowser.configure(p, { depositValue: 30 });
  assert.equal(BookingBrowser.summary(p, defaults, today).depositRequired, 330);
});
