import { describe, expect, it } from 'vitest';
import { addState, addWorkflow, dropState, fromConfig, keywordOf, moveState, moveWorkflow, orgLine, removeState, removeWorkflow, toJson, validate } from './workflowEditor';
import { parseProjectConfig } from './org';

const cfg = (j: unknown) => parseProjectConfig(JSON.stringify(j)).config;
const base = () =>
  fromConfig(
    cfg({
      workflows: [
        { name: 'Задачи', states: [{ name: 'NEW', key: 'n' }, { name: 'TODO' }, { name: 'DONE', done: true }] },
        { name: 'Встречи', states: [{ name: 'MEETING' }, { name: 'FINISHED', done: true }] },
      ],
    }),
  );
const names = (w: { states: { label: string }[] }) => w.states.map((s) => s.label);

describe('draft operations', () => {
  it('starts from the built-in workflow when the project has none', () => {
    const d = fromConfig(cfg({}));
    expect(d.workflows).toHaveLength(1);
    expect(names(d.workflows[0])).toEqual(['TODO', 'NEXT', 'WAIT', 'DONE', 'CANCELLED']);
  });
  it('turns spaces into dashes for the file', () => {
    expect(keywordOf(' IN PROGRESS ')).toBe('IN-PROGRESS');
  });
  it('adds workflows and states with names that do not clash', () => {
    const d = base();
    const w = addWorkflow(d);
    expect(d.workflows).toHaveLength(3);
    expect(validate(d)).toEqual([]);
    addState(d, w);
    addState(d, w);
    expect(new Set(names(w)).size).toBe(names(w).length);
    expect(validate(d)).toEqual([]);
  });
  it('moves states, and crossing the separator toggles whether they close the task', () => {
    const d = base();
    const w = d.workflows[0];
    const todo = w.states[1];
    moveState(w, todo.id, -1);
    expect(names(w)).toEqual(['TODO', 'NEW', 'DONE']);
    moveState(w, w.states[1].id, 1); // NEW is the last open state: it crosses the separator
    expect(w.states.find((s) => s.label === 'NEW')!.done).toBe(true);
    moveState(w, w.states.find((s) => s.label === 'NEW')!.id, -1); // and back
    expect(w.states.find((s) => s.label === 'NEW')!.done).toBe(false);
  });
  it('a state dropped before another takes that state\'s group and open states stay before done ones', () => {
    const d = base();
    const w = d.workflows[0];
    dropState(w, w.states[2].id, w.states[0].id); // DONE dropped before NEW: it becomes an open state
    expect(names(w)).toEqual(['DONE', 'NEW', 'TODO']);
    expect(w.states.map((s) => s.done)).toEqual([false, false, false]);
    // dropped before a done state it becomes a done one, and the partition holds
    const v = d.workflows[1];
    dropState(v, v.states[0].id, v.states[1].id); // MEETING before FINISHED
    expect(v.states.map((s) => [s.label, s.done])).toEqual([['MEETING', true], ['FINISHED', true]]);
  });
  it('drops onto the separator and the end of the open group', () => {
    const d = base();
    const w = d.workflows[0];
    dropState(w, w.states[0].id, 'separator'); // NEW becomes a closing state
    expect(w.states.find((s) => s.label === 'NEW')!.done).toBe(true);
    dropState(w, w.states.find((s) => s.label === 'NEW')!.id, null); // and back to the end of the open ones
    expect(w.states.find((s) => s.label === 'NEW')!.done).toBe(false);
    expect(names(w)).toEqual(['TODO', 'NEW', 'DONE']);
  });
  it('removes states and workflows, reorders workflows', () => {
    const d = base();
    removeState(d.workflows[0], d.workflows[0].states[1].id);
    expect(names(d.workflows[0])).toEqual(['NEW', 'DONE']);
    moveWorkflow(d, d.workflows[1].id, -1);
    expect(d.workflows.map((w) => w.name)).toEqual(['Встречи', 'Задачи']);
    removeWorkflow(d, d.workflows[0].id);
    expect(d.workflows.map((w) => w.name)).toEqual(['Задачи']);
  });
});

describe('validation', () => {
  it('reports a status used in two workflows, empty and duplicate names, bad keys', () => {
    const d = base();
    d.workflows[1].states[0].label = 'TODO';
    d.workflows[0].states[0].label = '  ';
    d.workflows[0].states[1].key = 'nn';
    d.workflows[1].name = 'Задачи';
    const msgs = validate(d).map((p) => p.message).join('\n');
    expect(msgs).toContain('«TODO» уже есть в наборе «Задачи»');
    expect(msgs).toContain('не может быть пустым');
    expect(msgs).toContain('одна буква');
    expect(msgs).toContain('«Задачи» уже есть');
  });
  it('requires a workflow to have an open state', () => {
    const d = base();
    d.workflows[1].states[0].done = true;
    expect(validate(d).map((p) => p.message)).toContain('Нужно хотя бы одно незавершённое состояние');
  });
  it('accepts the starting config', () => {
    expect(validate(base())).toEqual([]);
  });
});

describe('output', () => {
  it('writes the Org equivalent', () => {
    const d = base();
    expect(orgLine(d.workflows[0])).toBe('#+TODO: NEW(n) TODO | DONE');
    d.workflows[1].states.pop();
    expect(orgLine(d.workflows[1])).toBe('#+TODO: MEETING |');
  });
  it('serialises to a config that reads back identically', () => {
    const d = base();
    d.workflows[0].states[1].label = 'IN PROGRESS';
    d.workflows[0].states[1].color = 'blue';
    const json = toJson(null, d);
    const back = parseProjectConfig(json);
    expect(back.warnings).toEqual([]);
    expect(back.config.workflows[0].states.map((s) => s.name)).toEqual(['NEW', 'IN-PROGRESS', 'DONE']);
    expect(back.config.workflows[0].states[1].color).toBe('blue');
    expect(back.config.workflows[0].states[0].key).toBe('n');
    expect(back.config.workflows[0].states[2].done).toBe(true);
    expect(json.endsWith('}\n')).toBe(true);
  });
  it('keeps unknown top-level keys and writes behaviour only when it matters', () => {
    const d = base();
    const existing = JSON.stringify({ version: 1, notes: 'keep me', workflows: [] });
    const out = JSON.parse(toJson(existing, d));
    expect(out.notes).toBe('keep me');
    expect(out.behavior).toBeUndefined();
    d.behavior.logbook = true;
    expect(JSON.parse(toJson(existing, d)).behavior).toEqual({ closedTimestamp: true, logbook: true });
  });
  it('produces stable text, so saving twice changes nothing', () => {
    const d = base();
    const a = toJson(null, d);
    expect(toJson(a, d)).toBe(a);
  });
});
