(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudioWorkflow = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRESETS = [
    {
      id: 'wedding', name: 'Wedding', description: 'Plan the day, deliver sneak peeks, and finish the full gallery.',
      phases: [
        { n: 'Planning', c: '#3b6ea5', s: ['Confirm Booking', 'Collect Deposit', 'Send Questionnaire', 'Confirm Wedding Timeline', 'Send Reminder'] },
        { n: 'Shoot day', c: '#6a5aa5', s: ['Prepare Gear', 'Photograph Wedding', 'Back Up Photos'] },
        { n: 'Delivery', c: '#2f8a6b', s: ['Send Sneak Peeks', 'Delivery', 'Follow-up'] }
      ],
      offsets: { 'Confirm Booking': -60, 'Collect Deposit': -45, 'Send Questionnaire': -21, 'Confirm Wedding Timeline': -7, 'Send Reminder': -2, 'Prepare Gear': -1, 'Photograph Wedding': 0, 'Back Up Photos': 0, 'Send Sneak Peeks': 3, Delivery: 30, 'Follow-up': 37 }
    },
    {
      id: 'portrait', name: 'Portrait', description: 'Prepare the session and deliver a finished portrait gallery.',
      phases: [
        { n: 'Preparation', c: '#3b6ea5', s: ['Confirm Booking', 'Collect Deposit', 'Confirm Brief', 'Send Reminder'] },
        { n: 'Session', c: '#6a5aa5', s: ['Prepare Gear', 'Photograph Session', 'Back Up Photos'] },
        { n: 'Delivery', c: '#2f8a6b', s: ['Send Proof Gallery', 'Delivery', 'Follow-up'] }
      ],
      offsets: { 'Confirm Booking': -14, 'Collect Deposit': -14, 'Confirm Brief': -7, 'Send Reminder': -2, 'Prepare Gear': -1, 'Photograph Session': 0, 'Back Up Photos': 0, 'Send Proof Gallery': 3, Delivery: 10, 'Follow-up': 14 }
    },
    {
      id: 'event', name: 'Event', description: 'Confirm coverage, prepare equipment, and turn around event photos.',
      phases: [
        { n: 'Preparation', c: '#3b6ea5', s: ['Confirm Booking', 'Collect Deposit', 'Confirm Brief', 'Confirm Event Schedule', 'Send Reminder'] },
        { n: 'Coverage', c: '#6a5aa5', s: ['Prepare Gear', 'Photograph Event', 'Back Up Photos'] },
        { n: 'Delivery', c: '#2f8a6b', s: ['Send Preview Photos', 'Delivery', 'Follow-up'] }
      ],
      offsets: { 'Confirm Booking': -21, 'Collect Deposit': -14, 'Confirm Brief': -7, 'Confirm Event Schedule': -3, 'Send Reminder': -2, 'Prepare Gear': -1, 'Photograph Event': 0, 'Back Up Photos': 0, 'Send Preview Photos': 1, Delivery: 7, 'Follow-up': 10 }
    }
  ];
  const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
  const clone = value => JSON.parse(JSON.stringify(value));
  const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
  function fail(message) { throw new Error('Workflow: ' + message); }
  function stepName(value) {
    if (typeof value !== 'string' || !value.trim() || unsafe.has(value)) fail('invalid step');
    return value;
  }
  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object');
    return value;
  }
  function dateValue(value) {
    if (typeof value !== 'string') fail('shoot date must be a date string');
    if (!value) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('invalid date');
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('invalid date');
    return value;
  }
  function addDays(value, offset) {
    const date = new Date(value + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + offset);
    if (!Number.isFinite(date.getTime())) fail('scheduled date is outside the supported range');
    const result = date.toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) fail('scheduled date is outside the supported range');
    return result;
  }
  function map(value, label) {
    if (value === undefined) return {};
    object(value, label);
    for (const key of Object.keys(value)) stepName(key);
    return clone(value);
  }
  function workingState(project) {
    object(project, 'project');
    const due = map(project.due, 'due dates'), cells = map(project.cells, 'workflow statuses');
    for (const value of Object.values(due)) dateValue(value);
    let workflow = null;
    if (project.workflow !== undefined) {
      object(project.workflow, 'workflow');
      workflow = clone(project.workflow);
      workflow.offsets = map(workflow.offsets, 'offsets');
      workflow.autoDates = map(workflow.autoDates, 'automatic dates');
      workflow.manualDates = map(workflow.manualDates, 'manual dates');
      for (const offset of Object.values(workflow.offsets)) if (!Number.isSafeInteger(offset)) fail('offsets must be whole days');
      for (const value of Object.values(workflow.autoDates)) if (!dateValue(value)) fail('automatic dates cannot be blank');
      for (const value of Object.values(workflow.manualDates)) if (typeof value !== 'boolean') fail('manual date markers must be booleans');
    }
    return { due, cells, workflow };
  }
  function detectOverrides(state) {
    const workflow = state.workflow;
    if (!workflow) return;
    // Also detect dates changed by an older app or an external editor. A
    // missing due date where one was generated means an intentional clear.
    for (const step of Object.keys(workflow.autoDates)) {
      if ((state.due[step] || '') !== workflow.autoDates[step]) workflow.manualDates[step] = true;
    }
    for (const step of Object.keys(state.due)) {
      if (!own(workflow.autoDates, step)) workflow.manualDates[step] = true;
    }
  }
  function schedule(state, shootDate) {
    const workflow = state.workflow;
    if (!workflow) return;
    for (const [step, offset] of Object.entries(workflow.offsets)) {
      if (workflow.manualDates[step] || state.cells[step] === 'done') continue;
      if (shootDate) {
        const date = addDays(shootDate, offset);
        state.due[step] = date;
        workflow.autoDates[step] = date;
      } else {
        if (state.due[step] === workflow.autoDates[step]) delete state.due[step];
        delete workflow.autoDates[step];
      }
    }
  }
  function commit(project, state, date) {
    project.date = date;
    project.due = state.due;
    if (project.cells === undefined) project.cells = {};
    if (state.workflow) project.workflow = state.workflow;
    return project;
  }
  function validatePreset(raw) {
    object(raw, 'custom preset');
    if (typeof raw.id !== 'string' || !/^custom-[a-z0-9][a-z0-9-]{0,72}$/.test(raw.id)) fail('custom preset ID must start with custom- and use lowercase letters, digits or hyphens');
    if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.trim().length > 100) fail('preset name is required and must be at most 100 characters');
    if (raw.description !== undefined && (typeof raw.description !== 'string' || raw.description.length > 500)) fail('preset description must be at most 500 characters');
    if (!Array.isArray(raw.phases) || !raw.phases.length || raw.phases.length > 12) fail('a preset needs between 1 and 12 phases');
    object(raw.offsets, 'preset offsets');
    const seen = new Set(), phases = raw.phases.map((phase, i) => {
      object(phase, 'phase ' + (i + 1));
      if (typeof phase.n !== 'string' || !phase.n.trim() || phase.n.trim().length > 100) fail('phase name is required and must be at most 100 characters');
      if (typeof phase.c !== 'string' || !/^#[0-9a-f]{6}$/i.test(phase.c)) fail('phase color must be a hex color');
      if (!Array.isArray(phase.s) || !phase.s.length) fail('every phase needs at least one step');
      return { n: phase.n.trim(), c: phase.c, s: phase.s.map(value => {
        const step = stepName(value).trim();
        if (step.length > 120 || unsafe.has(step) || seen.has(step)) fail('steps must be unique, safe names of at most 120 characters');
        seen.add(step); return step;
      }) };
    });
    if (seen.size > 100) fail('a preset can contain at most 100 steps');
    const offsets = {};
    for (const step of seen) {
      if (!own(raw.offsets, step) || !Number.isSafeInteger(raw.offsets[step]) || Math.abs(raw.offsets[step]) > 3650) fail('every step needs a whole-day offset between -3650 and 3650');
      offsets[step] = raw.offsets[step];
    }
    for (const step of Object.keys(raw.offsets)) if (!seen.has(step)) fail('offsets may only refer to preset steps');
    return { id: raw.id, name: raw.name.trim(), description: (raw.description || '').trim(), phases, offsets };
  }
  function presets(customList) {
    if (customList !== undefined && !Array.isArray(customList)) fail('custom presets must be an array');
    const custom = (customList || []).map(validatePreset), ids = new Set();
    for (const preset of custom) { if (ids.has(preset.id)) fail('custom preset IDs must be unique'); ids.add(preset.id); }
    return clone(PRESETS).concat(custom);
  }
  function savePreset(state, raw) {
    object(state, 'studio');
    const preset = validatePreset(raw), existing = presets(state.workflowPresets).filter(p => p.id.startsWith('custom-'));
    const index = existing.findIndex(p => p.id === preset.id);
    if (index < 0) existing.push(preset); else existing[index] = preset;
    state.workflowPresets = clone(existing);
    return clone(preset);
  }
  function capturePreset(project, options, fallbackPhases) {
    object(project, 'project'); object(options, 'preset details');
    const phases = getPhases(project, fallbackPhases), date = dateValue(project.date || ''), offsets = {};
    for (const step of phases.flatMap(phase => phase.s)) {
      const current = project.workflow && project.workflow.offsets && project.workflow.offsets[step];
      if (Number.isSafeInteger(current)) offsets[step] = current;
      else if (date && project.due && project.due[step]) {
        const due = dateValue(project.due[step]);
        offsets[step] = due ? Math.round((new Date(due + 'T00:00:00Z') - new Date(date + 'T00:00:00Z')) / 86400000) : 0;
      } else offsets[step] = 0;
    }
    return validatePreset({ id: options.id, name: options.name, description: options.description || '', phases, offsets });
  }
  function getPhases(project, fallback) {
    const phases = project && project.workflow && Array.isArray(project.workflow.phases) ? project.workflow.phases : (fallback || []);
    return clone(phases);
  }
  function getSteps(project, fallback) { return [...new Set(getPhases(project, fallback).flatMap(phase => phase.s))]; }
  function applyPreset(project, presetId, shootDate, customList) {
    const preset = presets(customList).find(p => p.id === presetId);
    if (!preset) fail('unknown preset');
    const state = workingState(project);
    const date = dateValue(shootDate === undefined ? (project.date || '') : shootDate);
    detectOverrides(state);
    const previous = state.workflow;
    const manualDates = previous ? clone(previous.manualDates) : {};
    const autoDates = {};
    if (previous) {
      for (const [step, value] of Object.entries(previous.autoDates)) {
        if (own(preset.offsets, step)) autoDates[step] = value;
        else if (!manualDates[step] && state.cells[step] !== 'done' && state.due[step] === value) delete state.due[step];
      }
    }
    for (const step of Object.keys(state.due)) {
      if (!previous || !own(previous.autoDates, step)) manualDates[step] = true;
    }
    state.workflow = { preset: preset.id, phases: clone(preset.phases), offsets: clone(preset.offsets), autoDates, manualDates };
    schedule(state, date);
    return commit(project, state, date);
  }
  function reschedule(project, newDate) {
    const date = dateValue(newDate), state = workingState(project);
    detectOverrides(state);
    schedule(state, date);
    return commit(project, state, date);
  }
  function setDue(project, step, value) {
    stepName(step);
    const date = dateValue(value), state = workingState(project);
    if (date) state.due[step] = date;
    else delete state.due[step];
    if (state.workflow) {
      state.workflow.manualDates[step] = true;
      delete state.workflow.autoDates[step];
    }
    project.due = state.due;
    if (state.workflow) project.workflow = state.workflow;
    return project;
  }
  function resetDue(project, step) {
    stepName(step);
    const state = workingState(project), date = dateValue(project.date || '');
    if (!state.workflow || !own(state.workflow.offsets, step)) return project;
    // A completed deadline is part of the project's history, even when the
    // user asks for automatic scheduling on other steps.
    if (state.cells[step] === 'done') return project;
    detectOverrides(state);
    delete state.workflow.manualDates[step];
    delete state.workflow.autoDates[step];
    if (date) {
      const generated = addDays(date, state.workflow.offsets[step]);
      state.due[step] = generated;
      state.workflow.autoDates[step] = generated;
    } else delete state.due[step];
    project.due = state.due;
    project.workflow = state.workflow;
    return project;
  }
  return Object.freeze({ presets, validatePreset, savePreset, capturePreset, getPhases, getSteps, applyPreset, reschedule, setDue, resetDue });
});
