import { describe, expect, it } from 'vitest';
import {
  addState, addWorkflow, canRemoveState, checkKeyword, displayName, dropState, dropWorkflow, effectiveKeys, fromConfig,
  initialOf, keywordProblem, moveState, normalizeKeyword, orgLine, pendingState, removeState, removeWorkflow, toJson, validate,
} from './workflowEditor';
import { parseProjectConfig } from './org';

const cfg = (j: unknown) => parseProjectConfig(JSON.stringify(j)).config;
const base = () =>
  fromConfig(
    cfg({
      workflows: [
        { name: 'Задачи', states: [{ name: 'NEW' }, { name: 'TODO' }, { name: 'NEXT' }, { name: 'DONE', done: true }] },
        { name: 'Встречи', states: [{ name: 'MEETING' }, { name: 'FINISHED', done: true }] },
      ],
    }),
  );
const names = (w: { states: { keyword: string }[] }) => w.states.map((s) => s.keyword);

describe('keywords', () => {
  it('upper-cases and turns spaces into dashes while typing', () => {
    expect(normalizeKeyword(' in progress ')).toBe('IN-PROGRESS');
    expect(normalizeKeyword('на проверке')).toBe('НА-ПРОВЕРКЕ');
  });
  it('shows the name with a space again', () => {
    expect(displayName('IN-PROGRESS')).toBe('IN PROGRESS');
  });
  it('accepts letters, digits, dash and underscore up to 24 characters', () => {
    for (const ok of ['NEW', 'IN-PROGRESS', 'Q4_REVIEW', 'ПРОВЕРКА', 'A'.repeat(24)]) expect(keywordProblem(ok), ok).toBeNull();
  });
  it('rejects empty, too long and the characters Org syntax uses', () => {
    expect(keywordProblem('')).toContain('Введите');
    expect(keywordProblem('A'.repeat(25))).toContain('24');
    for (const bad of ['A(B', 'A)B', 'A|B', 'A@B', 'A!B', 'A/B']) expect(keywordProblem(bad), bad).toContain('Нельзя использовать');
    expect(keywordProblem('A.B')).toContain('Допустимы');
  });
  it('reports a clash with the set it lives in as well as with other sets', () => {
    const d = base();
    const todo = d.workflows[0].states[1];
    expect(checkKeyword(d, 'NEXT', todo.id)).toBe('Такое слово уже есть в наборе «Задачи»');
    expect(checkKeyword(d, 'FINISHED', todo.id)).toBe('Такое слово уже есть в наборе «Встречи»');
    expect(checkKeyword(d, 'TODO', todo.id)).toBeNull(); // its own word is fine
    expect(checkKeyword(d, 'REVIEW', todo.id)).toBeNull();
  });
});

describe('quick keys', () => {
  it('uses the first letter and moves on to the next free letter of the word on a clash', () => {
    const d = base();
    const k = effectiveKeys(d.workflows[0]);
    const byName = (n: string) => k.get(d.workflows[0].states.find((s) => s.keyword === n)!.id);
    expect(byName('NEW')).toBe('n');
    expect(byName('TODO')).toBe('t');
    expect(byName('NEXT')).toBe('e'); // N is taken by NEW, E is the next letter of NEXT
    expect(byName('DONE')).toBe('d');
  });
  it('lets an explicit key from the config win', () => {
    const d = fromConfig(cfg({ workflows: [{ name: 'A', states: [{ name: 'ONE' }, { name: 'NEW', key: 'o' }, { name: 'END', done: true }] }] }));
    const k = effectiveKeys(d.workflows[0]);
    expect(k.get(d.workflows[0].states[1].id)).toBe('o');
    expect(k.get(d.workflows[0].states[0].id)).toBe('n'); // o is reserved by the explicit key
  });
});

describe('adding a state', () => {
  it('creates one grey pending row at the end of the open block, before the closed ones', () => {
    const d = base();
    const w = d.workflows[0];
    const s = addState(d, w);
    expect(s).toMatchObject({ keyword: '', color: 'gray', done: false, pending: true });
    expect(w.states.map((x) => x.keyword)).toEqual(['NEW', 'TODO', 'NEXT', '', 'DONE']);
    expect(pendingState(d)!.state.id).toBe(s.id);
  });
  it('never creates a second empty row: pressing again returns the same one', () => {
    const d = base();
    const a = addState(d, d.workflows[0]);
    const b = addState(d, d.workflows[0]);
    expect(b.id).toBe(a.id);
    expect(d.workflows[0].states.filter((s) => s.pending)).toHaveLength(1);
  });
  it('"+ Завершающее" adds at the end of the closed block', () => {
    const d = base();
    const s = addState(d, d.workflows[0], true);
    expect(d.workflows[0].states.at(-1)!.id).toBe(s.id);
    expect(s.done).toBe(true);
  });
  it('a pending row is neither validated nor written', () => {
    const d = base();
    addState(d, d.workflows[0]);
    expect(validate(d)).toEqual([]);
    expect(JSON.parse(toJson(null, d)).workflows[0].states.map((s: any) => s.name)).toEqual(['NEW', 'TODO', 'NEXT', 'DONE']);
  });
});

describe('removing and the minimums', () => {
  it('keeps the last open state and the only workflow', () => {
    const d = base();
    const w = d.workflows[1];
    expect(canRemoveState(w, w.states[0].id)).toBe(false); // MEETING is the only open state
    expect(canRemoveState(w, w.states[1].id)).toBe(true); // FINISHED is closing
    removeState(w, w.states[0].id);
    expect(names(w)).toEqual(['MEETING', 'FINISHED']);
    removeWorkflow(d, d.workflows[0].id);
    expect(d.workflows).toHaveLength(1);
    removeWorkflow(d, d.workflows[0].id);
    expect(d.workflows).toHaveLength(1);
  });
  it('a removed initial status falls back to the first open one', () => {
    const d = base();
    const w = d.workflows[0];
    w.initialId = w.states[2].id; // NEXT
    expect(initialOf(w)!.keyword).toBe('NEXT');
    removeState(w, w.states[2].id);
    expect(initialOf(w)!.keyword).toBe('NEW');
  });
  it('an initial status that becomes a closing state is dropped too', () => {
    const d = base();
    const w = d.workflows[0];
    w.initialId = w.states[2].id;
    dropState(w, w.states[2].id, 'separator');
    expect(initialOf(w)!.keyword).toBe('NEW');
  });
});

describe('ordering', () => {
  it('moves states, crossing the separator toggles whether they close the task', () => {
    const d = base();
    const w = d.workflows[0];
    moveState(w, w.states[1].id, -1);
    expect(names(w)).toEqual(['TODO', 'NEW', 'NEXT', 'DONE']);
    moveState(w, w.states[2].id, 1); // NEXT is the last open state
    expect(w.states.find((s) => s.keyword === 'NEXT')!.done).toBe(true);
    moveState(w, w.states.find((s) => s.keyword === 'NEXT')!.id, -1);
    expect(w.states.find((s) => s.keyword === 'NEXT')!.done).toBe(false);
  });
  it('does not let the last open state cross the separator', () => {
    const d = base();
    const w = d.workflows[1];
    moveState(w, w.states[0].id, 1);
    dropState(w, w.states[0].id, 'separator');
    expect(w.states[0].done).toBe(false);
  });
  it('a drop takes the group of the row it lands before', () => {
    const d = base();
    const w = d.workflows[0];
    dropState(w, w.states[3].id, w.states[0].id); // DONE before NEW
    expect(names(w)).toEqual(['DONE', 'NEW', 'TODO', 'NEXT']);
    expect(w.states.every((s) => !s.done)).toBe(true);
  });
  it('reorders workflows by drop', () => {
    const d = base();
    dropWorkflow(d, d.workflows[1].id, d.workflows[0].id);
    expect(d.workflows.map((w) => w.name)).toEqual(['Встречи', 'Задачи']);
    dropWorkflow(d, d.workflows[0].id, null);
    expect(d.workflows.map((w) => w.name)).toEqual(['Задачи', 'Встречи']);
  });
});

describe('whole-draft validation and output', () => {
  it('starts valid, adds workflows with names that do not clash', () => {
    const d = base();
    expect(validate(d)).toEqual([]);
    const w = addWorkflow(d);
    expect(names(w)).toEqual(['NEW-2', 'DONE-2']);
    expect(validate(d)).toEqual([]);
  });
  it('reports clashes across workflows, empty names and a missing open state', () => {
    const d = base();
    d.workflows[1].states[0].keyword = 'TODO';
    d.workflows[0].name = ' ';
    d.workflows[1].states[0].done = true;
    const msgs = validate(d).map((p) => p.message).join('\n');
    expect(msgs).toContain('Такое слово уже есть в наборе');
    expect(msgs).toContain('должно быть название');
    expect(msgs).toContain('хотя бы одно незавершённое');
  });
  it('writes the Org line with the derived keys', () => {
    const d = base();
    expect(orgLine(d.workflows[0])).toBe('#+TODO: NEW(n) TODO(t) NEXT(e) | DONE(d)');
  });
  it('serialises colours (named or hex) and a non-default initial status, and reads them back', () => {
    const d = base();
    d.workflows[0].states[1].color = 'teal';
    d.workflows[0].states[2].color = '#a1b2c3';
    d.workflows[0].initialId = d.workflows[0].states[1].id;
    const json = toJson(null, d);
    const back = parseProjectConfig(json);
    expect(back.warnings).toEqual([]);
    expect(back.config.workflows[0].states.map((s) => s.color)).toEqual([undefined, 'teal', '#a1b2c3', undefined]);
    expect(back.config.workflows[0].initial).toBe('TODO');
    // the default initial status is not written at all
    d.workflows[0].initialId = d.workflows[0].states[0].id;
    expect(JSON.parse(toJson(null, d)).workflows[0].initial).toBeUndefined();
  });
  it('keeps unknown top-level keys, writes behaviour only when it matters, and is stable', () => {
    const d = base();
    const existing = JSON.stringify({ version: 1, notes: 'keep me', workflows: [] });
    const out = JSON.parse(toJson(existing, d));
    expect(out.notes).toBe('keep me');
    expect(out.behavior).toBeUndefined();
    d.behavior.logbook = true;
    expect(JSON.parse(toJson(existing, d)).behavior).toEqual({ closedTimestamp: true, logbook: true });
    const a = toJson(null, d);
    expect(toJson(a, d)).toBe(a);
  });
});
