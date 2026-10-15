// The built-in agenda (tech sprint 4.1, from Agenda.svelte): the open tasks and the events of the next 30 days, by
// day — what is overdue on top; each row knows its task (file, title, which of the same titles) and its date.

import { dayDiff, fmtDay, fmtLong, occurrences, repeaterLabel, titleIndex, toJs, toneFor, weekdayName, type DateKind, type Heading, type Workflow } from './org';
import { toneStyle } from './colors';
import { displayName } from './names';

export type AgendaItem = {
  day: number; // days from today
  time: string; kw: string | null; tone: string; ev: boolean; prio: string | null; // [#A]: a capsule, as on the board (#106)
  title: string; src: string; tags: string; mark: string; late: boolean; file: number; line: number; order: number;
  key: string; // the row: its task and its place in the list (lines move with edits, so not by line)
  path: string; n: number; // the task: its file, and which of the headings with its title there
  dk: DateKind | null; // the date the row stands by (⌥⇧← → moves it)
  stale?: boolean; // changed from the list and no longer fits it: dimmed until the list is refreshed (ТЗ 34)
  done?: boolean; // …and done: struck through too
};
/** A heading above rows: a day of the built-in agenda, a block of a custom one, a group inside a block. */
export type AgendaSection = {
  key: string; title: string; sub: string; tone: string; dot?: string; level: 1 | 2;
  items: AgendaItem[]; empty?: boolean; more?: number;
};

/** A file as the agenda sees it. */
export interface AgendaFile {
  name: string;
  path: string;
  headings: Heading[];
  wf: Workflow;
}

export function builtinItemsOf(files: AgendaFile[], from: Date): AgendaItem[] {
  const horizon = new Date(from); horizon.setDate(horizon.getDate() + 30);
  const out: AgendaItem[] = [];
  files.forEach((f, fi) => {
    for (const h of f.headings) {
      const isOpen = !!h.keyword && f.wf.open.includes(h.keyword);
      const isEvent = !h.keyword && !!h.event;
      if (!isOpen && !isEvent) continue;
      const n = titleIndex(f.headings, h.line, h.title);
      const base = {
        kw: h.keyword, tone: h.keyword ? toneStyle(toneFor(h.keyword, f.wf)) : '', ev: isEvent, prio: h.priority,
        title: h.title, src: [displayName(f.name), ...h.path].join(' › '), tags: h.tags.join(' '),
        file: fi, line: h.line, path: f.path, n,
      };
      const push = (d: Date, time: string, mark: string, order: number, dk: DateKind) => {
        const day = dayDiff(d, from);
        out.push({ ...base, day, time, mark, order, dk, late: day < 0, key: `${f.path}|${h.title}|${n}|${dk}|${day}` });
      };
      if (h.event) {
        const rep = repeaterLabel(h.event.repeater);
        for (const d of occurrences(h.event, from, horizon)) push(d, h.event.time ?? '', rep || 'Событие', 1, 'event');
      }
      if (h.scheduled) {
        const base0 = toJs(h.scheduled);
        const overdue = dayDiff(base0, from);
        if (overdue < 0) push(base0, h.scheduled.time ?? '', `Запланировано ${fmtDay(base0)}`, 0, 'SCHEDULED');
        else if (base0 <= horizon) push(base0, h.scheduled.time ?? '', h.scheduled.repeater ? repeaterLabel(h.scheduled.repeater) : 'Запланировано', 1, 'SCHEDULED');
      }
      if (h.deadline) {
        const d = toJs(h.deadline);
        const n = dayDiff(d, from);
        if (n < 0) push(d, '', `Дедлайн ${fmtDay(d)}`, 0, 'DEADLINE');
        else if (d <= horizon) push(d, '', `Дедлайн ${fmtDay(d)} · ${n === 0 ? 'сегодня' : `через ${n} дн.`}`, 2, 'DEADLINE');
      }
    }
  });
  return out.sort((a, b) => a.day - b.day || a.order - b.order || a.time.localeCompare(b.time));
}
/** The items by day: overdue, today, tomorrow, the days of the week, later. */
export function builtinSectionsOf(items: AgendaItem[], midnight: Date): AgendaSection[] {
  const map = new Map<string, AgendaSection>();
  for (const it of items) {
    const d = new Date(midnight); d.setDate(d.getDate() + it.day);
    let key: string, title: string, sub: string, tone = '--fg';
    if (it.day < 0) { key = 'over'; title = 'Просрочено'; sub = ''; tone = '--todo'; }
    else if (it.day === 0) { key = 'today'; title = 'Сегодня'; sub = fmtLong(d); }
    else if (it.day === 1) { key = 'd' + it.day; title = 'Завтра'; sub = fmtDay(d); }
    else if (it.day <= 7) { key = 'd' + it.day; title = weekdayName(d); sub = fmtDay(d); }
    else { key = 'later'; title = 'Позже'; sub = 'ближайшие 30 дней'; }
    if (!map.has(key)) map.set(key, { key, title, sub, tone, level: 1, items: [] });
    map.get(key)!.items.push(it);
  }
  return [...map.values()];
}
