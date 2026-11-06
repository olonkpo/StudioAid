(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./studio-model'));
  else root.StudioBooking = factory(root.StudioModel);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Model) {
  'use strict';
  if (!Model || typeof Model.calculate !== 'function' || typeof Model.outstanding !== 'function') {
    throw new Error('StudioBooking requires StudioModel.');
  }

  const stages = Object.freeze([
    Object.freeze({ id: 'enquiry', label: 'Enquiry' }),
    Object.freeze({ id: 'quote', label: 'Quote' }),
    Object.freeze({ id: 'deposit', label: 'Awaiting deposit' }),
    Object.freeze({ id: 'booked', label: 'Booked' }),
    Object.freeze({ id: 'completed', label: 'Completed' }),
    Object.freeze({ id: 'canceled', label: 'Canceled' })
  ]);
  const defaults = Object.freeze({ stage: 'enquiry', depositType: 'percent', depositValue: 0, depositDue: '', balanceDue: '' });
  const keys = Object.keys(defaults);
  const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const fail = message => { throw new Error('Invalid booking: ' + message); };
  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object.');
    return value;
  }
  function date(value, label) {
    if (value === '') return value;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(label + ' must be a calendar date or blank.');
    const parsed = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(label + ' must be a real calendar date.');
    return value;
  }
  function numeric(value) {
    if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) fail('deposit value must be numeric.');
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) fail('deposit value must be a finite, nonnegative number.');
    return number;
  }
  function money(value) {
    if (!Number.isFinite(value)) fail('invoice amounts must be finite.');
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(rounded)) fail('invoice amounts are too large.');
    return rounded;
  }
  function configuration(existing, patch) {
    if (existing !== undefined) object(existing, 'settings');
    if (patch !== undefined) {
      object(patch, 'changes');
      for (const key of Object.keys(patch)) if (!keys.includes(key)) fail('unknown setting ' + key + '.');
    }
    const result = {};
    for (const key of keys) result[key] = patch && owns(patch, key) ? patch[key] : existing && owns(existing, key) ? existing[key] : defaults[key];
    if (!stages.some(stage => stage.id === result.stage)) fail('stage is not supported.');
    if (result.depositType !== 'percent' && result.depositType !== 'fixed') fail('deposit type must be percent or fixed.');
    result.depositValue = numeric(result.depositValue);
    if (result.depositType === 'percent' && result.depositValue > 100) fail('deposit percentage must be between 0 and 100.');
    if (result.depositType === 'fixed') result.depositValue = money(result.depositValue);
    date(result.depositDue, 'deposit due date'); date(result.balanceDue, 'balance due date');
    return result;
  }

  function configure(project, patch) {
    object(project, 'project');
    const result = configuration(project.booking, patch);
    // Validate the entire merged configuration before replacing anything on the project.
    project.booking = result;
    return result;
  }
  function localToday() {
    const now = new Date();
    return String(now.getFullYear()).padStart(4, '0') + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }
  function summary(project, invoiceDefaults, todayDate) {
    object(project, 'project');
    const booking = configuration(project.booking);
    const today = todayDate === undefined ? localToday() : date(todayDate, 'today');
    if (!today) fail('today must be a calendar date.');
    // StudioModel uses the issued invoice snapshot for totals while keeping actual payments live.
    const invoice = Model.calculate(project, invoiceDefaults || {});
    const total = money(invoice.total), paid = money(invoice.paid);
    const canceled = booking.stage === 'canceled' || !!project.invCancel;
    const balance = canceled ? 0 : money(Math.max(0, Model.outstanding(project, invoiceDefaults || {})));
    const maximum = Math.max(0, total);
    const requested = booking.depositType === 'percent' ? maximum * booking.depositValue / 100 : booking.depositValue;
    const depositRequired = money(Math.min(maximum, requested));
    const depositPaid = money(Math.min(depositRequired, Math.max(0, paid)));
    const depositRemaining = canceled ? 0 : money(Math.min(balance, Math.max(0, depositRequired - depositPaid)));
    const nextAmount = canceled ? 0 : depositRemaining > 0 ? depositRemaining : balance;
    const invoiceDue = Model.invoiceView(project).invDue || '';
    const nextDue = nextAmount <= 0 ? '' : depositRemaining > 0 ? booking.depositDue : booking.balanceDue || invoiceDue;
    const overdue = nextAmount > 0 && nextDue !== '' && nextDue < today;
    return {
      stage: booking.stage,
      label: stages.find(stage => stage.id === booking.stage).label,
      total, paid, balance, depositRequired, depositPaid, depositRemaining,
      nextAmount, nextDue, overdue,
      readyToBook: !canceled && depositRemaining === 0
    };
  }

  return Object.freeze({ stages, configure, summary });
});
