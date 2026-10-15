import { describe, expect, it } from 'vitest';
import {
  activeTab, addPane, closePane, closeTab, dropMissing, emptyLayout, focusPane, keepOne, mapPaths, newTab, openAgenda,
  openFile, openFromAgenda, restore, secondKind, serialize, splitRight, swap, toggleSecond, type Layout,
  newUntitled, moveTab, duplicateTab, othersOf, targetOf,
} from './layout';

const kinds = (L: Layout) => L.panes.map((p) => p.tabs.map((t) => (t.kind === 'agenda' ? 'A' : t.kind === 'untitled' ? t.title : t.path)));
const one = (path = 'a.org') => emptyLayout(newTab('file', path));

describe('opening files', () => {
  it('reuses a tab that shows the file, else adds a tab after the active one', () => {
    const L = one();
    openFile(L, 0, 'b.org', 3);
    expect(kinds(L)).toEqual([['a.org', 'b.org']]);
    expect(L.panes[0].active).toBe(1);
    openFile(L, 0, 'a.org', 7);
    expect(kinds(L)).toEqual([['a.org', 'b.org']]);
    expect(activeTab(L)!.cursor.line).toBe(7);
  });
  it('can retarget the active file tab instead', () => {
    const L = one();
    openFile(L, 0, 'b.org', 0, { replace: true });
    expect(kinds(L)).toEqual([['b.org']]);
  });
});

describe('closing tabs and panes', () => {
  it('activates the tab to the right, else the left one', () => {
    const L = one();
    openFile(L, 0, 'b.org', 0);
    openFile(L, 0, 'c.org', 0);
    L.panes[0].active = 1;
    closeTab(L, 0, 1);
    expect(activeTab(L)!.path).toBe('c.org');
    closeTab(L, 0, 1);
    expect(activeTab(L)!.path).toBe('a.org');
  });
  it('an emptied second pane closes; the only pane may become empty', () => {
    const L = one();
    splitRight(L);
    closeTab(L, 1, 0);
    expect(L.panes).toHaveLength(1);
    closeTab(L, 0, 0);
    expect(L.panes[0].tabs).toEqual([]);
  });
  it('closing a pane moves its tabs into the other one, after its own', () => {
    const L = one();
    splitRight(L);
    openFile(L, 1, 'b.org', 0);
    openAgenda(L, 1);
    closePane(L, 1);
    expect(kinds(L)).toEqual([['a.org', 'b.org', 'A']]); // the copy of a.org is not duplicated
    expect(L.active).toBe(0);
  });
  it('"keep one" closes the inactive pane', () => {
    const L = one();
    splitRight(L); // the new right pane is active
    openFile(L, 1, 'b.org', 0, { replace: true });
    keepOne(L);
    expect(kinds(L)).toEqual([['b.org', 'a.org']]);
  });
});

describe('layout commands', () => {
  it('split right copies the current tab into an active right pane, at most two panes', () => {
    const L = one();
    L.panes[0].tabs[0].cursor = { line: 12, col: 3 };
    expect(splitRight(L)).toBe(true);
    expect(kinds(L)).toEqual([['a.org'], ['a.org']]);
    expect(L.active).toBe(1);
    expect(L.panes[1].tabs[0].cursor).toEqual({ line: 12, col: 3 });
    expect(L.panes[1].tabs[0].id).not.toBe(L.panes[0].tabs[0].id);
    expect(splitRight(L)).toBe(false);
  });
  it('swap keeps the same pane active and mirrors the proportion', () => {
    const L = one();
    splitRight(L);
    openAgenda(L, 1);
    L.ratio = 0.6;
    swap(L);
    expect(kinds(L)).toEqual([['a.org', 'A'], ['a.org']]);
    expect(L.active).toBe(0);
    expect(L.ratio).toBeCloseTo(0.4);
  });
  it('focus moves left and right, not past the edges', () => {
    const L = one();
    splitRight(L);
    focusPane(L, -1);
    expect(L.active).toBe(0);
    focusPane(L, -1);
    expect(L.active).toBe(0);
    focusPane(L, 1);
    expect(L.active).toBe(1);
  });
});

describe('toolbar buttons', () => {
  const copy = (L: Layout) => () => newTab('file', activeTab(L)?.path ?? 'a.org');
  it('nothing pressed without a second pane; "Агенда" opens one on the right with the agenda', () => {
    const L = one();
    expect(secondKind(L)).toBeNull();
    toggleSecond(L, 'agenda', copy(L));
    expect(kinds(L)).toEqual([['a.org'], ['A']]);
    expect(secondKind(L)).toBe('agenda');
  });
  it('"Второй редактор" then opens a file tab in that pane and becomes the pressed one', () => {
    const L = one();
    toggleSecond(L, 'agenda', copy(L));
    toggleSecond(L, 'file', copy(L));
    expect(kinds(L)[1]).toEqual(['A', 'a.org']);
    expect(secondKind(L)).toBe('file');
  });
  it('pressing the pressed "Второй редактор" closes the second pane and keeps its tabs at the end of the first', () => {
    const L = one();
    toggleSecond(L, 'agenda', copy(L));
    openFile(L, 1, 'b.org', 0);
    newUntitled(L, 1);
    expect(secondKind(L)).toBe('file'); // an untitled tab lights it too
    toggleSecond(L, 'file', copy(L));
    expect(kinds(L)).toEqual([['a.org', 'A', 'b.org', 'Без названия']]);
    expect(L.active).toBe(0);
  });
  it('pressing the pressed "Агенда" closes the agenda tab, and the pane when it is the only tab', () => {
    const L = one();
    toggleSecond(L, 'file', copy(L));
    toggleSecond(L, 'agenda', copy(L));
    toggleSecond(L, 'agenda', copy(L)); // closes the agenda tab, the file stays
    expect(kinds(L)).toEqual([['a.org'], ['a.org']]);
    closeTab(L, 1, 0); // the last tab of the right pane: the pane goes, the left one is active
    toggleSecond(L, 'agenda', copy(L));
    toggleSecond(L, 'agenda', copy(L));
    expect(kinds(L)).toEqual([['a.org']]);
    expect(L.active).toBe(0);
  });
  it('closing the last tab of either pane closes that pane; the other one becomes the only and active one', () => {
    const L = one();
    toggleSecond(L, 'agenda', copy(L));
    L.active = 1;
    closeTab(L, 0, 0);
    expect(kinds(L)).toEqual([['A']]);
    expect(L.active).toBe(0);
  });
});

describe('agenda and its neighbour', () => {
  it('with the agenda alone, a task opens in a new pane on the LEFT and the focus stays in the agenda', () => {
    const L = emptyLayout(newTab('agenda'));
    openFromAgenda(L, 0, 'work.org', 5, 'Бюджет', 'neighbor');
    expect(kinds(L)).toEqual([['work.org'], ['A']]);
    expect(L.active).toBe(1); // the agenda, now on the right
    expect(L.panes[0].tabs[0]).toMatchObject({ cursor: { line: 5, col: 0 }, fromAgenda: { line: 5, title: 'Бюджет' } });
  });
  it('the neighbour that already shows the file only moves to the heading', () => {
    const L = emptyLayout(newTab('file', 'work.org'));
    addPane(L, 'right', newTab('agenda'));
    openFromAgenda(L, 1, 'work.org', 9, 'X', 'neighbor');
    expect(kinds(L)).toEqual([['work.org'], ['A']]);
    expect(L.panes[0].tabs[0].cursor.line).toBe(9);
  });
  it('another file replaces the neighbour\'s active file tab instead of piling up tabs', () => {
    const L = emptyLayout(newTab('file', 'a.org'));
    addPane(L, 'right', newTab('agenda'));
    openFromAgenda(L, 1, 'b.org', 1, 'X', 'neighbor');
    expect(kinds(L)).toEqual([['b.org'], ['A']]);
  });
  it('focus variant moves the focus to the file; "here" opens a tab next to the agenda', () => {
    const L = emptyLayout(newTab('file', 'a.org'));
    addPane(L, 'right', newTab('agenda'));
    openFromAgenda(L, 1, 'b.org', 1, 'X', 'neighbor-focus');
    expect(L.active).toBe(0);
    openFromAgenda(L, 1, 'c.org', 2, 'Y', 'here');
    expect(kinds(L)).toEqual([['b.org'], ['A', 'c.org']]);
    expect(L.active).toBe(1);
    expect(activeTab(L)!.path).toBe('c.org');
  });
});

describe('moves, deletions and restarts', () => {
  it('renames update tabs in both panes, deletions close them', () => {
    const L = one('Team/a.org');
    splitRight(L);
    openFile(L, 1, 'b.org', 0);
    mapPaths(L, (p) => p.replace('Team/', 'Archive/Team/'));
    expect(kinds(L)).toEqual([['Archive/Team/a.org'], ['Archive/Team/a.org', 'b.org']]);
    dropMissing(L, (p) => p === 'b.org');
    expect(kinds(L)).toEqual([['b.org']]);
  });
  it('round-trips through serialisation and skips files that are gone', () => {
    const L = one('a.org');
    L.panes[0].tabs[0].cursor = { line: 4, col: 2 };
    splitRight(L);
    openAgenda(L, 1);
    openFile(L, 1, 'gone.org', 0);
    L.panes[1].active = 1; // the agenda
    L.ratio = 0.62;
    const back = restore(serialize(L), (p) => p !== 'gone.org')!;
    expect(kinds(back)).toEqual([['a.org'], ['a.org', 'A']]);
    expect(back.active).toBe(1);
    expect(back.panes[1].active).toBe(1);
    expect(back.ratio).toBeCloseTo(0.62);
    expect(back.panes[0].tabs[0].cursor).toEqual({ line: 4, col: 2 });
  });
  it('nothing usable to restore gives null', () => {
    expect(restore(null, () => true)).toBeNull();
    expect(restore('{bad', () => true)).toBeNull();
    expect(restore(serialize(one('x.org')), () => false)).toBeNull();
  });
  it('an agenda tab keeps its own agenda (a custom one) through a restart, and through a copy', () => {
    const L = one();
    const a = openAgenda(L, 0);
    a.agenda = 'a-my-day';
    const b = newTab('agenda'); // the built-in one
    L.panes[0].tabs.push(b);
    const back = restore(serialize(L), () => true)!;
    expect(back.panes[0].tabs.map((t) => t.agenda)).toEqual([undefined, 'a-my-day', undefined]);
    // two agenda tabs with different agendas are different content: a duplicate is made, not deduplicated
    addPane(back, 'right', newTab('agenda'));
    duplicateTab(back, 0, 1);
    expect(back.panes[1].tabs.map((t) => t.agenda ?? '')).toEqual(['', 'a-my-day']);
  });
});

describe('tab commands', () => {
  it('new untitled tabs go to the end, become active and are numbered per pane', () => {
    const L = one();
    openFile(L, 0, 'b.org', 0);
    L.panes[0].active = 0;
    newUntitled(L, 0);
    newUntitled(L, 0);
    expect(kinds(L)).toEqual([['a.org', 'b.org', 'Без названия', 'Без названия 2']]);
    expect(activeTab(L)!.title).toBe('Без названия 2');
    expect(activeTab(L)!.text).toBe('');
    splitRight(L);
    newUntitled(L, 1);
    expect(L.panes[1].tabs.at(-1)!.title).toBe('Без названия'); // the numbering is per pane
  });
  it('moves a tab after the target\'s active tab and activates it there; an emptied source pane closes', () => {
    const L = one();
    splitRight(L);
    openFile(L, 1, 'b.org', 0);
    L.panes[1].active = 0;
    openFile(L, 0, 'c.org', 0);
    moveTab(L, 0, 1); // c.org -> right pane, after its active tab (a.org)
    expect(kinds(L)).toEqual([['a.org'], ['a.org', 'c.org', 'b.org']]);
    expect(L.active).toBe(1);
    expect(activeTab(L)!.path).toBe('c.org');
    moveTab(L, 0, 0); // a.org already open on the right: no second tab, and the left pane is gone
    expect(kinds(L)).toEqual([['a.org', 'c.org', 'b.org']]);
    expect(activeTab(L)!.path).toBe('a.org');
  });
  it('duplicates into the neighbour, reusing a tab that already shows the file', () => {
    const L = one();
    splitRight(L);
    openFile(L, 0, 'b.org', 0);
    duplicateTab(L, 0, 1);
    expect(kinds(L)).toEqual([['a.org', 'b.org'], ['a.org', 'b.org']]);
    expect(L.active).toBe(1);
    duplicateTab(L, 0, 0); // a.org is already on the right
    expect(kinds(L)[1]).toEqual(['a.org', 'b.org']);
    expect(activeTab(L)!.path).toBe('a.org');
  });
  it('nothing to move to or duplicate into with one pane; untitled tabs are not duplicated', () => {
    const L = one();
    expect(targetOf(L, 0)).toBe(-1);
    expect(moveTab(L, 0, 0)).toBe(false);
    expect(duplicateTab(L, 0, 0)).toBe(false);
    splitRight(L);
    newUntitled(L, 0);
    expect(duplicateTab(L, 0, L.panes[0].tabs.length - 1)).toBe(false);
    expect(moveTab(L, 0, L.panes[0].tabs.length - 1)).toBe(true);
  });
  it('the right pane sends tabs to the left one', () => {
    const L = one();
    splitRight(L);
    expect(targetOf(L, 1)).toBe(0);
  });
  it('lists the other tabs of a pane', () => {
    const L = one();
    openFile(L, 0, 'b.org', 0);
    openFile(L, 0, 'c.org', 0);
    expect(othersOf(L, 0, 1).map((t) => t.path)).toEqual(['a.org', 'c.org']);
  });
  it('untitled tabs are not restored after a restart', () => {
    const L = one();
    newUntitled(L, 0);
    const back = restore(serialize(L), () => true)!;
    expect(kinds(back)).toEqual([['a.org']]);
  });
});
