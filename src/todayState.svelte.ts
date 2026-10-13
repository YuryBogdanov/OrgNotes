// «Сегодня» (ТЗ 32) on the store's side: its settings (the folder's part in `.orgnotes/plugins/today.json`, the
// personal part on this Mac), the clock it follows (the day turns at 4:00), and its pinned tab — opened first in the
// left pane, by itself at the start of the day when the settings say so.

import { store } from './store.svelte';
import { isPinned, newTab, pinFirst, type Layout } from './layout';
import type { Schema, Values } from './settingsSchema';
import { DEFAULT_FOLDER, DEFAULT_LOCAL, cleanTag, dayOf, readFolder, readLocal, shouldShow, type TodayFolder, type TodayLocal } from './today';

export const TODAY = 'today'; // the kind of its tab
const SHOWN = 'today:shown'; // when it was last shown (ms)

store.registerStorage(TODAY);

class TodayState {
  get folder(): TodayFolder {
    return readFolder(store.folderData(TODAY) ?? DEFAULT_FOLDER);
  }
  get local(): TodayLocal {
    return readLocal(store.localData(TODAY) ?? DEFAULT_LOCAL);
  }
  async setFolder(patch: Partial<TodayFolder>) {
    await store.setFolderData(TODAY, { ...this.folder, ...patch });
  }
  setLocal(patch: Partial<TodayLocal>) {
    store.setLocalData(TODAY, { ...this.local, ...patch });
  }
  /** The files of «Задачи»: the chosen ones, else the Inbox's file (else inbox.org). */
  get taskFiles(): string[] {
    return this.folder.files ?? [store.inboxCfg.file || 'inbox.org'];
  }

  /** Now, to the minute: the past events dim, the day turns at 4:00. */
  now = $state(new Date());
  day = $derived(dayOf(this.now));
  private timer: ReturnType<typeof setInterval> | null = null;
  tick() {
    const n = new Date();
    if (n.getMinutes() !== this.now.getMinutes() || +n - +this.now > 60000) this.now = n;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 20000);
  }

  private lastShown(): number | null {
    try {
      const v = Number(localStorage.getItem(SHOWN));
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  }
  private markShown() {
    try {
      localStorage.setItem(SHOWN, String(Date.now()));
    } catch {
      /* this time only */
    }
  }
  /** At launch, on coming back to the window, on the first action after 4:00: opens it when the settings say so. */
  check(launch: boolean) {
    this.tick();
    if (!store.loaded || !store.dir || store.mirror) return;
    if (shouldShow(this.local.show, this.lastShown(), this.now, launch)) this.open(true);
  }
  /** ⇧⌘H, the palette, the menu, or by itself: the pinned tab first in the left pane, active. */
  open(auto = false) {
    const L = store.layout;
    const where = L.panes.findIndex((p) => p.tabs.some(isPinned));
    if (where < 0 && auto && !this.local.overTabs) closeYesterday(L);
    if (where < 0) {
      const p = L.panes[0];
      p.tabs.unshift(newTab(TODAY));
      p.active = 0;
    }
    pinFirst(L);
    L.panes[0].active = 0;
    L.active = 0;
    this.markShown();
  }
}
export const today = new TodayState();

/** «Поверх вчерашних вкладок» off: yesterday's tabs close; a text not saved anywhere stays. */
function closeYesterday(L: Layout) {
  const keep = L.panes.flatMap((p) => p.tabs).filter((t) => t.kind === 'untitled' && !!t.text?.trim());
  L.panes = [{ ...L.panes[0], tabs: keep, active: 0 }];
  L.active = 0;
}

// ---- «Настройки → Сегодня» (ТЗ 32 §6): the parts drawn by the schema; the chips and the blocks are the section's own ----

const both = (): Values => ({ ...today.local, ...today.folder });
const put = (patch: Values) => {
  const loc = Object.keys(patch).filter((k) => k in DEFAULT_LOCAL);
  const fol = Object.keys(patch).filter((k) => k in DEFAULT_FOLDER);
  if (loc.length) today.setLocal(Object.fromEntries(loc.map((k) => [k, patch[k]])) as Partial<TodayLocal>);
  if (fol.length) void today.setFolder(Object.fromEntries(fol.map((k) => [k, patch[k]])) as Partial<TodayFolder>);
};
export const showSchema: Schema = {
  id: 'today', label: 'Сегодня', values: both, set: put,
  groups: [{
    caption: 'ПОКАЗ',
    fields: [
      { key: 'show', type: 'choice', look: 'segments', where: 'local', label: 'Показывать «Сегодня»', hint: 'В начале дня — первое открытие приложения или пробуждение Mac после 4:00',
        options: [{ value: 'day', label: 'В начале дня' }, { value: 'launch', label: 'При запуске' }, { value: 'command', label: 'По команде' }] },
      { key: 'overTabs', type: 'switch', where: 'local', label: 'Поверх вчерашних вкладок', hint: (v) => (v.overTabs ? 'Вкладки остаются, «Сегодня» открывается первой' : 'Вчерашние вкладки закрываются, остаётся только «Сегодня»') },
    ],
  }],
};
export const moreSchema: Schema = {
  id: 'today', label: 'Сегодня', values: both, set: put,
  groups: [
    {
      caption: 'АГЕНДА И 1-1',
      fields: [
        { key: 'agenda', type: 'choice', look: 'menu', where: 'folder', label: 'Агенда', hint: 'Любая агенда из конструктора',
          options: () => [{ value: '', label: 'Встроенная: сегодня' }, ...store.agendas.map((a) => ({ value: a.id, label: a.name }))] },
        { key: 'tag', type: 'text', where: 'folder', label: 'Тег встреч 1-1', placeholder: '1on1', clean: (s) => cleanTag(s) || DEFAULT_FOLDER.tag,
          hint: 'Заголовок с этим тегом и повторяющейся датой встречи. Имя — из #+TITLE или имени файла' },
      ],
    },
    {
      caption: 'КОНЕЦ ДНЯ',
      fields: [
        { key: 'journal', type: 'file', where: 'folder', label: 'Журнал', show: (rel) => rel ?? DEFAULT_FOLDER.journal },
      ],
      help: 'Дерево дат: год › месяц › день › «На завтра».',
    },
  ],
};
