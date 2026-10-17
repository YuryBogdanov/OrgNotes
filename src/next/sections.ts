// The sections of the new sidebar (ТЗ 43 §1): the core's on top — «Сегодня» (a tab, no panel), «Файлы», «Входящие»
// (while the Inbox plugin is on), «Агенда», «Теги», «Поиск»; then the plugins' sections in the old navigator's order.
// The section picked is the window's `navMode` (kept on this Mac); one that is gone shows «Файлы».

import type { NavSpec } from '../views';

export interface Section {
  id: string;
  label: string;
  /** An SVG path; `vb` its view box (the mockup's own icons are 16, the plugins' 20 as in the old navigator). */
  icon: string;
  vb: 16 | 20;
  key?: string;
  /** false: a screen, not a list — «Сегодня» opens its tab. */
  panel: boolean;
  badge?: () => number;
  /** The number is an alarm: red (a plugin's `setBadge(…, { tone: 'alert' })`). */
  alert?: () => boolean;
}

export const TODAY_ID = 'today';
const INBOX = 'inbox';

const ICONS = {
  today: 'M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4',
  files: 'M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4',
  inbox: 'M2 9.5 4 3h8l2 6.5V13H2zM2 9.5h3.5l1 1.5h3l1-1.5H14',
  agendas: 'M2 3h12v11H2zM2 6.5h12M5.5 1.5v3M10.5 1.5v3',
  tags: 'M6 2 4.5 14M11.5 2 10 14M2.5 5.5h11M2 10.5h11',
  search: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.5 10.5 14 14',
};

/** The core's sections and the plugins' — the latter in the order the old navigator has them. */
export function sectionsOf(navs: NavSpec[], files: number): { core: Section[]; plugins: Section[] } {
  const inbox = navs.find((n) => n.id === INBOX);
  const core: Section[] = [
    { id: TODAY_ID, label: 'Сегодня', icon: ICONS.today, vb: 20, key: 'today', panel: false },
    { id: 'files', label: 'Файлы', icon: ICONS.files, vb: 20, key: 'navFiles', panel: true, badge: () => files },
    ...(inbox ? [{ id: INBOX, label: 'Входящие', icon: ICONS.inbox, vb: 16 as const, key: inbox.key, panel: true, badge: inbox.badge, alert: inbox.alert }] : []),
    { id: 'agendas', label: 'Агенда', icon: ICONS.agendas, vb: 16, key: 'navAgendas', panel: true },
    { id: 'tags', label: 'Теги', icon: ICONS.tags, vb: 16, key: 'navTags', panel: true },
    { id: 'search', label: 'Поиск', icon: ICONS.search, vb: 16, key: 'navSearch', panel: true },
  ];
  const plugins = navs
    .filter((n) => n.id !== INBOX)
    .sort((a, b) => a.order - b.order)
    .map((n): Section => ({ id: n.id, label: n.label, icon: n.icon, vb: 20, key: n.key, panel: true, badge: n.badge, alert: n.alert }));
  return { core, plugins };
}

/** The section whose panel shows: the one picked, or «Файлы» when it is gone (its plugin turned off). */
export function shownSection(mode: string, s: { core: Section[]; plugins: Section[] }): Section {
  const all = [...s.core, ...s.plugins];
  return all.find((x) => x.id === mode && x.panel) ?? all.find((x) => x.id === 'files')!;
}
