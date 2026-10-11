// The command palette's registry and its steps. A feature adds a command with `register`: its title, icon,
// group, when it is available (does it need a heading under the cursor, a file, the notes folder), a hint with
// the current state and a shortcut. A command either runs at once or returns the next step, shown in the same
// palette window (a list to pick from, or a text to type).
import { store, type NoteFile } from './store.svelte';
import { fuzzy, better, type Match } from './fuzzy';
import { displayName } from './names';
import { parseDate } from './edits';
import type { Heading, OrgDate } from './org';

export const ICONS = {
  status: 'M3 10h14M12.5 6l4 4-4 4',
  sched: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3',
  dead: 'M5 17V3M5 4h10l-2 3 2 3H5',
  tag: 'M3 3h6.5l7.5 7.5-6 6L3.5 9.5zM6.8 6.8h.01',
  refile: 'M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5zM8 11h5M11 9l2 2-2 2',
  newfile: 'M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4M10 9v5M7.5 11.5h5',
  newfolder: 'M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5zM10 9v4.5M7.75 11.25h4.5',
  task: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 7v6M7 10h6',
  head: 'M3 4.5h8M6 9h8M9 13.5h8',
  goto: 'M9 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM13.5 13.5L17 17',
  file: 'M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4',
  folder: 'M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z',
  check: 'M4 10.5l4 4 8-9',
  inbox: 'M3 11l2-7h10l2 7v5H3zM3 11h4l1 2h4l1-2h4',
  prio: 'M10 3v10M10 16.5v.01',
  clear: 'M5 5l10 10M15 5L5 15',
};
export type Icon = keyof typeof ICONS;

/** Where the palette was opened from. */
export interface Ctx {
  file?: NoteFile;
  fileIdx: number;
  heading?: Heading; // the heading the cursor is in
  line: number; // the cursor line
  folderRel: string; // the folder of the current file: new files go there
  canFiles: boolean; // files and folders can be made (a notes folder is open)
  noFolder: boolean; // the app has no notes folder yet
}

/** One line of the list. Without `run` it is not selectable ("Ничего не найдено", a prompt). */
export interface Row {
  id: string;
  group: string; // rows come grouped; a header is drawn where the group changes
  title: string;
  at?: number[]; // matched characters, bold
  icon?: Icon;
  hint?: string;
  key?: string;
  italic?: boolean;
  level?: number; // headings: the indent
  prefer?: boolean; // selected when the list first shows (the heading the cursor is in)
  run?: () => Step | void;
}
export type Plate =
  | { kind: 'heading'; h: Heading; file: NoteFile }
  | { kind: 'general'; file: NoteFile; line: number }
  | { kind: 'headings'; file: NoteFile }
  | { kind: 'text'; text: string; right?: string };
export interface Step {
  placeholder: string;
  ghost?: (q: string) => string; // a grey hint after what was typed («#» → «заголовок»)
  initial?: string;
  plate: (q: string) => Plate | null;
  rows: (q: string) => Row[];
}
export interface Command {
  id: string;
  title: string;
  icon: Icon;
  group: 'heading' | 'general';
  synonyms?: string[];
  key?: string;
  when: (c: Ctx) => boolean;
  hint?: (c: Ctx) => string;
  run: (c: Ctx) => Step | void;
}

const GROUPS = { heading: 'К ЗАГОЛОВКУ', general: 'ОБЩИЕ' } as const;
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const short = (d: OrgDate) => `${d.d} ${MONTHS_SHORT[d.m - 1]}`;
const long = (d: Date) => `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
const folderName = (c: Ctx) => (c.folderRel ? c.folderRel.split('/').pop()! : rootName());
const rootName = () => (store.dir ? store.dir.split('/').pop()! : 'заметки');
const dirOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
const NOTHING: Row = { id: 'none', group: '', title: 'Ничего не найдено' };
/** A title without its progress cookie: «Бюджет [1/3]» → «Бюджет». */
export const bare = (title: string) => title.replace(/\s*\[\d*(?:\/\d*|%)\]/g, '').trim();

// ---- history: often and recently used commands come first among equal matches ----------------------------

type Uses = Record<string, { n: number; t: number }>;
const HKEY = 'palette:history';
function uses(): Uses {
  try {
    return JSON.parse(localStorage.getItem(HKEY) ?? '{}') as Uses;
  } catch {
    return {};
  }
}
export function remember(id: string) {
  const u = uses();
  u[id] = { n: (u[id]?.n ?? 0) + 1, t: Date.now() };
  try {
    localStorage.setItem(HKEY, JSON.stringify(u));
  } catch {
    /* private window: no history */
  }
}
/** Uses, with older ones counting less (half after two weeks). */
const weight = (u: Uses, id: string) => (u[id] ? u[id].n * Math.pow(0.5, (Date.now() - u[id].t) / (14 * 86400000)) : 0);

// ---- the registry -------------------------------------------------------------------------------------------

export const commands: Command[] = [];
export const register = (c: Command) => commands.push(c);
const onHeading = (c: Ctx) => !!c.heading;

register({
  id: 'status', title: 'Сменить статус…', icon: 'status', group: 'heading', synonyms: ['статус', 'состояние', 'todo', 'done'],
  when: onHeading, hint: (c) => (c.heading!.keyword ? `сейчас ${c.heading!.keyword}` : 'без статуса'), run: statusStep,
});
register({
  id: 'schedule', title: 'Запланировать…', icon: 'sched', group: 'heading', synonyms: ['scheduled', 'дата', 'план'],
  when: onHeading, hint: (c) => (c.heading!.scheduled ? short(c.heading!.scheduled) : ''), run: (c) => dateStep(c, 'SCHEDULED'),
});
register({
  id: 'deadline', title: 'Поставить дедлайн…', icon: 'dead', group: 'heading', synonyms: ['дедлайн', 'deadline', 'срок'],
  when: onHeading, hint: (c) => (c.heading!.deadline ? short(c.heading!.deadline) : ''), run: (c) => dateStep(c, 'DEADLINE'),
});
register({
  id: 'tags', title: 'Изменить теги…', icon: 'tag', group: 'heading', synonyms: ['тег', 'теги', 'метки', 'tags'],
  when: onHeading, hint: (c) => c.heading!.tags.join(', '), run: tagsStep,
});
register({
  id: 'refile', title: 'Перенести в другой файл…', icon: 'refile', group: 'heading', synonyms: ['переместить', 'refile'],
  when: onHeading, run: () => store.startRefile('palette'),
});
register({
  id: 'review', title: 'Разобрать Inbox', icon: 'inbox', group: 'general', key: '⇧⌘R', synonyms: ['разбор', 'inbox', 'карточки'],
  when: () => store.reviewPending.length > 0, hint: () => `${store.reviewPending.length} в очереди`, run: () => store.startReview(),
});
register({
  id: 'newFile', title: 'Создать файл…', icon: 'newfile', group: 'general', key: '⇧⌘N', synonyms: ['новый файл', 'заметка'],
  when: (c) => c.canFiles, hint: (c) => `в ${folderName(c)}`, run: (c) => nameStep(c, 'file'),
});
register({
  id: 'newFolder', title: 'Создать папку…', icon: 'newfolder', group: 'general', synonyms: ['новая папка'],
  when: (c) => c.canFiles, hint: (c) => `в ${folderName(c)}`, run: (c) => nameStep(c, 'folder'),
});
register({
  id: 'newTask', title: 'Новая задача', icon: 'task', group: 'general', synonyms: ['создать задачу', 'задача', 'todo'],
  when: (c) => !!c.file, hint: (c) => `в ${displayName(c.file!.name)}`, run: () => store.newTask(),
});
register({
  id: 'goto', title: 'Перейти к файлу…', icon: 'goto', group: 'general', key: '⇧⌘O', synonyms: ['открыть файл', 'файл'],
  when: () => store.files.length > 0, run: () => gotoStep(),
});
register({
  id: 'outline', title: 'Показать структуру файла', icon: 'head', group: 'general', synonyms: ['структура', 'заголовки', 'outline', 'оглавление'],
  when: (c) => !!c.file, run: () => store.showOutline(),
});
register({
  id: 'chooseFolder', title: 'Выбрать рабочую папку…', icon: 'folder', group: 'general', synonyms: ['открыть папку'],
  when: (c) => c.noFolder, run: () => void store.chooseFolder(),
});

register({
  id: 'rich', title: 'Оформленный текст', icon: 'head', group: 'general', synonyms: ['оформление', 'вид', 'org-modern', 'красиво'],
  when: () => true, hint: () => (store.rich ? 'включён' : 'выключен'), run: () => store.setRich(!store.rich),
});

// ---- matching -------------------------------------------------------------------------------------------------

/** The best match of the query in a title or one of its synonyms (only the title's letters are made bold). */
function matchCommand(q: string, c: Command): { m: Match; at: number[] } | null {
  let best: { m: Match; at: number[] } | null = null;
  for (const [i, text] of [c.title, ...(c.synonyms ?? [])].entries()) {
    const m = fuzzy(q, text);
    if (m && (!best || better(m, best.m))) best = { m, at: i === 0 ? m.at : [] };
  }
  return best;
}
const rank = <T extends { m: Match; w: number; i: number }>(a: T, b: T) =>
  a.m.wordStart !== b.m.wordStart ? (a.m.wordStart ? -1 : 1) : a.m.span - b.m.span || b.w - a.w || a.i - b.i;

function fileRows(q: string): Row[] {
  const out: { r: Row; m: Match; w: number; i: number }[] = [];
  store.files.forEach((f, i) => {
    const name = displayName(f.name);
    const m = fuzzy(q, name);
    if (!m) return;
    out.push({
      m, w: 0, i,
      r: { id: 'file:' + f.path, group: 'ФАЙЛЫ', title: name, at: m.at, icon: 'file', hint: dirOf(f.name), run: () => store.jump(i, 0) },
    });
  });
  return out.sort(rank).map((x) => x.r);
}

// ---- the first step: commands and files ---------------------------------------------------------------------

export function contextOf(): Ctx {
  const file = store.file;
  const h = file && store.selected >= 0 ? file.headings[store.selected] : undefined;
  return {
    file, fileIdx: store.cur, heading: h, line: store.cursor.line,
    folderRel: file ? dirOf(file.name) : '', canFiles: store.canManageFiles, noFolder: store.needsFolder,
  };
}

export function mainStep(c: Ctx): Step {
  return {
    placeholder: 'Команда или файл…',
    // «#» and «№» (the same key on the Russian layout) both go to headings
    ghost: (q) => (q === '#' || q === '№' ? 'заголовок' : ''),
    plate: (q) => {
      if (!c.file) return null;
      if (/^[#№]/.test(q)) return { kind: 'headings', file: c.file };
      return c.heading ? { kind: 'heading', h: c.heading, file: c.file } : { kind: 'general', file: c.file, line: c.line };
    },
    rows: (q) => {
      if (/^[#№]/.test(q)) return headingRows(c, q.slice(1)); // «@» stays an ordinary character for now
      const u = uses();
      const rows: Row[] = [];
      for (const g of ['heading', 'general'] as const) {
        const found = commands
          .map((cmd, i) => ({ cmd, i, hit: cmd.group === g && cmd.when(c) ? matchCommand(q, cmd) : null }))
          .filter((x) => x.hit)
          .map((x) => ({ ...x, m: x.hit!.m, w: weight(u, x.cmd.id) }));
        if (q.trim()) found.sort(rank);
        for (const { cmd, hit } of found)
          rows.push({
            id: cmd.id, group: GROUPS[g], title: cmd.title, at: hit!.at, icon: cmd.icon, hint: cmd.hint?.(c) || undefined, key: cmd.key,
            run: () => {
              remember(cmd.id);
              return cmd.run(c);
            },
          });
      }
      if (q.trim()) rows.push(...fileRows(q).slice(0, 50)); // files only for a query
      return rows.length ? rows : [NOTHING];
    },
  };
}

/** «#»: the headings of the current file, indented by level (ТЗ про навигатор, раздел 3, will say more). */
function headingRows(c: Ctx, q: string): Row[] {
  if (!c.file) return [{ id: 'none', group: '', title: 'Откройте файл, чтобы перейти к заголовку' }];
  const f = c.file;
  const rows = f.headings.flatMap((h, i): Row[] => {
    const title = bare(h.title);
    const m = fuzzy(q, title);
    return m ? [{ id: 'h:' + i, group: `ЗАГОЛОВКИ · ${displayName(f.name)}`, title, at: m.at, icon: 'head', hint: h.keyword ?? undefined, level: h.level - 1, prefer: !q.trim() && h === c.heading, run: () => store.jump(c.fileIdx, h.line) }] : [];
  });
  return rows.length ? rows : [NOTHING];
}

// ---- steps ------------------------------------------------------------------------------------------------------

const headingPlate = (c: Ctx) => () => (c.heading && c.file ? ({ kind: 'heading', h: c.heading, file: c.file } as Plate) : null);

function statusStep(c: Ctx): Step {
  const wf = c.file!.wf;
  const seqs = wf.sequences?.length ? wf.sequences : [];
  return {
    placeholder: 'Статус',
    plate: headingPlate(c),
    rows: (q) => {
      const rows: Row[] = [];
      for (const s of seqs)
        for (const st of s.states) {
          const m = fuzzy(q, st.name);
          if (m && !rows.some((r) => r.title === st.name))
            rows.push({ id: 'st:' + st.name, group: seqs.length > 1 ? s.name.toUpperCase() || 'СТАТУСЫ' : 'СТАТУСЫ', title: st.name, at: m.at, icon: st.done ? 'check' : 'status', hint: st.name === c.heading!.keyword ? 'сейчас' : undefined, run: () => store.setKeyword(st.name) });
        }
      const none = fuzzy(q, 'Без статуса');
      if (none && c.heading!.keyword) rows.push({ id: 'st:none', group: 'СТАТУСЫ', title: 'Без статуса', at: none.at, icon: 'clear', run: () => store.setKeyword(null) });
      return rows.length ? rows : [NOTHING];
    },
  };
}

function dateStep(c: Ctx, kind: 'SCHEDULED' | 'DEADLINE'): Step {
  const group = kind === 'SCHEDULED' ? 'ЗАПЛАНИРОВАТЬ' : 'ДЕДЛАЙН';
  const icon: Icon = kind === 'SCHEDULED' ? 'sched' : 'dead';
  const current = kind === 'SCHEDULED' ? c.heading!.scheduled : c.heading!.deadline;
  const pick = (d: Date | null) => () => store.setPlanning(kind, d);
  const today = new Date();
  const day = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  return {
    placeholder: 'Дата: сегодня, завтра, пт, 14 окт, +3д',
    plate: headingPlate(c),
    rows: (q) => {
      if (q.trim()) {
        const d = parseDate(q);
        return d ? [{ id: 'date', group, title: long(d), icon, run: pick(d) }] : [{ id: 'none', group: '', title: 'Не похоже на дату' }];
      }
      const rows: Row[] = [
        { id: 'today', group, title: 'Сегодня', icon, hint: long(day(0)), run: pick(day(0)) },
        { id: 'tomorrow', group, title: 'Завтра', icon, hint: long(day(1)), run: pick(day(1)) },
        { id: 'week', group, title: 'Через неделю', icon, hint: long(day(7)), run: pick(day(7)) },
      ];
      if (current) rows.push({ id: 'clear', group, title: 'Убрать дату', icon: 'clear', hint: short(current), run: pick(null) });
      return rows;
    },
  };
}

function priorityStep(c: Ctx): Step {
  const now = c.heading!.priority;
  return {
    placeholder: 'Приоритет',
    plate: headingPlate(c),
    rows: (q) => {
      const rows: Row[] = [];
      for (const p of ['A', 'B', 'C']) {
        const m = fuzzy(q, p);
        if (m) rows.push({ id: 'pr:' + p, group: 'ПРИОРИТЕТ', title: p, at: m.at, icon: 'prio', hint: p === now ? 'сейчас' : undefined, run: () => store.setPriority(p) });
      }
      const none = fuzzy(q, 'Без приоритета');
      if (none && now) rows.push({ id: 'pr:none', group: 'ПРИОРИТЕТ', title: 'Без приоритета', at: none.at, icon: 'clear', run: () => store.setPriority(null) });
      return rows.length ? rows : [NOTHING];
    },
  };
}

/** A heading command's step at once (the card's buttons in «Разбор Inbox»); without a heading, the commands. */
export function headingStep(c: Ctx, kind: 'status' | 'priority' | 'schedule' | 'deadline' | 'tags'): Step {
  if (!c.heading) return mainStep(c);
  return kind === 'status' ? statusStep(c) : kind === 'priority' ? priorityStep(c) : kind === 'tags' ? tagsStep(c) : dateStep(c, kind === 'schedule' ? 'SCHEDULED' : 'DEADLINE');
}

function tagsStep(c: Ctx): Step {
  const before = c.heading!.tags;
  return {
    placeholder: 'Теги через пробел',
    initial: before.join(' '),
    plate: headingPlate(c),
    rows: (q) => {
      const tags = [...new Set(q.split(/[\s,:;#]+/).filter(Boolean))];
      return [
        tags.length
          ? { id: 'tags', group: 'ТЕГИ', title: `Сохранить теги: ${tags.join(', ')}`, icon: 'tag', run: () => store.setTags(tags) }
          : { id: 'tags', group: 'ТЕГИ', title: before.length ? 'Убрать все теги' : 'Введите теги через пробел', icon: 'tag', run: before.length ? () => store.setTags([]) : undefined },
      ];
    },
  };
}

export function nameStep(c: Ctx, kind: 'file' | 'folder'): Step {
  const where = folderName(c);
  return {
    placeholder: kind === 'file' ? 'Имя файла' : 'Имя папки',
    plate: () => ({ kind: 'text', text: kind === 'file' ? `Новый файл в папке «${where}»` : `Новая папка в «${where}»` }),
    rows: (q) => {
      const name = q.trim();
      const group = kind === 'file' ? 'НОВЫЙ ФАЙЛ' : 'НОВАЯ ПАПКА';
      return name
        ? [{ id: 'create', group, title: `Создать «${name}»`, icon: kind === 'file' ? 'newfile' : 'newfolder', hint: `в ${where}`, run: () => void store.createEntry(c.folderRel, name, kind) }]
        : [{ id: 'none', group, title: kind === 'file' ? 'Введите имя файла' : 'Введите имя папки' }];
    },
  };
}

export function gotoStep(): Step {
  return {
    placeholder: 'Имя файла',
    plate: () => null,
    rows: (q) => {
      const rows = fileRows(q);
      return rows.length ? rows : [NOTHING];
    },
  };
}
