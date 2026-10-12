import { describe, expect, it } from 'vitest';
import { changeStatusAt, cyclePriority, foldTargets, insertHeading, moveSubtree, nextCycleState, rotateStatus, rotateWorkflow, shiftHeading, shiftSubtree, insertItem, type Result } from './outline';
import { DEFAULT_WORKFLOW, resolveWorkflow } from './org';

const apply = (text: string, r: Result | null) => {
  if (!r) return null;
  let out = text;
  for (const e of [...r.changes].sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  return { text: out, caret: r.caret };
};
// "|" marks the caret in the fixtures
const at = (s: string) => ({ text: s.replace('|', ''), caret: s.indexOf('|') });
const show = (r: { text: string; caret: number } | null) => (r ? r.text.slice(0, r.caret) + '|' + r.text.slice(r.caret) : null);

describe('insertHeading (M-RET)', () => {
  it('before the first heading makes a level-1 heading', () => {
    const { text, caret } = at('#+TITLE: x|\n\n* A\n');
    expect(show(apply(text, insertHeading(text, caret)))).toBe('#+TITLE: x\n* |\n\n* A\n');
  });
  it('on a level-1 heading or its body makes a level-1 heading', () => {
    let { text, caret } = at('* A|\nbody\n');
    expect(show(apply(text, insertHeading(text, caret)))).toBe('* A\n* |\nbody\n');
    ({ text, caret } = at('* A\nbody|\n'));
    expect(show(apply(text, insertHeading(text, caret)))).toBe('* A\nbody\n* |\n');
  });
  it('keeps the level of the current heading: level 2 makes level 2, level 3 makes level 3', () => {
    let { text, caret } = at('* A\n** B\ntext|\n');
    expect(show(apply(text, insertHeading(text, caret)))).toBe('* A\n** B\ntext\n** |\n');
    ({ text, caret } = at('* A\n** B\n*** C|\n'));
    expect(show(apply(text, insertHeading(text, caret)))).toBe('* A\n** B\n*** C\n*** |\n');
  });
  it('splits the line in the middle: the rest becomes the new title', () => {
    const { text, caret } = at('** Hello| world\n');
    expect(show(apply(text, insertHeading(text, caret)))).toBe('** Hello\n** | world\n');
  });
  it('at the start of a heading inserts above it', () => {
    const { text, caret } = at('* A\n|** B\n');
    expect(show(apply(text, insertHeading(text, caret)))).toBe('* A\n** |\n** B\n');
  });
  it('on a blank line turns that line into the heading', () => {
    const { text, caret } = at('* A\n|\ntext\n');
    expect(show(apply(text, insertHeading(text, caret)))).toBe('* A\n* |\ntext\n');
  });
  it('at the end of a folded heading goes after the whole subtree', () => {
    const { text, caret } = at('* A|\nbody\n** child\n* B\n');
    expect(show(apply(text, insertHeading(text, caret, { folded: true })))).toBe('* A\nbody\n** child\n* |\n* B\n');
  });
  it('folded heading at the end of the file', () => {
    const { text, caret } = at('* A|\n** child\n');
    expect(show(apply(text, insertHeading(text, caret, { folded: true })))).toBe('* A\n** child\n* |\n');
    const { text: t2, caret: c2 } = at('* A|\n** child');
    expect(show(apply(t2, insertHeading(t2, c2, { folded: true })))).toBe('* A\n** child\n* |');
  });
  it('can start the new heading with a task state', () => {
    const { text, caret } = at('* A|\n');
    expect(show(apply(text, insertHeading(text, caret, { todo: 'TODO' })))).toBe('* A\n* TODO |\n');
  });
  it('stars inside a source block do not count as the current heading', () => {
    const { text, caret } = at('* A\n#+BEGIN_SRC org\n*** fake\n#+END_SRC|\n');
    expect(show(apply(text, insertHeading(text, caret)))).toBe('* A\n#+BEGIN_SRC org\n*** fake\n#+END_SRC\n* |\n');
  });
});

describe('shiftHeading (M-left / M-right)', () => {
  it('demotes only the heading: the headings below stay where they are and become its siblings', () => {
    // the case from the bug: a new heading after «1-1 meetings», then ⌥→
    const { text, caret } = at('* Employee\n** 1-1 meetings\n** |\n*** Second 1-1 meeting\n*** First 1-1 meeting\n');
    expect(show(apply(text, shiftHeading(text, caret, 1)))).toBe('* Employee\n** 1-1 meetings\n*** |\n*** Second 1-1 meeting\n*** First 1-1 meeting\n');
  });
  it('promotes only the heading; a level-1 heading cannot be promoted', () => {
    const { text, caret } = at('* A\n** B|\n*** C\n');
    expect(show(apply(text, shiftHeading(text, caret, -1)))).toBe('* A\n* B|\n*** C\n');
    const one = at('* A|\n');
    expect(shiftHeading(one.text, one.caret, -1)).toBeNull();
  });
  it('not on a heading line: nothing', () => {
    const { text, caret } = at('* A\nbo|dy\n');
    expect(shiftHeading(text, caret, 1)).toBeNull();
  });
});

describe('shiftSubtree (M-S-left / M-S-right)', () => {
  const doc = '* A\n** B|\nbody\n*** C\n** D\n* E\n';
  it('demotes the heading with everything below it, not its siblings', () => {
    const { text, caret } = at(doc);
    expect(show(apply(text, shiftSubtree(text, caret, 1)))).toBe('* A\n*** B|\nbody\n**** C\n** D\n* E\n');
  });
  it('promotes the heading with everything below it', () => {
    const { text, caret } = at(doc);
    expect(show(apply(text, shiftSubtree(text, caret, -1)))).toBe('* A\n* B|\nbody\n** C\n** D\n* E\n');
  });
  it('cannot promote a level-1 heading', () => {
    const { text, caret } = at('* A|\n');
    expect(shiftSubtree(text, caret, -1)).toBeNull();
  });
  it('leaves stars inside blocks and body text alone', () => {
    const { text, caret } = at('* A|\n#+BEGIN_SRC\n* x\n#+END_SRC\n** B\n');
    expect(apply(text, shiftSubtree(text, caret, 1))!.text).toBe('** A\n#+BEGIN_SRC\n* x\n#+END_SRC\n*** B\n');
  });
  it('does nothing off a heading line', () => {
    const { text, caret } = at('* A\nbo|dy\n');
    expect(shiftSubtree(text, caret, 1)).toBeNull();
  });
});

describe('moveSubtree (M-up / M-down)', () => {
  const doc = '* A\n** a1\n** a2\n* B|\nbody b\n** b1\n* C\n';
  it('moves up past the previous sibling together with its subtree', () => {
    const { text, caret } = at(doc);
    expect(show(apply(text, moveSubtree(text, caret, -1)))).toBe('* B|\nbody b\n** b1\n* A\n** a1\n** a2\n* C\n');
  });
  it('moves down past the next sibling', () => {
    const { text, caret } = at(doc);
    expect(show(apply(text, moveSubtree(text, caret, 1)))).toBe('* A\n** a1\n** a2\n* C\n* B|\nbody b\n** b1\n');
  });
  it('keeps the caret at the same place in the heading', () => {
    const { text, caret } = at('* A\n* Bee|f\n');
    expect(show(apply(text, moveSubtree(text, caret, -1)))).toBe('* Bee|f\n* A\n');
  });
  it('does not leave the parent: no sibling means no move', () => {
    let { text, caret } = at('* A\n** a1|\n** a2\n* B\n');
    expect(moveSubtree(text, caret, -1)).toBeNull();
    ({ text, caret } = at('* A\n** a1\n** a2|\n* B\n'));
    expect(moveSubtree(text, caret, 1)).toBeNull();
  });
  it('first and last headings of the file', () => {
    const { text, caret } = at('* A|\n* B\n');
    expect(moveSubtree(text, caret, -1)).toBeNull();
    const t2 = at('* A\n* B|\n');
    expect(moveSubtree(t2.text, t2.caret, 1)).toBeNull();
  });
  it('works at the end of a file without a trailing newline', () => {
    const { text, caret } = at('* A\n* B|');
    expect(show(apply(text, moveSubtree(text, caret, -1)))).toBe('* B|\n* A');
  });
  it('treats a deeper block of headings as part of the subtree', () => {
    const { text, caret } = at('* A|\n** x\n*** y\n* B\n');
    expect(apply(text, moveSubtree(text, caret, 1))!.text).toBe('* B\n* A\n** x\n*** y\n');
  });
});

describe('cyclePriority (S-up / S-down)', () => {
  const wf = DEFAULT_WORKFLOW;
  const press = (s: string, dir: 'up' | 'down') => {
    const { text, caret } = at(s);
    return show(apply(text, cyclePriority(text, caret, dir, wf)));
  };
  it('starts at the default B from either direction', () => {
    expect(press('* TODO Task|\n', 'up')).toBe('* TODO [#B] Task|\n');
    expect(press('* TODO Task|\n', 'down')).toBe('* TODO [#B] Task|\n');
  });
  it('up goes towards A and wraps to C, down towards C and wraps to A', () => {
    expect(press('* TODO [#B] Task|\n', 'up')).toBe('* TODO [#A] Task|\n');
    expect(press('* TODO [#A] Task|\n', 'up')).toBe('* TODO [#C] Task|\n');
    expect(press('* TODO [#B] Task|\n', 'down')).toBe('* TODO [#C] Task|\n');
    expect(press('* TODO [#C] Task|\n', 'down')).toBe('* TODO [#A] Task|\n');
  });
  it('works on headings without a keyword and keeps tags', () => {
    expect(press('* Task|   :a:\n', 'up')).toBe('* [#B] Task|   :a:\n');
  });
  it('only on a heading line', () => {
    const { text, caret } = at('* TODO A\nbo|dy\n');
    expect(cyclePriority(text, caret, 'up', wf)).toBeNull();
  });
});

describe('visibility cycle (S-Tab)', () => {
  const text = '* A\n** B\n*** C\n* D\n** E\n';
  it('state 0 folds every heading, k unfolds up to level k, max unfolds all', () => {
    expect(foldTargets(text, 0).lines).toEqual([0, 1, 2, 3, 4]);
    expect(foldTargets(text, 1).lines).toEqual([1, 2, 4]);
    expect(foldTargets(text, 2).lines).toEqual([2]);
    expect(foldTargets(text, 3).lines).toEqual([]);
    expect(foldTargets(text, 0).max).toBe(3);
  });
  it('cycles: all folded, level 1, level 2, ... all open, then folded again', () => {
    const max = 3;
    const seq = [] as number[];
    let s: number | undefined = undefined; // everything is open at the start
    for (let i = 0; i < 5; i++) {
      s = nextCycleState(s, max);
      seq.push(s);
    }
    expect(seq).toEqual([0, 1, 2, 3, 0]);
  });
});

describe('status and workflow rotation', () => {
  const wf = resolveWorkflow('', 'x.org', {
    workflows: [
      { name: 'Задачи', states: [{ name: 'NEW', done: false }, { name: 'TODO', done: false }, { name: 'DONE', done: true }] },
      { name: 'Встречи', states: [{ name: 'MEETING', done: false }, { name: 'FINISHED', done: true }] },
      { name: 'Цели', states: [{ name: 'BACKLOG', done: false }, { name: 'ACTIVE', done: false }, { name: 'COMPLETED', done: true }] },
    ],
  });

  describe('rotateStatus (Shift+←/→)', () => {
    it('no status: the first status of the first workflow, either direction', () => {
      expect(rotateStatus(wf, null, 'next')).toBe('NEW');
      expect(rotateStatus(wf, null, 'prev')).toBe('NEW');
    });
    it('→ walks the statuses of its own workflow and removes the status after the last one', () => {
      expect(rotateStatus(wf, 'NEW', 'next')).toBe('TODO');
      expect(rotateStatus(wf, 'TODO', 'next')).toBe('DONE');
      expect(rotateStatus(wf, 'DONE', 'next')).toBeNull();
      expect(rotateStatus(wf, 'MEETING', 'next')).toBe('FINISHED');
    });
    it('← goes back and removes the status on the first status of any workflow', () => {
      expect(rotateStatus(wf, 'DONE', 'prev')).toBe('TODO');
      expect(rotateStatus(wf, 'NEW', 'prev')).toBeNull();
      expect(rotateStatus(wf, 'MEETING', 'prev')).toBeNull();
      expect(rotateStatus(wf, 'BACKLOG', 'prev')).toBeNull();
    });
  });

  describe('rotateWorkflow (Ctrl+Shift+←/→)', () => {
    it('no status: the first status of the first workflow, either direction', () => {
      expect(rotateWorkflow(wf, null, 'next')).toBe('NEW');
      expect(rotateWorkflow(wf, null, 'prev')).toBe('NEW');
    });
    it('→ jumps to the first status of the next workflow, from any status', () => {
      expect(rotateWorkflow(wf, 'NEW', 'next')).toBe('MEETING');
      expect(rotateWorkflow(wf, 'DONE', 'next')).toBe('MEETING');
      expect(rotateWorkflow(wf, 'FINISHED', 'next')).toBe('BACKLOG');
    });
    it('→ after the last workflow removes the status', () => {
      expect(rotateWorkflow(wf, 'ACTIVE', 'next')).toBeNull();
    });
    it('← goes to the previous workflow and removes the status from the first workflow', () => {
      expect(rotateWorkflow(wf, 'MEETING', 'prev')).toBe('NEW');
      expect(rotateWorkflow(wf, 'COMPLETED', 'prev')).toBe('MEETING');
      expect(rotateWorkflow(wf, 'NEW', 'prev')).toBeNull();
    });
    it('with a single workflow it behaves as a toggle', () => {
      expect(rotateWorkflow(DEFAULT_WORKFLOW, null, 'next')).toBe('TODO');
      expect(rotateWorkflow(DEFAULT_WORKFLOW, 'NEXT', 'next')).toBeNull();
    });
  });

  describe('changeStatusAt', () => {
    const NOW = new Date(2026, 9, 10, 12, 0);
    const press = (s: string, how: Parameters<typeof changeStatusAt>[2]) => {
      const { text, caret } = at(s);
      return show(apply(text, changeStatusAt(text, caret, how, wf, NOW)));
    };
    it('sets, rotates and removes the keyword keeping the rest of the line and the caret', () => {
      expect(press('* Задача| :a:\n', (w, k) => rotateStatus(w, k, 'next'))).toBe('* NEW Задача| :a:\n');
      expect(press('* TODO Задача|\n', (w, k) => rotateStatus(w, k, 'next'))).toBe('* DONE Задача|\nCLOSED: [2026-10-10 Sat 12:00]\n');
      expect(press('* NEW Задача|\n', (w, k) => rotateStatus(w, k, 'prev'))).toBe('* Задача|\n');
    });
    it('a caret in the title keeps its place relative to the text', () => {
      expect(press('* TODO Зада|ча\n', (w, k) => rotateStatus(w, k, 'prev'))).toBe('* NEW Зада|ча\n');
    });
    it('leaving a done status removes CLOSED', () => {
      expect(press('* DONE Задача|\nCLOSED: [2026-10-08 Thu 18:20]\n', (w, k) => rotateStatus(w, k, 'prev'))).toBe('* TODO Задача|\n');
    });
    it('a repeating task goes back to the start of its own workflow when finished', () => {
      const out = press('* MEETING Планёрка|\nSCHEDULED: <2026-10-12 Mon +1w>\n', (w, k) => rotateStatus(w, k, 'next'));
      expect(out).toBe('* MEETING Планёрка|\nSCHEDULED: <2026-10-19 Mon +1w>\n:PROPERTIES:\n:LAST_REPEAT: [2026-10-10 Sat 12:00]\n:END:\n');
    });
    it('does nothing off a heading line', () => {
      const { text, caret } = at('* TODO A\nbo|dy\n');
      expect(changeStatusAt(text, caret, (w, k) => rotateStatus(w, k, 'next'), wf)).toBeNull();
    });
  });
});

describe('insertItem (M-RET in a list)', () => {
  const run = (s: string, box = false) => {
    const { text, caret } = at(s);
    const r = insertItem(text, caret, { box });
    return r ? show(apply(text, r)) : null;
  };
  it('at the end of an item: the next item, the same bullet', () => {
    expect(run('Список:\n- раз|\n- два\n')).toBe('Список:\n- раз\n- |\n- два\n');
    expect(run('  + вложенный|\n')).toBe('  + вложенный\n  + |\n');
    expect(run('  * со звёздочкой|\n')).toBe('  * со звёздочкой\n  * |\n');
  });
  it('a numbered list: the next number, the following ones go on', () => {
    expect(run('1. раз|\n2. два\n3. три\n')).toBe('1. раз\n2. |\n3. два\n4. три\n');
    expect(run('1) раз|\n')).toBe('1) раз\n2) |\n');
  });
  it('at the start of an item: a new one above it; inside the line: split there', () => {
    expect(run('- раз\n|- два\n')).toBe('- раз\n- |\n- два\n');
    expect(run('1. раз\n|2. два\n')).toBe('1. раз\n2. |\n3. два\n');
    expect(run('- первая| вторая\n')).toBe('- первая\n- |вторая\n');
  });
  it('on a line that continues the item, or with a sub-list: after the whole item', () => {
    expect(run('- раз\n  продолжение|\n- два\n')).toBe('- раз\n  продолжение\n- |\n- два\n');
    expect(run('- раз|\n  - под\n- два\n')).toBe('- раз\n  - под\n- |\n- два\n');
    expect(run('- раз\n  - под|\n- два\n')).toBe('- раз\n  - под\n  - |\n- два\n');
  });
  it('a checkbox goes on; ⌥⇧↩ adds one', () => {
    expect(run('- [X] сделано|\n')).toBe('- [X] сделано\n- [ ] |\n');
    expect(run('- пункт|\n', true)).toBe('- пункт\n- [ ] |\n');
  });
  it('not in an item: null (a heading is made), also a line below the list and a heading', () => {
    expect(run('просто текст|\n')).toBeNull();
    expect(run('- раз\nтекст под списком|\n')).toBeNull();
    expect(run('* Заголовок|\n')).toBeNull();
    expect(run('- раз\n\n  после пустой|\n')).toBeNull();
  });
});
