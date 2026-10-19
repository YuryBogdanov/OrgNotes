import { describe, expect, it } from 'vitest';
import type { NavSpec } from '../views';
import { sectionsOf, shownSection } from './sections';

const nav = (id: string, order: number, label = id): NavSpec => ({ id, label, icon: 'M0 0', order, component: null as never, key: `k.${id}`, badge: () => order, alert: () => id === 'long-matters' });

describe('the sidebar\'s sections (ТЗ 43 §1)', () => {
  it('the core on top, «Входящие» among them while the Inbox plugin is on; the plugins in the navigator\'s order', () => {
    const s = sectionsOf([nav('calendar', 50), nav('inbox', 10, 'Inbox'), nav('long-matters', 100), nav('quarter-goals', 40)]);
    expect(s.core.map((x) => x.label)).toEqual(['Сегодня', 'Файлы', 'Входящие', 'Агенда', 'Теги', 'Поиск']);
    expect(s.core[1].badge).toBeUndefined(); // fix-50: «Файлы» — no badge, their count is the panel's line
    expect(s.core.filter((x) => x.badge).map((x) => x.id)).toEqual(['inbox']); // only what waits for an action
    expect(s.core[2].badge?.()).toBe(10); // the plugin's badge
    expect(s.plugins.map((x) => x.id)).toEqual(['quarter-goals', 'calendar', 'long-matters']);
    expect(s.plugins.map((x) => x.alert?.())).toEqual([false, false, true]); // the plugin's alarm passed on
  });
  it('no Inbox, no plugins: no «Входящие», no group', () => {
    const s = sectionsOf([]);
    expect(s.core.map((x) => x.id)).toEqual(['today', 'files', 'agendas', 'tags', 'search']);
    expect(s.plugins).toEqual([]);
  });
  it('the panel shown: the one picked, «Сегодня» too (its panel, ТЗ 50 §4); a section gone — «Файлы»', () => {
    const s = sectionsOf([nav('calendar', 50)]);
    expect(shownSection('calendar', s).id).toBe('calendar');
    expect(shownSection('tags', s).id).toBe('tags');
    expect(shownSection('today', s).id).toBe('today');
    expect(shownSection('quarter-goals', s).id).toBe('files'); // its plugin off
  });
});
