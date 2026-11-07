(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./studio-model'), require('./studio-workflow'));
  else root.StudioOperations = factory(root.StudioModel, root.StudioWorkflow);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Model, Workflow) {
  'use strict';
  const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error('Studio operations: ' + message); };
  function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object.'); return value; }
  function text(value, label, nonempty = false) {
    if (typeof value !== 'string' || (nonempty && !value.trim())) fail(label + ' must be ' + (nonempty ? 'a nonempty string.' : 'a string.'));
    return value;
  }
  function identifier(value, label) { if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'number' && !Number.isFinite(value))) fail(label + ' is invalid.'); const result = String(value === undefined ? '' : value).trim(); if (!result || forbidden.has(result)) fail(label + ' is invalid.'); return result; }
  function numeric(value, label, minimum = 0, integer = false) {
    if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) fail(label + ' must be numeric.');
    const n = Number(value); if (!Number.isFinite(n) || n < minimum || (integer && !Number.isSafeInteger(n))) fail(label + ' is invalid.'); return n;
  }
  function cents(value) { const result = Math.round((value + Number.EPSILON) * 100) / 100; if (!Number.isFinite(result)) fail('Amount is too large.'); return result; }
  function date(value, label, blank = true) {
    text(value, label); if (!value && blank) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(label + ' must be a calendar date.');
    const parsed = new Date(value + 'T00:00:00Z'); if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(label + ' must be a real calendar date.'); return value;
  }
  function time(value, blank = true) {
    text(value, 'Shoot time'); if (!value && blank) return '';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail('Shoot time must use HH:mm.'); return value;
  }
  function timestamp(value, label) { text(value, label, true); const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) fail(label + ' is invalid.'); return parsed.toISOString(); }
  function patchObject(existing, patch, defaults, label) {
    if (existing !== undefined) object(existing, label); object(patch, label + ' changes');
    for (const key of Object.keys(patch)) if (!owns(defaults, key)) fail('Unknown ' + label + ' setting ' + key + '.');
    return Object.assign({}, defaults, existing || {}, patch);
  }
  const scheduleDefaults = Object.freeze({ durationMinutes: 120, setupMinutes: 0, travelMinutes: 0 });
  function configureSchedule(project, patch) {
    object(project, 'Project'); const result = patchObject(project.schedule, patch, scheduleDefaults, 'schedule');
    for (const key of Object.keys(scheduleDefaults)) { result[key] = numeric(result[key], key, key === 'durationMinutes' ? 1 : 0, true); if (result[key] > 10080) fail(key + ' must be at most seven days.'); }
    project.schedule = result; return result;
  }
  function interval(project) {
    object(project, 'Project');
    if (!project.date || !project.time) return null;
    date(project.date, 'Shoot date', false); time(project.time, false);
    const schedule = Object.assign({}, scheduleDefaults, project.schedule || {});
    for (const key of Object.keys(scheduleDefaults)) { schedule[key] = numeric(schedule[key], key, key === 'durationMinutes' ? 1 : 0, true); if (schedule[key] > 10080) fail(key + ' must be at most seven days.'); }
    // Interpret all projects as local wall-clock appointments in the studio's calendar.
    // UTC arithmetic preserves the entered date and time without the host timezone shifting them.
    const anchor = Date.parse(project.date + 'T' + project.time + ':00Z');
    const startMinutes = anchor / 60000 - schedule.setupMinutes, endMinutes = anchor / 60000 + schedule.durationMinutes + schedule.travelMinutes;
    const local = minutes => new Date(minutes * 60000).toISOString().slice(0, 16);
    return { start: local(startMinutes), end: local(endMinutes), startMinutes, endMinutes, durationMinutes: schedule.durationMinutes };
  }
  const active = project => !project.arch && (!project.booking || project.booking.stage !== 'canceled');
  function conflicts(project, projects) {
    if (!active(project)) return [];
    const own = interval(project); if (!own) return [];
    if (!Array.isArray(projects)) fail('Projects must be an array.');
    const overlaps = [];
    for (const other of projects) {
      if (other === project || String(other.id) === String(project.id) || !active(other)) continue;
      let slot; try { slot = interval(other); } catch (_) { continue; }
      if (!slot || own.startMinutes >= slot.endMinutes || slot.startMinutes >= own.endMinutes) continue;
      overlaps.push({ projectId: other.id, name: other.name, start: slot.start, end: slot.end, overlapStart: new Date(Math.max(own.startMinutes, slot.startMinutes) * 60000).toISOString().slice(0, 16), overlapEnd: new Date(Math.min(own.endMinutes, slot.endMinutes) * 60000).toISOString().slice(0, 16) });
    }
    return overlaps.sort((a, b) => a.start.localeCompare(b.start));
  }

  const deliveryStages = Object.freeze([
    { id: 'not_started', label: 'Not started' }, { id: 'gallery_sent', label: 'Gallery sent' }, { id: 'selections_received', label: 'Selections received' },
    { id: 'revisions', label: 'Revisions requested' }, { id: 'approved', label: 'Approved' }, { id: 'delivered', label: 'Delivered' }
  ].map(Object.freeze));
  const deliveryDefaults = Object.freeze({ stage: 'not_started', gallerySentAt: '', selectionsDue: '', revisions: '', approvedAt: '', deliveredAt: '' });
  function configureDelivery(project, patch) {
    object(project, 'Project'); const result = patchObject(project.delivery, patch, deliveryDefaults, 'delivery');
    if (!deliveryStages.some(stage => stage.id === result.stage)) fail('Delivery stage is not supported.');
    for (const key of ['gallerySentAt', 'selectionsDue', 'approvedAt', 'deliveredAt']) date(result[key], key);
    text(result.revisions, 'Revision notes'); project.delivery = result; return result;
  }
  function deliverySummary(project, today = new Date().toISOString().slice(0, 10)) {
    date(today, 'Today', false); const d = Object.assign({}, deliveryDefaults, project.delivery || {});
    return { ...d, label: (deliveryStages.find(stage => stage.id === d.stage) || deliveryStages[0]).label,
      awaitingClient: d.stage === 'gallery_sent' || d.stage === 'revisions',
      overdue: d.stage === 'gallery_sent' && !!d.selectionsDue && d.selectionsDue < today };
  }

  function expenseRecord(entry) {
    object(entry, 'Expense'); const result = { id: identifier(entry.id, 'Expense ID'), date: date(entry.date, 'Expense date', false), category: text(entry.category || 'Other', 'Expense category', true), description: text(entry.description || '', 'Expense description'), amount: cents(numeric(entry.amount, 'Expense amount')), currency: text(entry.currency, 'Expense currency', true).trim() };
    if (result.amount <= 0) fail('Expense amount must be greater than zero.'); return result;
  }
  function timeRecord(entry) {
    object(entry, 'Time entry'); return { id: identifier(entry.id, 'Time entry ID'), date: date(entry.date, 'Work date', false), description: text(entry.description || '', 'Work description'), minutes: numeric(entry.minutes, 'Work minutes', 1, true), rate: cents(numeric(entry.rate, 'Hourly rate')), currency: text(entry.currency, 'Work currency', true).trim() };
  }
  function addExpense(project, entry) {
    object(project, 'Project'); const item = expenseRecord(entry); if ((project.expenses || []).some(x => x.id === item.id)) fail('Expense ID already exists.');
    project.expenses = [...(project.expenses || []), item]; return item;
  }
  function addTime(project, entry) {
    object(project, 'Project'); const item = timeRecord(entry); if ((project.timeEntries || []).some(x => x.id === item.id)) fail('Time entry ID already exists.');
    project.timeEntries = [...(project.timeEntries || []), item]; return item;
  }
  function profitability(project, invoiceDefaults, currency) {
    const invoice = Model.calculate(project, invoiceDefaults || {}), invoiceCurrency = Model.invoiceCurrency(project, currency);
    const groups = new Map(); const group = key => { if (!groups.has(key)) groups.set(key, { currency: key, revenue: 0, invoiceTotal: 0, tax: 0, received: 0, monetaryCosts: 0, timeCost: 0, minutes: 0 }); return groups.get(key); };
    const main = group(invoiceCurrency); main.revenue = cents(invoice.sub - invoice.disc); main.invoiceTotal = cents(invoice.total); main.tax = cents(invoice.tax); main.received = cents(invoice.paid);
    if (project.invCancel) { main.revenue = 0; main.invoiceTotal = 0; main.tax = 0; }
    for (const raw of project.expenses || []) { const entry = expenseRecord(raw), g = group(entry.currency); g.monetaryCosts = cents(g.monetaryCosts + entry.amount); }
    for (const raw of project.timeEntries || []) { const entry = timeRecord(raw), g = group(entry.currency); g.timeCost = cents(g.timeCost + entry.minutes / 60 * entry.rate); g.minutes += entry.minutes; }
    const rows = [...groups.values()].map(g => ({ ...g, totalCost: cents(g.monetaryCosts + g.timeCost), profit: cents(g.revenue - g.monetaryCosts - g.timeCost), estimatedProfit: cents(g.revenue - g.monetaryCosts - g.timeCost), timeCostEstimated: g.timeCost, cashNet: cents(g.received - g.monetaryCosts) }));
    return { ...rows.find(g => g.currency === invoiceCurrency), groups: rows, hasOtherCurrencies: rows.length > 1 };
  }

  function duplicateProject(project, options) {
    object(project, 'Project'); object(options, 'Duplicate options');
    const newId = identifier(options.id, 'New project ID'); if (newId === String(project.id)) fail('The duplicate needs a new ID.');
    const newName = text(options.name, 'New project name', true).trim(), newDate = date(options.date === undefined ? '' : options.date, 'New shoot date');
    const invoice = Model.calculate(project, options.invoiceDefaults || {}), next = { id: newId, name: newName, date: newDate, amount: invoice.sub, items: clone(invoice.ls), invDisc: invoice.disc, invTax: invoice.r, cells: {} };
    const currency = Model.invoiceCurrency(project, options.currency); if (currency) next.invCurrency = currency;
    for (const key of ['brief', 'pkg', 'location', 'time']) if (typeof project[key] === 'string') next[key] = project[key];
    if (options.copyClient !== false) for (const key of ['client', 'email', 'phone', 'cid']) if (project[key] !== undefined) next[key] = clone(project[key]);
    for (const key of ['shots', 'gear']) if (Array.isArray(project[key])) next[key] = project[key].map(item => ({ t: text(item.t, 'Checklist item'), d: false }));
    if (project.schedule) { next.schedule = clone(project.schedule); configureSchedule(next, {}); }
    if (project.workflow) {
      next.workflow = clone(project.workflow); next.workflow.autoDates = {}; next.workflow.manualDates = {}; next.due = {};
      Workflow.reschedule(next, newDate);
    }
    if (project.booking) next.booking = { stage: 'enquiry', depositType: project.booking.depositType || 'percent', depositValue: numeric(project.booking.depositValue || 0, 'Deposit value'), depositDue: '', balanceDue: '' };
    return next;
  }

  function draftKey(value) { const key = text(value, 'Template name', true); if (forbidden.has(key)) fail('Template name is not supported.'); return key; }
  function saveDraft(project, template, subject, body, updatedAt = new Date().toISOString()) {
    object(project, 'Project'); const key = draftKey(template), draft = { subject: text(subject, 'Draft subject'), body: text(body, 'Draft message'), updatedAt: timestamp(updatedAt, 'Draft update time') };
    if (project.messageDrafts !== undefined) object(project.messageDrafts, 'Message drafts');
    project.messageDrafts = Object.assign({}, project.messageDrafts || {}, { [key]: draft }); return clone(draft);
  }
  function getDraft(project, template) {
    const key = draftKey(template), draft = project.messageDrafts && owns(project.messageDrafts, key) ? project.messageDrafts[key] : null;
    return draft ? clone(draft) : null;
  }
  function clearDraft(project, template) {
    const key = draftKey(template); if (!project.messageDrafts || !owns(project.messageDrafts, key)) return false;
    const drafts = Object.assign({}, project.messageDrafts); delete drafts[key]; project.messageDrafts = drafts; return true;
  }

  function createOffer(project, invoiceDefaults, currency, options) {
    object(project, 'Project'); object(options, 'Offer options');
    if (project.invCancel || project.booking && project.booking.stage === 'canceled') fail('A canceled booking cannot create a client offer.');
    const now = options.createdAt ? timestamp(options.createdAt, 'Created time') : new Date().toISOString();
    let expiration = options.expiresAt || new Date(Date.parse(now) + 30 * 86400000).toISOString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(expiration)) expiration = date(expiration, 'Expiry date', false) + 'T23:59:59.999Z';
    expiration = timestamp(expiration, 'Expiry time'); if (Date.parse(expiration) <= Date.parse(now)) fail('Offer expiry must be after creation.');
    const p = Model.invoiceView(project), business = Model.invoiceDefaults(project, invoiceDefaults || {}), calc = Model.calculate(project, invoiceDefaults || {});
    const plan = project.booking || { depositType: 'percent', depositValue: 0, depositDue: '', balanceDue: '' };
    const type = plan.depositType === 'fixed' ? 'fixed' : 'percent', depositValue = numeric(plan.depositValue || 0, 'Deposit value');
    const requested = type === 'fixed' ? depositValue : Math.max(0, calc.total) * depositValue / 100;
    if(Math.min(Math.max(0,calc.total),requested)+(plan.installments||[]).reduce((sum,item)=>sum+Number(item.amount),0)>calc.total+0.011)fail('Adjust the installment plan to match the invoice total before exporting an offer.');
    return {
      app: 'StudioAidOffer', version: 1, offerId: identifier(options.id, 'Offer ID'), projectId: identifier(project.id, 'Project ID'), createdAt: now, expiresAt: expiration,
      business: { name: String(business.biz || 'Your studio'), tagline: String(business.tagline || ''), contact: String(business.contact || ''), paymentInstructions: String(business.pay || ''), footer: String(business.foot || ''), color: /^#[0-9a-f]{6}$/i.test(business.color || '') ? business.color : '#2b2b2b', logo: typeof business.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(business.logo) ? business.logo : '', social: String(business.social || '') },
      client: { name: String(p.client || ''), email: String(p.email || ''), phone: String(p.phone || '') },
      shoot: { name: text(project.name, 'Project name', true), date: date(project.date || '', 'Shoot date'), time: time(project.time || ''), location: String(project.location || ''), durationMinutes: (project.schedule || scheduleDefaults).durationMinutes || scheduleDefaults.durationMinutes },
      quote: { currency: text(Model.invoiceCurrency(project, currency), 'Invoice currency', true), number: String(p.inv || ''), revision: numeric(project.invRevision || 0, 'Invoice revision', 0, true), lines: calc.ls.map(item => ({ description: String(item.d || ''), quantity: Number(item.qty) || 0, unitPrice: Number(item.price) || 0, amount: cents((Number(item.qty) || 0) * (Number(item.price) || 0)) })), subtotal: calc.sub, discount: calc.disc, taxRate: calc.r, tax: calc.tax, total: calc.total,
        deposit: { type, value: depositValue, required: cents(Math.min(Math.max(0, calc.total), requested)), due: date(plan.depositDue || '', 'Deposit due date') }, installments: (plan.installments || []).map(item => ({ id: identifier(item.id, 'Installment ID'), label: text(item.label, 'Installment label', true), amount: cents(numeric(item.amount, 'Installment amount')), due: date(item.due, 'Installment due date') })), balanceDue: date(plan.balanceDue || p.invDue || '', 'Balance due date') }
    };
  }
  return Object.freeze({ configureSchedule, interval, conflicts, deliveryStages, configureDelivery, deliverySummary, addExpense, addTime, profitability, duplicateProject, saveDraft, getDraft, clearDraft, createOffer });
});
