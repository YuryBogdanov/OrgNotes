import { describe, expect, it } from 'vitest';
import { headingAt, headingLines, parseHeadings, parseWorkflow, setKeyword, setPriority, shiftTimestamp, subtreeProgress } from './org';

// Saturday, 10 October 2026, 12:00
const NOW = new Date(2026, 9, 10, 12, 0);
const WF = { open: ['TODO', 'NEXT', 'WAIT'], done: ['DONE', 'CANCELLED'] };
const kw = (text: string, idx: number, to: string | null, now = NOW) => {
  const hs = parseHeadings(text, WF);
  return setKeyword(text, hs[idx], to, WF, now);
};

describe('parseWorkflow', () => {
  it('reads open and done keywords, strips shortcuts', () => {
    expect(parseWorkflow('#+TODO: NEW(n) TODO(t) | DONE(d) CANCELLED(c)\n')).toEqual({
      open: ['NEW', 'TODO'],
      done: ['DONE', 'CANCELLED'],
    });
  });
  it('treats the last word as done when there is no bar', () => {
    expect(parseWorkflow('#+TODO: TODO WAIT DONE\n')).toEqual({ open: ['TODO', 'WAIT'], done: ['DONE'] });
  });
  it('merges several sequences', () => {
    const wf = parseWorkflow('#+TODO: TODO | DONE\n#+TODO: MEETING | FINISHED\n');
    expect(wf.open).toEqual(['TODO', 'MEETING']);
    expect(wf.done).toEqual(['DONE', 'FINISHED']);
  });
  it('falls back to defaults', () => {
    expect(parseWorkflow('* just text').open).toContain('TODO');
  });
});

describe('parseHeadings', () => {
  const text = [
    '#+TITLE: x',
    '* Проект                                                 :work:',
    '** TODO [#A] Бюджет [1/2]                               :a:b:',
    'SCHEDULED: <2026-10-14 Wed> DEADLINE: <2026-10-24 Sat>',
    ':PROPERTIES:',
    ':Effort: 6:00',
    ':END:',
    '*** DONE Подзадача',
    'CLOSED: [2026-10-08 Thu 18:20]',
    '*** TODO Вторая',
    '* Встреча',
    '<2026-10-12 Mon 10:00 +1w>',
  ].join('\n');
  const hs = parseHeadings(text, WF);

  it('extracts keyword, priority, tags and title', () => {
    expect(hs[1]).toMatchObject({ level: 2, keyword: 'TODO', priority: 'A', tags: ['a', 'b'], title: 'Бюджет [1/2]' });
    expect(hs[0]).toMatchObject({ level: 1, keyword: null, tags: ['work'], title: 'Проект' });
  });
  it('reads planning, closed, effort and events', () => {
    expect(hs[1].scheduled).toMatchObject({ y: 2026, m: 10, d: 14 });
    expect(hs[1].deadline).toMatchObject({ d: 24 });
    expect(hs[1].effort).toBe('6:00');
    expect(hs[2].closed).toMatchObject({ d: 8 });
    expect(hs[4].event).toMatchObject({ d: 12, time: '10:00', repeater: '+1w' });
  });
  it('computes subtree ends, parents and paths', () => {
    expect(hs[1].end).toBe(10);
    expect(hs[2].parent).toBe(1);
    expect(hs[2].path).toEqual(['Проект', 'Бюджет [1/2]']);
    expect(headingAt(hs, 5)).toBe(1);
    expect(headingAt(hs, 8)).toBe(2);
  });
  it('counts subtask progress', () => {
    expect(subtreeProgress(hs, 1, WF)).toEqual({ done: 1, total: 2 });
  });
  it('ignores stars inside blocks', () => {
    const t = '* A\n#+BEGIN_SRC org\n* not a heading\n#+END_SRC\n* B\n';
    expect([...headingLines(t.split('\n'))]).toEqual([0, 4]);
    expect(parseHeadings(t, WF).map((h) => h.title)).toEqual(['A', 'B']);
  });
});

describe('own properties', () => {
  it("does not leak a child's drawer into its parent", () => {
    const hs = parseHeadings('* A\n** B\n:PROPERTIES:\n:ID: b-id\n:Effort: 2:00\n:END:\n', WF);
    expect(hs[0].id).toBeUndefined();
    expect(hs[0].effort).toBeUndefined();
    expect(hs[1]).toMatchObject({ id: 'b-id', effort: '2:00' });
  });
});

describe('setKeyword', () => {
  it('changes only the keyword and keeps the rest of the line', () => {
    const t = '* TODO [#A] Бюджет     :a:\nтекст\n';
    expect(kw(t, 0, 'NEXT')).toBe('* NEXT [#A] Бюджет     :a:\nтекст\n');
  });
  it('adds CLOSED to a new planning line when done', () => {
    const t = '* TODO a\nbody\n';
    expect(kw(t, 0, 'DONE')).toBe('* DONE a\nCLOSED: [2026-10-10 Sat 12:00]\nbody\n');
  });
  it('prepends CLOSED to an existing planning line', () => {
    const t = '* TODO a\nSCHEDULED: <2026-10-12 Mon>\n';
    expect(kw(t, 0, 'DONE')).toBe('* DONE a\nCLOSED: [2026-10-10 Sat 12:00] SCHEDULED: <2026-10-12 Mon>\n');
  });
  it('removes CLOSED when reopened', () => {
    expect(kw('* DONE a\nCLOSED: [2026-10-10 Sat 12:00]\nbody\n', 0, 'TODO')).toBe('* TODO a\nbody\n');
    expect(kw('* DONE a\nCLOSED: [2026-10-10 Sat 12:00] SCHEDULED: <2026-10-12 Mon>\n', 0, 'TODO')).toBe(
      '* TODO a\nSCHEDULED: <2026-10-12 Mon>\n',
    );
  });
  it('can clear the keyword', () => {
    expect(kw('* TODO a\n', 0, null)).toBe('* a\n');
  });
});

describe('repeating tasks', () => {
  it('shifts +1w once, resets state, records LAST_REPEAT', () => {
    const t = '* TODO Отчёт\nSCHEDULED: <2026-10-09 Fri +1w>\n';
    expect(kw(t, 0, 'DONE')).toBe(
      '* TODO Отчёт\nSCHEDULED: <2026-10-16 Fri +1w>\n:PROPERTIES:\n:LAST_REPEAT: [2026-10-10 Sat 12:00]\n:END:\n',
    );
  });
  it('updates an existing drawer instead of adding another', () => {
    const t = '* NEXT a\nSCHEDULED: <2026-10-12 Mon +1w>\n:PROPERTIES:\n:Effort: 1:00\n:LAST_REPEAT: [2026-10-03 Sat 09:00]\n:END:\n';
    expect(kw(t, 0, 'DONE')).toBe(
      '* TODO a\nSCHEDULED: <2026-10-19 Mon +1w>\n:PROPERTIES:\n:Effort: 1:00\n:LAST_REPEAT: [2026-10-10 Sat 12:00]\n:END:\n',
    );
  });
  it('shifts both SCHEDULED and DEADLINE', () => {
    const t = '* TODO a\nSCHEDULED: <2026-10-12 Mon +1w> DEADLINE: <2026-10-14 Wed +1w>\n';
    expect(kw(t, 0, 'DONE')).toContain('SCHEDULED: <2026-10-19 Mon +1w> DEADLINE: <2026-10-21 Wed +1w>');
  });
  it('does not touch non-repeating tasks', () => {
    expect(kw('* TODO a\nSCHEDULED: <2026-10-12 Mon>\n', 0, 'DONE')).toContain('* DONE a');
  });
  describe('shiftTimestamp', () => {
    it('+ shifts exactly once, even if still in the past', () => {
      expect(shiftTimestamp('<2026-09-01 Tue +1w>', NOW)).toBe('<2026-09-08 Tue +1w>');
    });
    it('++ shifts into the future', () => {
      expect(shiftTimestamp('<2026-09-01 Tue ++1w>', NOW)).toBe('<2026-10-13 Tue ++1w>');
    });
    it('.+ counts from today', () => {
      expect(shiftTimestamp('<2026-10-01 Thu .+2d>', NOW)).toBe('<2026-10-12 Mon .+2d>');
    });
    it('keeps time of day and warning period', () => {
      expect(shiftTimestamp('<2026-10-12 Mon 10:00 +1w -2d>', NOW)).toBe('<2026-10-19 Mon 10:00 +1w -2d>');
    });
    it('clamps month ends', () => {
      expect(shiftTimestamp('<2026-10-31 Sat +1m>', NOW)).toBe('<2026-11-30 Mon +1m>');
    });
    it('keeps Russian weekday names', () => {
      expect(shiftTimestamp('<2026-10-12 Пн +1w>', NOW)).toBe('<2026-10-19 Пн +1w>');
    });
    it('returns null without a repeater', () => {
      expect(shiftTimestamp('<2026-10-12 Mon>', NOW)).toBeNull();
    });
  });
});

describe('setPriority', () => {
  it('sets, replaces and clears', () => {
    const hs = (t: string) => parseHeadings(t, WF)[0];
    let t = '* TODO a\n';
    t = setPriority(t, hs(t), 'A');
    expect(t).toBe('* TODO [#A] a\n');
    t = setPriority(t, hs(t), 'B');
    expect(t).toBe('* TODO [#B] a\n');
    t = setPriority(t, hs(t), null);
    expect(t).toBe('* TODO a\n');
  });
});
