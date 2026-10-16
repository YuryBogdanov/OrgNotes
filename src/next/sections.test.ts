import { describe, expect, it } from 'vitest';
import type { NavSpec } from '../views';
import { sectionsOf, shownSection } from './sections';

const nav = (id: string, order: number, label = id): NavSpec => ({ id, label, icon: 'M0 0', order, component: null as never, key: `k.${id}`, badge: () => order });

describe('the sidebar\'s sections (ТЗ 43 §1)', () => {
  it('the core on top, «Входящие» among them while the Inbox plugin is on; the plugins in the navigator\'s order', () => {
    const s = sectionsOf([nav('calendar', 50), nav('inbox', 10, 'Inbox'), nav('long-matters', 100), nav('quarter-goals', 40)], 38);
    expect(s.core.map((x) => x.label)).toEqual(['Сегодня', 'Файлы', 'Входящие', 'Агенда', 'Теги', 'Поиск']);
    expect(s.core[1].badge?.()).toBe(38);
    expect(s.core[2].badge?.()).toBe(10); // the plugin's badge
    expect(s.plugins.map((x) => x.id)).toEqual(['quarter-goals', 'calendar', 'long-matters']);
  });
  it('no Inbox, no plugins: no «Входящие», no group', () => {
    const s = sectionsOf([], 0);
    expect(s.core.map((x) => x.id)).toEqual(['today', 'files', 'agendas', 'tags', 'search']);
    expect(s.plugins).toEqual([]);
  });
  it('the panel shown: the one picked; «Сегодня» or a section gone — «Файлы»', () => {
    const s = sectionsOf([nav('calendar', 50)], 1);
    expect(shownSection('calendar', s).id).toBe('calendar');
    expect(shownSection('tags', s).id).toBe('tags');
    expect(shownSection('today', s).id).toBe('files');
    expect(shownSection('quarter-goals', s).id).toBe('files'); // its plugin off
  });
});
