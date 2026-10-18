// «Сегодня» (ТЗ 32) on the store's side: its settings (the folder's part in `.orgnotes/plugins/today.json`, the
// personal part on this Mac), the clock it follows (the day turns at 4:00), and its pinned tab — opened first in the
// left pane, by itself at the start of the day when the settings say so.

import { store } from './store.svelte';
import { isPinned, newTab, pinFirst, type Layout } from './layout';
import type { Schema, Values } from './settingsSchema';
import { isoOf, newId, writeDay, type DayTask, type Link } from './endDay';
import { allTodayBlocks, withNew } from './todayBlocks';
import { DEFAULT_FOLDER, DEFAULT_LOCAL, cleanTag, dayOf, journalDays, readFolder, remindDue, readLocal, shouldShow, type BlockState, type TodayFolder, type TodayLocal } from './today';

export const TODAY = 'today'; // the kind of its tab
const SHOWN = 'today:shown'; // when it was last shown (ms)
const REMINDED = 'today:reminded'; // the day reminded last (yyyy-mm-dd)
const MOON = 'M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z';

store.registerStorage(TODAY);
store.addSheet(() => today.ending);

/** A task as «Завершить день» knows it (its :ID: if it has one). */
export type EndTask = Pick<DayTask, 'key' | 'path' | 'line' | 'title'> & { id?: string };
export interface EndPlan {
  moves: { task: EndTask; date: Date }[]; // «Не успел»: SCHEDULED moves there
  focus: EndTask[]; // «Главное на завтра»
  done: EndTask[]; // «Сделано»
  note: string; // «Заметка на завтра»
}

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
  /** The blocks in their order: the saved one, then the blocks registered since (a plugin's), on. */
  get blocks(): BlockState[] {
    return withNew(this.folder.blocks, allTodayBlocks());
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
    this.remindCheck(n);
  }

  // ---- «Напоминать завершить день» (ТЗ 32 §5) ----
  private remindCheck(now: Date) {
    if (!store.loaded || !store.dir || store.mirror) return;
    const j = store.files.find((f) => f.name === this.folder.journal);
    const ended = !!j && journalDays(j).some((d) => isoOf(d.date) === isoOf(now));
    let on: string | null = null;
    try {
      on = localStorage.getItem(REMINDED);
    } catch {
      /* none */
    }
    if (!remindDue(this.local, now, on, ended)) return;
    try {
      localStorage.setItem(REMINDED, isoOf(now));
    } catch {
      /* this time only */
    }
    void this.remind();
  }
  /** The notification of macOS; without one, the window's. */
  async remind() {
    let shown = false;
    if ('__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      shown = !!(await invoke<boolean>('remind_end_day').catch(() => false));
    }
    // the window's own when macOS cannot show one (no app bundle: `tauri dev`, the browser)
    if (!shown) store.note('Завершить день? Запишите заметку на завтра', [{ label: 'Завершить день…', run: () => this.openEndDay() }], 10 * 60000, MOON);
  }
  /** The reminder is on: macOS asks for the permission once (in an app built). */
  async prepareRemind() {
    if (!this.local.remind || !('__TAURI_INTERNALS__' in window)) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('remind_prepare').catch(() => {});
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
  // ---- «Завершить день» (ТЗ 32 §3) ----
  /** The sheet is up. */
  ending = $state(false);
  openEndDay() {
    if (!store.dir && !store.files.length) return;
    this.tick();
    this.ending = true;
  }
  /**
   * One transaction, one ⌘Z: the moves of «Не успел», an :ID: for every task linked that has none, the day in the
   * journal (the file made when it is not there). Closes the sheet and says so; false when nothing was written.
   */
  async finishDay(plan: EndPlan): Promise<boolean> {
    const journal = await store.ensureFile(this.folder.journal);
    if (!journal) return false;
    const ids = new Map<string, string>(); // a task's key → its id
    const link = (t: EndTask): Link => {
      if (!ids.has(t.key)) ids.set(t.key, t.id ?? newId());
      return { id: ids.get(t.key)!, title: t.title };
    };
    const focus = plan.focus.map(link);
    const done = plan.done.map(link);
    const all = [...plan.focus, ...plan.done];
    const step = await store.transaction('Завершить день', (tx) => {
      for (const m of plan.moves) tx.setPlanning({ path: m.task.path, line: m.task.line, title: m.task.title }, 'SCHEDULED', m.date);
      for (const t of all) if (!t.id) tx.setProperty({ path: t.path, line: t.line, title: t.title }, 'ID', ids.get(t.key)!);
      tx.update(journal.path, (text) => writeDay(text, this.day, { note: plan.note, focus, done }, new Date()));
    });
    if (!step) return false;
    this.ending = false;
    store.note('День завершён. До завтра', undefined, 3000, MOON);
    return true;
  }
  /** At launch, on coming back to the window, on the first action after 4:00: opens it when the settings say so. */
  check(launch: boolean) {
    this.tick();
    if (!store.loaded || !store.dir || store.mirror) return;
    if (shouldShow(this.local.show, this.lastShown(), this.now, launch)) this.open(true);
  }
  /** ⇧⌘H, the palette, the menu, or by itself: the pinned tab first in the left pane, active. The new interface
   *  (ТЗ 50 §4): a tab as any — the one there is made active, else a new one after the active tab. */
  open(auto = false) {
    const L = store.layout;
    if (store.nextUi) {
      const has = () => L.panes.findIndex((p) => p.tabs.some((t) => t.kind === TODAY));
      if (has() < 0 && auto && !this.local.overTabs) closeYesterday(L);
      let pi = has();
      if (pi < 0) {
        pi = Math.max(0, Math.min(L.active, L.panes.length - 1));
        const p = L.panes[pi];
        const at = p.tabs.length ? Math.min(p.active + 1, p.tabs.length) : 0;
        p.tabs.splice(at, 0, newTab(TODAY)); // (the state's proxy of it is in the list, not the tab itself)
        p.active = at;
      } else L.panes[pi].active = L.panes[pi].tabs.findIndex((t) => t.kind === TODAY);
      L.active = pi;
      this.markShown();
      return;
    }
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
// 15:00 … 21:00 by a quarter of an hour (ТЗ 32 §5); a time set before outside them stays in the list
const TIMES = Array.from({ length: 25 }, (_, i) => {
  const t = `${String(15 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`;
  return { value: t, label: t };
});
const timesWith = (v: Values) => {
  const now = typeof v.remindAt === 'string' ? v.remindAt : '';
  return now && !TIMES.some((o) => o.value === now) ? [...TIMES, { value: now, label: now }].sort((a, b) => a.value.localeCompare(b.value)) : TIMES;
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
        { key: 'remind', type: 'switch', where: 'local', label: 'Напоминать завершить день', hint: 'Уведомление macOS' },
        { key: 'remindAt', type: 'choice', look: 'menu', where: 'local', label: 'Время напоминания', hint: 'Обычно за полчаса до конца рабочего дня', options: timesWith, disabled: (v) => v.remind === false },
      ],
      help: 'Журнал — дерево дат: год › месяц › день › «На завтра». Напоминание — по будням, пока приложение открыто.',
    },
  ],
};
