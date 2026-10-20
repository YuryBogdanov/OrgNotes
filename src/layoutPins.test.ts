import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePane, copyTab, emptyLayout, mapPaths, newTab, openFile, openFromAgenda, othersOf, restore, serialize, setFilePins, setTabPinned, splitRight, newUntitled, type Layout } from './layout';

// ТЗ 58: pinned file tabs — first of their pane as one group, never retargeted, «Закрыть остальные» passes them by.

const names = (L: Layout, pi = 0) => L.panes[pi].tabs.map((t) => `${t.path ?? t.title ?? t.kind}${t.pinned ? '*' : ''}`);
const active = (L: Layout, pi = 0) => L.panes[pi].tabs[L.panes[pi].active].path;
function three(): Layout {
  const L = emptyLayout(newTab('file', 'a.org'));
  openFile(L, 0, 'b.org', 0);
  openFile(L, 0, 'c.org', 0);
  return L;
}

beforeAll(() => setFilePins(true));
afterAll(() => setFilePins(false));

describe('pinning', () => {
  it('a pinned tab goes to the end of the group; unpinned — the first of the others; the active one stays', () => {
    const L = three();
    setTabPinned(L, 0, 2, true);
    expect(names(L)).toEqual(['c.org*', 'a.org', 'b.org']);
    expect(active(L)).toBe('c.org');
    setTabPinned(L, 0, 2, true);
    expect(names(L)).toEqual(['c.org*', 'b.org*', 'a.org']);
    setTabPinned(L, 0, 0, false);
    expect(names(L)).toEqual(['b.org*', 'c.org', 'a.org']);
    expect(active(L)).toBe('c.org');
  });
  it('only a file tab, not a view on one heading', () => {
    const L = three();
    newUntitled(L, 0);
    expect(setTabPinned(L, 0, 3, true)).toBe(false);
    L.panes[0].tabs[0].scope = { line: 0, title: 'x' };
    expect(setTabPinned(L, 0, 0, true)).toBe(false);
  });
});

describe('opening with pins', () => {
  it('a pinned active tab is not retargeted: the file opens right after the group', () => {
    const L = three();
    setTabPinned(L, 0, 0, true);
    setTabPinned(L, 0, 1, true); // a*, b*, c
    L.panes[0].active = 0;
    openFile(L, 0, 'd.org', 0, { replace: true });
    expect(names(L)).toEqual(['a.org*', 'b.org*', 'd.org', 'c.org']);
    expect(active(L)).toBe('d.org');
    // a plain active tab is retargeted as before
    openFile(L, 0, 'e.org', 0, { replace: true });
    expect(names(L)).toEqual(['a.org*', 'b.org*', 'e.org', 'c.org']);
    // a file open in a pinned tab: that tab
    openFile(L, 0, 'b.org', 4, { replace: true });
    expect(active(L)).toBe('b.org');
  });
  it('new tabs never go inside the group', () => {
    const L = three();
    setTabPinned(L, 0, 0, true);
    setTabPinned(L, 0, 1, true);
    L.panes[0].active = 0;
    openFile(L, 0, 'd.org', 0);
    expect(names(L)).toEqual(['a.org*', 'b.org*', 'd.org', 'c.org']);
  });
  it('from the agenda «рядом»: a pinned tab there stays', () => {
    const L = emptyLayout(newTab('file', 'a.org'));
    setTabPinned(L, 0, 0, true);
    L.panes.push({ id: 'p2', tabs: [newTab('agenda')], active: 0 });
    openFromAgenda(L, 1, 'z.org', 3, 'Z', 'neighbor');
    expect(names(L)).toEqual(['a.org*', 'z.org']);
  });
});

describe('closing and keeping', () => {
  it('«Закрыть остальные» leaves the pinned ones and the tab itself', () => {
    const L = three();
    setTabPinned(L, 0, 0, true);
    expect(othersOf(L, 0, 2).map((t) => t.path)).toEqual(['b.org']);
  });
  it('kept through a restart, in their order; a rename keeps the pin; a copy is plain', () => {
    const L = three();
    setTabPinned(L, 0, 1, true);
    setTabPinned(L, 0, 2, true); // b*, c*, a
    const back = restore(serialize(L), () => true)!;
    expect(names(back)).toEqual(['b.org*', 'c.org*', 'a.org']);
    mapPaths(back, (p) => (p === 'c.org' ? 'd.org' : p));
    expect(names(back)).toEqual(['b.org*', 'd.org*', 'a.org']);
    expect(copyTab(back.panes[0].tabs[0]).pinned).toBeUndefined();
  });
  it('panes merged: the gone pane\'s pinned tabs at the end of the group', () => {
    const L = three();
    setTabPinned(L, 0, 0, true); // a*, b, c
    splitRight(L);
    const right = L.panes[1];
    right.tabs = [newTab('file', 'x.org'), newTab('file', 'y.org')];
    right.active = 0;
    setTabPinned(L, 1, 1, true); // y*, x
    closePane(L, 1);
    expect(names(L)).toEqual(['a.org*', 'y.org*', 'b.org', 'c.org', 'x.org']);
  });
  it('the old interface: the field kept, not obeyed', () => {
    const L = three();
    setTabPinned(L, 0, 0, true);
    setFilePins(false);
    try {
      L.panes[0].active = 0;
      openFile(L, 0, 'd.org', 0, { replace: true });
      expect(names(L)).toEqual(['d.org', 'b.org', 'c.org']); // retargeted: the pin was a.org's tab, not d.org's
      L.panes[0].tabs[1].pinned = true;
      expect(serialize(L)).toContain('"pinned":true'); // kept for the new interface
    } finally {
      setFilePins(true);
    }
  });
});
