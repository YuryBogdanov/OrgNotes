// Keyboard shortcuts: one registry of the commands that have them (ТЗ «Настройки: раздел „Клавиши“»), the two
// sets of defaults («Как в Emacs», «Как в macOS»), the user's changes on top, and the rules: what may be recorded,
// what clashes with what. A shortcut is kept as it is shown: «⇧⌘O», a chord as two presses «⌃C S».
// The menu bar, the keys of the window, of the editor and of the review all take their shortcuts from here.

/** The core's scopes; a feature registers its own (a review's tab) with `registerScope`. */
export type Scope = 'global' | 'window' | 'editor' | 'heading' | (string & {});
export type Preset = 'emacs' | 'mac';
export type GroupId = string;

export interface KeyCommand {
  id: string;
  title: string;
  group: GroupId;
  scope: Scope;
  keys?: string[]; // the default of both sets
  emacs?: string[]; // or each set its own
  mac?: string[];
  synonyms?: string[];
  note?: string; // a line under the title
  after?: string; // a feature's command: its place in the list, after this one (else at the end)
}

export const GROUPS: { id: GroupId; title: string; note?: string }[] = [
  { id: 'global', title: 'ГЛОБАЛЬНЫЕ', note: 'работают из любой программы' },
  { id: 'app', title: 'ПРИЛОЖЕНИЕ И ОКНО' },
  { id: 'file', title: 'ФАЙЛ И ВКЛАДКИ' },
  { id: 'search', title: 'ПОИСК' },
  { id: 'view', title: 'ВИД И ПАНЕЛИ' },
  { id: 'go', title: 'ПЕРЕХОДЫ' },
  { id: 'editor', title: 'РЕДАКТОР' },
  { id: 'heading', title: 'ЗАГОЛОВКИ И ЗАДАЧИ', note: 'в редакторе, курсор на заголовке' },
  { id: 'inbox', title: 'БЫСТРЫЙ ВВОД' },
];

export const SCOPE_NAMES: Record<Scope, string> = {
  global: 'в любой программе',
  window: 'в окне',
  editor: 'в редакторе',
  heading: 'на заголовке',
};

export const C = (id: string, title: string, group: GroupId, scope: Scope, keys: string[] = [], more: Partial<KeyCommand> = {}): KeyCommand => ({ id, title, group, scope, keys, ...more });

export const KEY_COMMANDS: KeyCommand[] = [
  C('capture', 'Новая задача в Inbox', 'global', 'global', ['⇧⌘I'], { synonyms: ['быстрый ввод', 'inbox'] }),

  C('settings', 'Настройки…', 'app', 'window', ['⌘,'], { synonyms: ['параметры', 'preferences'] }),
  C('palette', 'Командная палитра', 'app', 'window', ['⇧⌘P'], { synonyms: ['команды'] }),
  C('searchAll', 'Искать везде', 'app', 'window', ['⌘K'], { synonyms: ['поиск', 'палитра'], note: 'Только в новом интерфейсе: поле над редактором, открывает палитру' }),
  C('openFolder', 'Открыть другую папку…', 'app', 'window', [], { synonyms: ['рабочая папка'] }),
  C('closeWindow', 'Закрыть окно', 'app', 'window', ['⇧⌘W']),

  C('newTab', 'Новая вкладка', 'file', 'window', ['⌘T']),
  C('newFile', 'Новый файл', 'file', 'window', ['⌘N'], { synonyms: ['создать'] }),
  C('paletteNewFile', 'Создать файл…', 'file', 'window', ['⇧⌘N'], { synonyms: ['новый файл', 'заметка'] }),
  C('newFolder', 'Создать папку…', 'file', 'window', [], { synonyms: ['новая папка'] }),
  C('paletteGoto', 'Перейти к файлу…', 'file', 'window', ['⇧⌘O'], { synonyms: ['открыть файл'] }),
  C('save', 'Сохранить…', 'file', 'window', ['⌘S']),
  C('closeTab', 'Закрыть вкладку', 'file', 'window', ['⌘W']),
  C('closeOthers', 'Закрыть остальные вкладки', 'file', 'window', ['⌥⌘W']),
  C('moveRight', 'Переместить вкладку в правый редактор', 'file', 'window', ['⌃⌘→']),
  C('moveLeft', 'Переместить вкладку в левый редактор', 'file', 'window', ['⌃⌘←']),
  C('dupRight', 'Продублировать в правом редакторе', 'file', 'window', ['⌃⌥⌘→']),
  C('dupLeft', 'Продублировать в левом редакторе', 'file', 'window', ['⌃⌥⌘←']),
  C('revealInNav', 'Показать в навигаторе', 'file', 'window', ['⇧⌘J']),
  C('copyPath', 'Скопировать путь', 'file', 'window', ['⌥⌘C']),

  C('find', 'Найти…', 'search', 'window', ['⌘F'], { synonyms: ['поиск'] }),
  C('findAll', 'Найти во всех файлах…', 'search', 'window', ['⇧⌘F'], { synonyms: ['поиск', 'глобальный'] }),
  C('findNext', 'Найти далее', 'search', 'window', ['⌘G']),
  C('replace', 'Заменить…', 'search', 'window', ['⌥⌘F'], { synonyms: ['замена', 'найти и заменить'], note: 'Поиск в файле со строкой замены' }),
  C('findPrev', 'Найти ранее', 'search', 'window', ['⇧⌘G']),
  C('useSelection', 'Искать выделенное', 'search', 'window', ['⌘E']),
  C('searchNext', 'Следующий результат во всех файлах', 'search', 'window', ['⌥⌘G']),
  C('searchPrev', 'Предыдущий результат во всех файлах', 'search', 'window', ['⌥⇧⌘G']),

  C('jumpBar', 'Строка пути', 'view', 'window', ['⌃⌘J']),
  C('structure', 'Структурный вид', 'view', 'window'),
  C('rich', 'Оформленный текст', 'view', 'window', ['⌃⌘E'], { synonyms: ['оформление', 'исходник', 'org-modern'], note: 'В новом интерфейсе — «Оформление / Исходник»' }),
  C('splitRight', 'Разделить вправо', 'view', 'window', ['⌘\\'], { synonyms: ['второй редактор', 'панель'] }),
  C('swap', 'Поменять панели местами', 'view', 'window', ['⌃⇧⌘→']),
  C('keepOne', 'Оставить одну панель', 'view', 'window', ['⇧⌘\\']),
  C('closePane', 'Закрыть панель', 'view', 'window', ['⌃⌘W']),
  C('paneLeft', 'Перейти в левую панель', 'view', 'window', ['⌥⌘←']),
  C('paneRight', 'Перейти в правую панель', 'view', 'window', ['⌥⌘→']),
  C('nav', 'Навигатор', 'view', 'window', ['⌘0'], { synonyms: ['боковая панель'] }),
  C('miniOpen', 'Открыть в мини-окне', 'view', 'window', ['⇧⌘M'], { synonyms: ['мини-окно', 'поверх', 'созвон'] }),
  C('insp', 'Инспектор', 'view', 'window', ['⌥⌘0'], { synonyms: ['структура'], note: 'В новом интерфейсе — колонка «Структура»' }),
  C('navFiles', 'Навигатор: файлы', 'view', 'window', ['⌃⌘1']),
  C('navAgendas', 'Навигатор: агенды', 'view', 'window', ['⌃⌘3']),
  C('navTags', 'Навигатор: теги', 'view', 'window', ['⌃⌘8'], { synonyms: ['теги', 'метки', 'tags'] }),
  C('navSearch', 'Навигатор: поиск', 'view', 'window', ['⌃⌘6']),
  C('navCollapse', 'Навигатор: свернуть всё', 'view', 'window', [], { synonyms: ['дерево', 'папки'] }),
  C('navExpand', 'Навигатор: развернуть всё', 'view', 'window', [], { synonyms: ['дерево', 'папки'] }),
  C('outline', 'Показать структуру файла', 'view', 'window', [], { synonyms: ['оглавление', 'заголовки'] }),

  C('notes', 'Заметки', 'go', 'window', ['⌘1']),
  C('agenda', 'Агенда', 'go', 'window', ['⌘2']),
  C('back', 'Назад', 'go', 'window', ['⌘[']),
  C('followLink', 'Открыть ссылку под курсором', 'go', 'editor', ['⌘↩'], { synonyms: ['ссылка'] }),

  C('insertLink', 'Ссылка на заголовок…', 'editor', 'editor', ['⌃C ⌃L'], { synonyms: ['ссылка', 'вставить ссылку', 'org-insert-link'], note: 'С выделенным текстом — он станет подписью' }),
  C('editLink', 'Изменить ссылку…', 'editor', 'editor', ['⌥⌘K'], { synonyms: ['ссылка', 'адрес'], note: 'Курсор на ссылке: меняется цель, подпись остаётся' }),
  C('pasteText', 'Вставить как текст', 'editor', 'editor', ['⌥⇧⌘V'], { note: '⌘V на выделенный текст со ссылкой в буфере делает его ссылкой', synonyms: ['вставить без ссылки'] }),

  C('newHeading', 'Новый заголовок того же уровня', 'heading', 'editor', ['⌥↩'], { note: 'В списке — новый пункт', synonyms: ['пункт списка'] }),
  C('newTask', 'Новая задача того же уровня', 'heading', 'editor', ['⌥⇧↩'], { note: 'В списке — новый пункт с чекбоксом' }),
  C('promote', 'Повысить уровень', 'heading', 'heading', ['⌥←']),
  C('demote', 'Понизить уровень', 'heading', 'heading', ['⌥→']),
  C('promoteTree', 'Повысить уровень с поддеревом', 'heading', 'heading', ['⌥⇧←']),
  C('demoteTree', 'Понизить уровень с поддеревом', 'heading', 'heading', ['⌥⇧→']),
  C('subtreeUp', 'Переместить поддерево вверх', 'heading', 'heading', ['⌥↑']),
  C('subtreeDown', 'Переместить поддерево вниз', 'heading', 'heading', ['⌥↓']),
  C('statusNext', 'Следующий статус', 'heading', 'heading', ['⇧→'], { synonyms: ['todo', 'done'] }),
  C('statusPrev', 'Предыдущий статус', 'heading', 'heading', ['⇧←']),
  C('wfNext', 'Следующий набор статусов', 'heading', 'heading', ['⌃⇧→']),
  C('wfPrev', 'Предыдущий набор статусов', 'heading', 'heading', ['⌃⇧←']),
  C('prioUp', 'Приоритет выше', 'heading', 'heading', ['⇧↑']),
  C('prioDown', 'Приоритет ниже', 'heading', 'heading', ['⇧↓']),
  C('fold', 'Свернуть / развернуть', 'heading', 'heading', ['⇥'], { note: 'И drawer на его первой строке', synonyms: ['свёртка', 'fold'] }),
  C('cycleVisibility', 'Цикл видимости файла', 'heading', 'editor', ['⇧⇥'], { synonyms: ['свернуть всё'] }),
  C('status', 'Сменить статус…', 'heading', 'heading', [], { emacs: ['⌃C ⌃T'], mac: [], synonyms: ['todo', 'состояние'] }),
  C('schedule', 'Запланировать…', 'heading', 'heading', [], { emacs: ['⌃C S'], mac: [], synonyms: ['scheduled', 'дата'] }),
  C('deadline', 'Поставить дедлайн…', 'heading', 'heading', [], { emacs: ['⌃C D'], mac: [], synonyms: ['срок'] }),
  C('tags', 'Теги…', 'heading', 'editor', ['⌃C Q'], { emacs: ['⌃C Q', '⌃C ⌃Q'], synonyms: ['метки', 'изменить теги'], note: 'Поле тегов заголовка с подсказками из всех заметок' }),
  C('addNote', 'Добавить заметку…', 'heading', 'editor', ['⌃C ⌃Z'], { synonyms: ['заметка', 'статус', 'note', 'logbook', 'org-add-note'], note: 'Заметка с датой в :LOGBOOK: заголовка, как C-c C-z в Emacs' }),
  C('narrow', 'Сузить до заголовка', 'heading', 'editor', ['⌃X N S'], { synonyms: ['сужение', 'narrow', 'только этот заголовок'], note: 'Редактор показывает только поддерево заголовка под курсором' }),
  C('widen', 'Показать весь файл', 'heading', 'editor', ['⌃X N W'], { synonyms: ['сужение', 'widen', 'весь файл'] }),
  C('copyLink', 'Копировать ссылку на заголовок', 'heading', 'editor', ['⌃C L'], { synonyms: ['ссылка', 'link', 'org-store-link'] }),
  C('refile', 'Перенести в другой файл…', 'heading', 'heading', [], { emacs: ['⌃C ⌃W'], mac: [], synonyms: ['refile', 'переместить'] }),

  C('captureHere', 'Новая задача в Inbox (внутри окна)', 'inbox', 'window', [], { synonyms: ['быстрый ввод'] }),

];
export const commandById = new Map(KEY_COMMANDS.map((c) => [c.id, c]));

// ---- what features add (roadmap 0.3): their commands, groups and scopes --------------------------------------------

/** A feature's commands with their defaults: they take part in the menu, the palette's hints, «Клавиши», the clashes. */
export function registerKeys(list: KeyCommand[]) {
  for (const c of list) {
    if (commandById.has(c.id)) continue;
    const at = c.after ? KEY_COMMANDS.findIndex((x) => x.id === c.after) : -1;
    if (at >= 0) KEY_COMMANDS.splice(at + 1, 0, c);
    else KEY_COMMANDS.push(c);
    commandById.set(c.id, c);
  }
}
/** Take a plugin's commands back (turned off); its group goes when nothing is left in it. */
export function unregisterKeys(ids: string[], group?: GroupId) {
  for (const id of ids) {
    const i = KEY_COMMANDS.findIndex((c) => c.id === id);
    if (i >= 0) KEY_COMMANDS.splice(i, 1);
    commandById.delete(id);
  }
  if (group && !KEY_COMMANDS.some((c) => c.group === group)) {
    const g = GROUPS.findIndex((x) => x.id === group);
    if (g >= 0) GROUPS.splice(g, 1);
  }
}
/** A group of «Клавиши» of a feature (at the end). */
export function registerGroup(g: { id: GroupId; title: string; note?: string }) {
  if (!GROUPS.some((x) => x.id === g.id)) GROUPS.push(g);
}
/** A scope of a feature: a tab whose keys win over the scopes it is inside (`over`) while it is active. */
export interface ScopeSpec {
  id: string;
  /** «в разборе Inbox» */
  name: string;
  /** The scopes it is inside: the same shortcut there is no clash. */
  over: Scope[];
  /** «Вне разбора ⌘1 — …»: the scopes whose shortcut the note names, and its first word. */
  outside: { scopes: Scope[]; word: string };
  /** Which of the features' scopes is tried first (higher first). */
  rank: number;
  /** A tab of its own (a plugin's review): never active with another such scope, the same shortcut is no clash. */
  alone?: boolean;
}
export const SCOPES = new Map<string, ScopeSpec>();
export function registerScope(s: ScopeSpec) {
  SCOPES.set(s.id, s);
  SCOPE_NAMES[s.id] = s.name;
  for (const o of s.over) NESTED.push([s.id, o]);
}

/** For reference at the end of the section: not configurable. */
export const FIXED_KEYS: { keys: string; title: string }[] = [
  { keys: '⌘C  ⌘X  ⌘V', title: 'Скопировать, вырезать, вставить' },
  { keys: '⌘Z  ⇧⌘Z', title: 'Отменить, повторить' },
  { keys: '⌘A', title: 'Выделить всё' },
  { keys: '⌘Q  ⌘H  ⌘M', title: 'Выйти, скрыть, свернуть окно' },
  { keys: '←→↑↓, ⌥ и ⌘ со стрелками', title: 'Перемещение по тексту' },
  { keys: '↑↓  ↩  ⎋  ⌫', title: 'Палитра, списки и диалоги' },
  { keys: '⇧ + стрелки, ⌥⇧ + стрелки, .', title: 'Календарь выбора даты: день, неделя, месяц, год, сегодня' },
];

// ---- one press --------------------------------------------------------------------------------------------------

const MOD_ORDER = ['⌃', '⌥', '⇧', '⌘'] as const;
const NAMED: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Enter: '↩', NumpadEnter: '↩', Tab: '⇥', Space: 'Space',
  Backspace: '⌫', Delete: '⌦', Escape: '⎋', Home: '↖', End: '↘', PageUp: '⇞', PageDown: '⇟',
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
  Minus: '-', Equal: '=', Backquote: '`',
};
const CODE_OF = Object.fromEntries(Object.entries(NAMED).filter(([c]) => c !== 'NumpadEnter').map(([c, l]) => [l, c]));

/** The key of a press as shown: «C», «5», «←», «F5»; null for a modifier alone or a key the app does not name. */
export function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return NAMED[code] ?? null;
}
export interface Press {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}
type KeyEventLike = { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean };

export const pressText = (p: Press) => (p.ctrl ? '⌃' : '') + (p.alt ? '⌥' : '') + (p.shift ? '⇧' : '') + (p.meta ? '⌘' : '') + p.key;
/** A key event as a press («⇧⌘O»); by the physical key, so a Russian layout gives the same letters. */
export function pressOf(e: KeyEventLike): string | null {
  const key = keyName(e.code);
  return key ? pressText({ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, key }) : null;
}
export function parsePress(s: string): Press | null {
  const p: Press = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  let i = 0;
  for (; i < s.length && MOD_ORDER.includes(s[i] as never); i++) {
    if (s[i] === '⌃') p.ctrl = true;
    else if (s[i] === '⌥') p.alt = true;
    else if (s[i] === '⇧') p.shift = true;
    else p.meta = true;
  }
  p.key = s.slice(i);
  return p.key ? p : null;
}
/** Modifiers in the order macOS shows them: ⌃⌥⇧⌘. */
export const normPress = (s: string) => {
  const p = parsePress(s);
  return p ? pressText(p) : s;
};
export const pressesOf = (binding: string) => binding.split(' ').filter(Boolean);
export const isChord = (binding: string) => pressesOf(binding).length > 1;

/** «Аккорд: ⌃C, затем S». */
export const chordNote = (binding: string) => `Аккорд: ${pressesOf(binding).join(', затем ')}`;

// ---- the menu bar and the system: Tauri accelerators («Shift+CmdOrCtrl+KeyO») -------------------------------

export function toAccelerator(binding: string): string | undefined {
  if (!binding || isChord(binding)) return undefined; // macOS menus show no chords: the app handles them
  const p = parsePress(binding);
  if (!p) return undefined;
  const code = /^[A-Z]$/.test(p.key) ? 'Key' + p.key : /^[0-9]$/.test(p.key) ? 'Digit' + p.key : /^F\d+$/.test(p.key) ? p.key : CODE_OF[p.key];
  if (!code) return undefined;
  return [p.ctrl && 'Control', p.alt && 'Alt', p.shift && 'Shift', p.meta && 'CmdOrCtrl', code].filter(Boolean).join('+');
}
export function fromAccelerator(acc: string): string {
  if (!acc) return '';
  const parts = acc.split('+');
  const key = parts.pop()!;
  const mods = new Set(parts.map((m) => m.toLowerCase()));
  const name =
    keyName(key) ?? (/^[a-z0-9]$/i.test(key) ? key.toUpperCase() : key === 'Comma' ? ',' : key);
  return pressText({
    ctrl: mods.has('control') || mods.has('ctrl'),
    alt: mods.has('alt') || mods.has('option'),
    shift: mods.has('shift'),
    meta: mods.has('cmdorctrl') || mods.has('cmd') || mods.has('command') || mods.has('super') || mods.has('meta'),
    key: name,
  });
}

// ---- what may be recorded ---------------------------------------------------------------------------------------

/** Taken by macOS: the app never gets them, or must not take them. */
const SYSTEM = new Set(['⌘Q', '⌘H', '⌥⌘H', '⌘M', '⌘⇥', '⇧⌘⇥', '⌘Space', '⌃Space', '⌥⌘Space', '⌃↑', '⌃↓', '⌃←', '⌃→', '⌘`', '⇧⌘3', '⇧⌘4', '⇧⌘5', '⌃⌘Q', '⌃⌘F', '⌥⌘⎋', '⌘C', '⌘X', '⌘V', '⌘Z', '⇧⌘Z', '⌘A']);
export const isSystem = (press: string) => SYSTEM.has(normPress(press));

/**
 * Can this press be the (first) press of a shortcut of this scope? null if yes, else why not.
 * Any key with ⌘ ⌥ or ⌃ (and ⇧ with them); F1–F12 alone; in the editor also ⇧ + arrows, Tab and ⇧Tab.
 * ⇧ + a letter alone is typing.
 */
export function refusal(press: string, scope: Scope): string | null {
  const p = parsePress(press);
  if (!p) return 'Нажмите клавишу';
  if (isSystem(press)) return 'Это сочетание занято macOS';
  if (scope === 'global' && !(p.meta || p.ctrl || p.alt)) return 'Нужна хотя бы одна из клавиш ⌘, ⌃ или ⌥';
  if (p.meta || p.ctrl || p.alt) return null;
  if (/^F\d+$/.test(p.key)) return null;
  // a list of tasks (ТЗ 34): nothing is typed there, so ↩, ⎋ and ⇧ + arrows are free
  if (scope === 'list' && (p.key === '↩' || p.key === '⎋' || (p.shift && ['←', '→', '↑', '↓'].includes(p.key)))) return null;
  const editor = scope === 'editor' || scope === 'heading';
  if (editor && (p.key === '⇥' || (p.shift && ['←', '→', '↑', '↓'].includes(p.key)))) return null;
  return editor ? 'Нужна ⌘, ⌥ или ⌃ (в редакторе ещё ⇧ + стрелка, Tab или ⇧Tab)' : 'Нужна хотя бы одна из клавиш ⌘, ⌥ или ⌃';
}

// ---- the user's set and changes -------------------------------------------------------------------------------

export interface KeyState {
  preset: Preset;
  overrides: Record<string, string[]>; // id → its shortcuts; [] = none
}
export const DEFAULT_STATE: KeyState = { preset: 'emacs', overrides: {} };

export function defaultsOf(c: KeyCommand, preset: Preset): string[] {
  return (preset === 'emacs' ? c.emacs : c.mac) ?? c.keys ?? [];
}
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Every command's shortcuts now. */
export function bindingsOf(s: KeyState): Map<string, string[]> {
  return new Map(KEY_COMMANDS.map((c) => [c.id, s.overrides[c.id] ?? defaultsOf(c, s.preset)]));
}
export const isModified = (s: KeyState, id: string) => {
  const c = commandById.get(id);
  return !!c && !!s.overrides[id] && !same(s.overrides[id], defaultsOf(c, s.preset));
};
export const modifiedCount = (s: KeyState) => KEY_COMMANDS.filter((c) => isModified(s, c.id)).length;

/** The command's shortcuts set to `keys`; equal to the default of the set → no override kept. */
export function withKeys(s: KeyState, id: string, keys: string[]): KeyState {
  const c = commandById.get(id);
  if (!c) return s;
  const overrides = { ...s.overrides };
  const list = [...new Set(keys.filter(Boolean))];
  if (same(list, defaultsOf(c, s.preset))) delete overrides[id];
  else overrides[id] = list;
  return { ...s, overrides };
}
/** Commands renamed (features became plugins: the goals «quarter-goals», ТЗ 27; the Inbox «inbox», ТЗ 28; the
 *  calendar «calendar», ТЗ 29): a changed shortcut follows. */
const RENAMED: Record<string, string> = {
  navGoals: 'quarter-goals.nav', newGoal: 'quarter-goals.new', goalsOverview: 'quarter-goals.overview',
  goalMark: 'quarter-goals.mark', goalDone: 'quarter-goals.done', goalShift: 'quarter-goals.shift',
  goalBack: 'quarter-goals.back', goalNext: 'quarter-goals.next',
  // and the Inbox and its review the plugin «inbox» (ТЗ 28)
  navInbox: 'inbox.nav', review: 'inbox.review', reviewDone: 'inbox.done', reviewCancel: 'inbox.cancel', reviewMove: 'inbox.move',
  reviewDefer: 'inbox.defer', reviewSkip: 'inbox.skip', reviewBack: 'inbox.back', reviewCalendar: 'inbox.calendar',
  // and the calendar the plugin «calendar» (ТЗ 29)
  navCalendar: 'calendar.nav', calendar: 'calendar.open',
};
export function parseState(raw: string | null): KeyState {
  try {
    const v = JSON.parse(raw ?? '');
    const preset: Preset = v?.preset === 'mac' ? 'mac' : 'emacs';
    const overrides: Record<string, string[]> = {};
    for (const [old, keys] of Object.entries(v?.overrides ?? {})) {
      const id = RENAMED[old] ?? old;
      // a plugin's command («hello.greet») is kept while the plugin is off: its keys come back with it
      if ((commandById.has(id) || id.includes('.')) && Array.isArray(keys)) overrides[id] = keys.filter((k): k is string => typeof k === 'string').map((k) => pressesOf(k).map(normPress).join(' '));
    }
    return { preset, overrides };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

// ---- clashes ----------------------------------------------------------------------------------------------------

/** Scopes where one is inside the other: the inner one wins there, the outer one works elsewhere (features add theirs). */
const NESTED: string[][] = [['heading', 'editor']];
export const nested = (a: Scope, b: Scope) => NESTED.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
/** The same shortcut, or one is the first press of the other's chord. */
export const clash = (a: string, b: string) => a === b || b.startsWith(a + ' ') || a.startsWith(b + ' ');

export interface Conflict {
  id: string;
  key: string;
}
/** Commands that would clash with `key` given to `id`: same or overlapping scopes, not nested. */
export function conflictsOf(bindings: Map<string, string[]>, id: string, key: string): Conflict[] {
  const me = commandById.get(id);
  if (!me) return [];
  const out: Conflict[] = [];
  for (const c of KEY_COMMANDS) {
    if (c.id === id || nested(me.scope, c.scope) || (me.scope !== c.scope && SCOPES.get(me.scope)?.alone && SCOPES.get(c.scope)?.alone)) continue;
    for (const k of bindings.get(c.id) ?? []) if (clash(key, k)) out.push({ id: c.id, key: k });
  }
  return out;
}
/** «Вне разбора ⌘1 — „Заметки“»: the same key in the outer scope of a nested pair. */
export function outerNote(bindings: Map<string, string[]>, id: string): string {
  const me = commandById.get(id);
  const spec = me && (me.scope === 'heading' ? { scopes: ['editor'], word: 'Вне заголовка' } : SCOPES.get(me.scope)?.outside);
  if (!me || !spec) return '';
  for (const k of bindings.get(id) ?? []) {
    const other = KEY_COMMANDS.find((c) => spec.scopes.includes(c.scope) && (bindings.get(c.id) ?? []).includes(k));
    if (other) return `${spec.word} ${k} — «${other.title}»`;
  }
  return '';
}

// ---- search ----------------------------------------------------------------------------------------------------

const lower = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
const WORDS: [RegExp, string][] = [
  [/\b(cmd|command)\b/g, '⌘'],
  [/\b(ctrl|control|ctl)\b/g, '⌃'],
  [/\b(alt|opt|option)\b/g, '⌥'],
  [/\bshift\b/g, '⇧'],
];
/** A typed shortcut («⌘G», «cmd g», «ctrl+c s») as it is kept, or null if the query is not one. */
export function queryKeys(q: string): string | null {
  let s = q.trim().toLowerCase();
  if (!s) return null;
  const hadWord = WORDS.some(([re]) => re.test(s));
  for (const [re, sym] of WORDS) s = s.replace(re, sym);
  if (!/[⌘⌃⌥⇧]/.test(s) && !hadWord && !/^f\d+$/.test(s)) return null;
  // presses: modifiers glue to the next key; «+», «-» and spaces separate
  const presses: string[] = [];
  let mods = '';
  for (const tok of s.split(/[\s+]+/).filter(Boolean)) {
    for (const ch of tok) {
      if ('⌘⌃⌥⇧'.includes(ch)) mods += ch;
      else {
        const rest = tok.slice(tok.indexOf(ch));
        presses.push(normPress(mods + (/^f\d+$/.test(rest) ? rest.toUpperCase() : rest.toUpperCase())));
        mods = '';
        break;
      }
    }
  }
  return presses.length ? presses.join(' ') : mods ? normPress(mods) : null;
}
/** Does the command show for this query: by its title and synonyms, or by a shortcut it has. */
export function matchesQuery(c: KeyCommand, keys: string[], q: string): boolean {
  const t = q.trim();
  if (!t) return true;
  const k = queryKeys(t);
  if (k && keys.some((x) => x.startsWith(k))) return true;
  const words = lower(t).split(/\s+/);
  const hay = lower([c.title, ...(c.synonyms ?? [])].join(' '));
  return words.every((w) => hay.includes(w));
}
