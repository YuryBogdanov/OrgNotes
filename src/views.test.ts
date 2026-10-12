import { describe, expect, it } from 'vitest';
import { newTab, openView, restore, serialize, emptyLayout, toggleSecond, type Layout } from './layout';
import { registerView } from './views';
import { C, KEY_COMMANDS, commandById, outerNote, registerKeys, registerScope, conflictsOf, bindingsOf, DEFAULT_STATE } from './keys';

const Dummy = (() => {}) as any;

describe('a feature\'s tabs (roadmap 0.3)', () => {
  it('a registered kind is kept with its state, read back by its view; a session is not kept', () => {
    registerView({ kind: 't-cal', label: () => 'Кал', icon: 'M0 0', component: Dummy, restore: (d: any) => (d?.date ? d : { date: 'today' }) });
    registerView({ kind: 't-rev', label: () => 'Разбор', icon: 'M0 0', component: Dummy, transient: true });
    const L: Layout = emptyLayout(newTab('file', '/a.org'));
    openView(L, 0, 't-cal', () => ({ date: '2026-10-12' }));
    openView(L, 0, 't-rev', () => null);
    const saved = JSON.parse(serialize(L));
    expect(saved.panes[0].tabs.map((t: any) => t.kind)).toEqual(['file', 't-cal']);
    expect(saved.panes[0].tabs[1]).toMatchObject({ data: { date: '2026-10-12' }, label: 'Кал' });
    const back = restore(serialize(L), () => true)!;
    expect(back.panes[0].tabs[1]).toMatchObject({ kind: 't-cal', data: { date: '2026-10-12' } });
  });
  it('one tab of a kind per pane: shown again, `update` changes it', () => {
    const L: Layout = emptyLayout(newTab('file', '/a.org'));
    const a = openView(L, 0, 't-cal', () => ({ date: '1' }));
    const b = openView(L, 0, 't-cal', () => ({ date: '2' }), (t) => (t.data = { date: '3' }));
    expect(b).toBe(a);
    expect(a.data).toEqual({ date: '3' });
    expect(L.panes[0].tabs).toHaveLength(2);
  });
  it('a kind nobody registers (the feature is off) stays a tab with its state and name, and is kept as it was', () => {
    const raw = JSON.stringify({ v: 1, active: 0, ratio: 0.5, panes: [{ active: 1, tabs: [{ kind: 'file', path: '/a.org', cursor: { line: 0, col: 0 } }, { kind: 'jira', data: { board: 'OPS' }, label: 'Jira · OPS' }] }] });
    const L = restore(raw, () => true)!;
    expect(L.panes[0].tabs[1]).toMatchObject({ kind: 'jira', data: { board: 'OPS' }, label: 'Jira · OPS' });
    expect(JSON.parse(serialize(L)).panes[0].tabs[1]).toMatchObject({ kind: 'jira', data: { board: 'OPS' }, label: 'Jira · OPS' });
  });
  it('the state of a layout saved before 0.3 (`calendar`, `goals`) is read as `data`', () => {
    const raw = JSON.stringify({ v: 1, active: 0, ratio: 0.5, panes: [{ active: 0, tabs: [{ kind: 't-cal', t_cal: 1 }, { kind: 'goals', goals: 'me.org#Цели' }] }] });
    const L = restore(raw, () => true)!;
    expect(L.panes[0].tabs[0].data).toEqual({ date: 'today' }); // no state: the view's default
    expect(L.panes[0].tabs[1].data).toBe('me.org#Цели');
  });
  it('a feature\'s button for the second pane makes its tab, or shows the one there', () => {
    const L: Layout = emptyLayout(newTab('file', '/a.org'));
    toggleSecond(L, 't-cal', () => ({ ...newTab('t-cal'), data: { date: 'x' } }));
    expect(L.panes).toHaveLength(2);
    expect(L.panes[1].tabs[0].kind).toBe('t-cal');
  });
});

describe('a feature\'s keys (roadmap 0.3)', () => {
  it('its commands take their place in the list; its scope is nested over the window: no clash there', () => {
    registerKeys([C('tFirst', 'Первая', 'go', 'window', [], { after: 'notes' }), C('tCard', 'Карточка: готово', 'go', 't-card', ['⌘1'])]);
    const i = KEY_COMMANDS.findIndex((c) => c.id === 'notes');
    expect(KEY_COMMANDS[i + 1].id).toBe('tFirst');
    expect(commandById.has('tCard')).toBe(true);
    registerScope({ id: 't-card', name: 'на карточке', over: ['window'], outside: { scopes: ['window'], word: 'Вне карточки' }, rank: 5 });
    const b = bindingsOf(DEFAULT_STATE);
    expect(conflictsOf(b, 'tCard', '⌘1')).toEqual([]); // ⌘1 «Заметки» is the window's
    expect(outerNote(b, 'tCard')).toBe('Вне карточки ⌘1 — «Заметки»');
  });
});
