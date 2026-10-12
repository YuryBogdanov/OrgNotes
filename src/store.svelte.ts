import {
  activeTab, addPane, closePane, closeTab, dropMissing, emptyLayout, focusPane, keepOne, mapPaths, newTab, openAgenda,
  openFile, openFromAgenda, restore, serialize, splitRight, swap, toggleSecond, copyTab, type Layout, type Tab,
  newUntitled, moveTab, duplicateTab, othersOf, targetOf, UNTITLED, openGoals,
} from './layout';
import { mapperFor, resolveLink, rewriteFileLinks, type OrgLink } from './links';
import { displayName, noteName, withOrg } from './names';
import { appendTask, setPlanning, setTags, weekdayNames } from './edits';
import { bareTitle, caretAfter, keyOf, moveTo, moveWithin } from './refile';
import type { CalSpec, Plate } from './commands';
import { searchFile, type Hit, type Scope } from './search';
import { closingStatus, locate, nextOpen, reviewQueue, short, type Result, type ReviewItem } from './review';
import { DEFAULT_LEVELS, type LevelView } from './orgIndent';
import { DEFAULT_INBOX, append, entry, inboxItems, prepend, readInbox, remove, withInbox, type InboxConfig, type InboxItem } from './inbox';
import { cloneAgenda, newAgenda, readAgendas, sameAgenda, withAgendas, type Agenda } from './agendas';
import {
  GOALS_WORKFLOW, addSourceHeading, avatarColor, initials, insertGoal, quarterOf, readGoals, readSource, sourceKey, withGoals,
  addMark, findGoal, shiftQuarter, goalsIn, moveGoal, reviewQueue as goalQueue, shortDay, GOAL_STATES, quarterLabel,
  carryOver, readGoalSettings, withGoalSettings, isSilent, deadlineSoon, isDone, DEFAULT_GOAL_SETTINGS, type GoalSettings, type Goal,
  type GoalSource, type NewGoal, type Quarter, type SourceGoals,
} from './goals';
import { bindingsOf, fromAccelerator, parseState, toAccelerator, withKeys, DEFAULT_STATE, type KeyState, type Preset } from './keys';
import { DEFAULT_SEQUENCE, EMPTY_CONFIG, firstDone, headingAt, joinEol, parseHeadings, parseProjectConfig, resolveWorkflow, setKeyword, setPriority, sequenceFor, splitEol, startOf, type Eol, type Heading, type ProjectConfig, type Workflow } from './org';

export interface NoteFile {
  name: string; // relative path inside the notes folder
  path: string;
  text: string; // current (possibly edited) text
  disk: string; // same, as last read from / written to disk (LF-normalised)
  diskRaw: string; // exactly what is on disk (original line endings)
  eol: Eol; // line ending style of the file, restored on save
  wf: Workflow;
  headings: Heading[];
  filetags: string[];
}

const isTauri = '__TAURI_INTERNALS__' in window;

function build(name: string, path: string, text: string, disk: string, diskRaw: string, eol: Eol, cfg: ProjectConfig): NoteFile {
  const wf = resolveWorkflow(text, name, cfg);
  const ft = /^#\+FILETAGS:\s*(.+)$/m.exec(text);
  return {
    name, path, text, disk, diskRaw, eol, wf,
    headings: parseHeadings(text, wf),
    filetags: ft ? ft[1].split(':').map((s) => s.trim()).filter(Boolean) : [],
  };
}

/** Where the palette opens: a step of a command at once (the card's buttons in «Разбор Inbox» use the heading ones). */
export type PaletteStart = 'newFile' | 'newFolder' | 'goto' | 'status' | 'priority' | 'schedule' | 'deadline' | 'tags' | 'calendar';
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
function readLevels(): LevelView {
  try {
    const v = JSON.parse(lsGet('editor:levels') ?? 'null');
    if (v && typeof v === 'object') {
      return {
        oneStar: typeof v.oneStar === 'boolean' ? v.oneStar : DEFAULT_LEVELS.oneStar,
        indent: typeof v.indent === 'boolean' ? v.indent : DEFAULT_LEVELS.indent,
        step: Number.isInteger(v.step) && v.step >= 1 && v.step <= 4 ? v.step : DEFAULT_LEVELS.step,
      };
    }
  } catch {
    /* unreadable: the defaults */
  }
  return { ...DEFAULT_LEVELS };
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

async function openExternal(url: string) {
  if (isTauri) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank');
  }
}

type Listed = { name: string; path: string; text: string; mtime?: number };

function fromDisk(l: Listed, cfg: ProjectConfig): NoteFile {
  const { text, eol } = splitEol(l.text);
  return build(l.name, l.path, text, text, l.text, eol, cfg);
}

class Store {
  files = $state.raw<NoteFile[]>([]);
  folders = $state.raw<string[]>([]); // relative paths of all sub-folders, including empty ones
  config = $state.raw<ProjectConfig>(EMPTY_CONFIG); // <notes>/.orgnotes/config.json
  private configRaw: string | null = null;
  settingsOpen = $state(false);
  /** The section of the settings shown; the last one is shown next time (a preference of this Mac). */
  settingsSection = $state<SettingsSection>(SECTIONS.includes(lsGet('settings:section') as SettingsSection) ? (lsGet('settings:section') as SettingsSection) : 'Основные');
  get configText() {
    return this.configRaw;
  }
  creating = $state<{ dir: string; kind: 'file' | 'folder' } | null>(null); // inline "new" row in the navigator
  renaming = $state<string | null>(null); // relative path of the entry being renamed inline
  dialog = $state<{ type: 'delete' | 'move'; rel: string; isDir: boolean } | null>(null);
  /** Editor panes and their tabs; see layout.ts. */
  layout = $state<Layout>(emptyLayout());
  /** Sheets the page shows on request: "Сохранить как…" and the question about unsaved text. */
  saveAsReq = $state<{ tab: Tab; resolve: (saved: boolean) => void } | null>(null);
  /** The close sheet: what closing would lose (one file, one new note, or several tabs). */
  unsavedReq = $state<{ items: Unsaved[]; resolve: (answer: 'save' | 'discard' | 'cancel') => void } | null>(null);
  // ---- the file changed on disk (ТЗ «Файл изменился на диске») ----
  /** Files whose disk version changed under unsaved edits: the tab keeps its text until the user picks a version. */
  conflicts = $state.raw<Record<string, Conflict>>({});
  /** Files gone from disk while open: they stay in their tabs (not in the navigator) until closed or saved again. */
  orphans = $state.raw<Record<string, NoteFile>>({});
  /** Orphans with edits the user was already asked about ("Оставить открытой", Esc). */
  private orphanAsked = new Set<string>();
  /** When each file was last edited here (shown as «Моя версия»). */
  private edited: Record<string, number> = {};
  /** Bumped when a file is silently reloaded from disk: its editor drops the undo history. */
  diskGen = $state.raw<Record<string, number>>({});
  /** The sheet about a changed or deleted file. */
  diskReq = $state<{ kind: 'changed' | 'deleted'; path: string; resolve: (a: DiskAnswer) => void } | null>(null);
  /** «work» обновлён с диска — a status line at the bottom of the editor for 4 s. */
  toast = $state<{ text: string; n: number; actions?: { label: string; run: () => void }[] } | null>(null);
  /** A short note at the bottom (with buttons, e.g. «Открыть», «Отменить»); it goes after a few seconds. */
  note(text: string, actions?: { label: string; run: () => void }[], ms = 4000) {
    this.toastNames = [];
    this.toast = { text, n: Date.now(), actions };
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), ms);
  }
  private toastNames: string[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  /** The window is in front: disk questions wait for it. */
  appActive = $state(typeof document === 'undefined' || document.hasFocus());

  /** A write failed while closing: the reason, with a single "ОК". */
  errorReq = $state<{ title: string; text: string; resolve: () => void } | null>(null);
  /** While a sheet is up the rest of the window does not react: no shortcuts, no menu commands. */
  get sheetOpen() {
    return !!(this.unsavedReq || this.saveAsReq || this.errorReq || this.palette || this.diskReq || this.builder || this.capture || this.refile || this.pickInbox || this.settingsOpen || this.goalForm || this.goalAdd || this.goalReport || this.goalCarry);
  }
  /** The command palette; `start` opens it right at a step ("Создать файл…" ⇧⌘N, "Перейти к файлу…" ⇧⌘O). */
  palette = $state<{ start?: PaletteStart; n: number } | null>(null);
  openPalette(start?: PaletteStart) {
    if (this.unsavedReq || this.saveAsReq || this.errorReq) return;
    this.palette = { start, n: Date.now() };
  }
  /** The calendar opened on its own (the review's «Отложить», a date chip): what it is for and where it writes. */
  calReq: (CalSpec & { plate?: Plate }) | null = null;
  openCalendar(spec: CalSpec & { plate?: Plate }) {
    this.calReq = spec;
    this.openPalette('calendar');
  }
  /** ⇧⌘P: opens, or closes an open palette. */
  togglePalette() {
    if (this.palette) this.palette = null;
    else this.openPalette();
  }
  /** "Показать в навигаторе": expand to this file and mark it for a moment. */
  navReveal = $state<{ path: string; n: number } | null>(null);
  showNav = $state(true);
  showInspector = $state(true);
  /** "Показывать заголовки в навигаторе" (Настройки → Основные): a view preference of this Mac, off by default. */
  navHeadings = $state(lsGet('nav:headings') === '1');
  setNavHeadings(on: boolean) {
    this.navHeadings = on;
    lsSet('nav:headings', on ? '1' : '0'); // the main window hears it through the storage event
  }
  /** «Уровни заголовков» (Настройки → Основные, a view preference of this Mac): one star per level, text by level. */
  levels = $state<LevelView>(readLevels());
  /** «Оформленный текст»: the editor draws the file like org-modern; with it, its line numbers (this Mac). */
  rich = $state(lsGet('editor:rich') === '1');
  richNumbers = $state(lsGet('editor:richNumbers') === '1');
  setRich(on: boolean) {
    this.rich = on;
    lsSet('editor:rich', on ? '1' : '0'); // the other window hears it through the storage event
  }
  setRichNumbers(on: boolean) {
    this.richNumbers = on;
    lsSet('editor:richNumbers', on ? '1' : '0');
  }
  /** Drawers folded when a file opens and when the app adds one (a preference of this Mac). */
  foldDrawers = $state(lsGet('editor:drawers') !== '0');
  setFoldDrawers(on: boolean) {
    this.foldDrawers = on;
    lsSet('editor:drawers', on ? '1' : '0'); // the other window hears it through the storage event
  }
  setLevels(l: Partial<LevelView>) {
    this.levels = { ...this.levels, ...l, step: Math.max(1, Math.min(4, Math.round(l.step ?? this.levels.step))) };
    lsSet('editor:levels', JSON.stringify(this.levels)); // the other window hears it through the storage event
  }
  /** «Вид › Структурный вид»: both switches on or off at once, to see the file as it is without the settings. */
  toggleStructure() {
    const on = !(this.levels.oneStar || this.levels.indent);
    this.setLevels({ oneStar: on, indent: on });
  }
  /** The inspector's tab, remembered for the window. */
  inspectorTab = $state<'task' | 'outline'>(lsGet('inspector:tab') === 'outline' ? 'outline' : 'task');
  setInspectorTab(t: 'task' | 'outline') {
    this.inspectorTab = t;
    lsSet('inspector:tab', t);
  }
  /** Where the caret was last in each file (any tab): a file opened from the path bar goes back there. */
  private lastCursor: Record<string, { line: number; col: number }> = {};
  /**
   * A file picked in the path bar: in the active pane (⌥↩: the neighbour pane, made if there is none). A tab that
   * already shows it is reused — in another pane too, which becomes active; the active file tab is retargeted as
   * from the navigator, unless it holds unsaved text: then the file opens in a new tab. The editor gets the focus.
   */
  openFromJump(path: string, other: boolean) {
    const L = this.layout;
    const at = this.lastCursor[path] ?? { line: 0, col: 1 };
    const focus = (pi: number, ti: number) => {
      L.active = pi;
      L.panes[pi].active = ti;
      const t = L.panes[pi].tabs[ti];
      t.reveal = { line: t.cursor.line, n: Date.now(), focus: true, col: Math.max(0, t.cursor.col - 1) };
    };
    if (other && L.panes.length < 2) {
      const t = newTab('file', path, at.line, true);
      t.cursor = { ...at };
      t.reveal = { line: at.line, n: Date.now(), focus: true, col: Math.max(0, at.col - 1) };
      L.active = addPane(L, 'right', t);
      return;
    }
    const pi = other ? 1 - L.active : L.active;
    const find = (p: number) => L.panes[p]?.tabs.findIndex((t) => t.kind === 'file' && t.path === path) ?? -1;
    if (find(pi) >= 0) return focus(pi, find(pi));
    const elsewhere = L.panes.findIndex((_, i) => i !== pi && find(i) >= 0);
    if (!other && elsewhere >= 0) return focus(elsewhere, find(elsewhere));
    const cur = L.panes[pi].tabs[L.panes[pi].active];
    const t = openFile(L, pi, path, at.line, { replace: !(cur && this.isUnsaved(cur)), focus: true });
    t.cursor = { ...at };
    t.reveal = { line: at.line, n: Date.now(), focus: true, col: Math.max(0, at.col - 1) };
    L.active = pi;
  }
  /** ⌃⌘J: the path bar takes the keyboard (the bar listens to this). */
  jumpReq = $state(0);

  /** "Показать структуру файла": the inspector with its outline. */
  showOutline() {
    this.showInspector = true;
    this.setInspectorTab('outline');
  }
  /** Put the caret on a line of the active editor and scroll there; with `focus` the editor gets the keyboard. */
  revealLine(line: number, focus: boolean) {
    const t = this.tab;
    if (t?.kind !== 'file') return;
    t.reveal = { line, n: Date.now() + Math.random(), focus };
  }
  /** Full screen: the traffic lights are hidden until the pointer goes to the top of the screen (Rust watches them). */
  titlebar = $state({ fullscreen: false, lights: true, menu: 0 });
  navW = $state(248);
  inspW = $state(272);
  saveState = $state<'saved' | 'saving' | 'memory'>(isTauri ? 'saved' : 'memory');
  dir = $state<string | null>(null);
  needFolder = $state(false);
  /**
   * A start screen over the whole window (ТЗ «Первый запуск и рабочая папка»): «welcome» (no folder yet), «found»
   * (a folder picked, before «Открыть»; `scan` null while counting), «missing» (the remembered folder cannot be
   * opened). Null: the ordinary window.
   */
  start = $state<StartScreen>(null);
  /** The open folder went away while working: the tabs keep their text, the navigator says so. */
  folderGone = $state(false);
  hasSample = $state(false);
  loaded = $state(false);
  history = $state.raw<{ path: string; line: number }[]>([]);
  notice = $state('');
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private saving = 0; // saves in flight
  private writes = 0; // bumped after every successful write: a snapshot of the disk taken across a bump may be stale
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  /** The tab with the keyboard: the active tab of the active pane. */
  get tab(): Tab | undefined {
    return activeTab(this.layout);
  }
  /** Path of the file in the active tab ('' when the active tab is not a file). */
  get curPath(): string {
    const t = this.tab;
    return t?.kind === 'file' ? (t.path ?? '') : '';
  }
  get cur(): number {
    const t = this.tab;
    const path = t?.kind === 'review' || t?.kind === 'goalReview' ? (t.path ?? '') : this.curPath; // a review: the card's file
    return this.files.findIndex((f) => f.path === path);
  }
  get file(): NoteFile | undefined {
    return this.files[this.cur] ?? this.orphans[this.curPath];
  }
  get mode(): 'notes' | 'agenda' {
    return this.tab?.kind === 'agenda' ? 'agenda' : 'notes';
  }
  get cursor() {
    return this.tab?.cursor ?? { line: 0, col: 0 };
  }
  get selected(): number {
    const f = this.file;
    return f ? headingAt(f.headings, this.cursor.line) : -1;
  }
  fileOf(t: Tab | undefined): NoteFile | undefined {
    return t?.kind === 'file' ? (this.files.find((f) => f.path === t.path) ?? this.orphans[t.path ?? '']) : undefined;
  }

  /** A failed "Сохранить как…", shown in the bar of the new notes (other messages are about files). */
  draftNotice = $state('');
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  sayDraft(msg: string) {
    this.draftNotice = msg;
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => (this.draftNotice = ''), 6000);
  }
  say(msg: string) {
    this.notice = msg;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = ''), 6000);
  }

  private async listFiles(): Promise<Listed[]> {
    if (isTauri) return invoke<Listed[]>('list_org_files');
    // browser fallback (dev only): bundled sample notes, edits stay in memory
    if (!import.meta.env.DEV) return [];
    const { bundledNotes } = await import('./fallbackNotes');
    return Object.entries(bundledNotes).map(([k, text]) => ({ name: k.replace('../sample-notes/', ''), path: k, text }));
  }

  private async readConfig(): Promise<string | null> {
    if (isTauri) return invoke<string | null>('read_project_config');
    // browser fallback (dev only): the bundled sample project's config
    if (!import.meta.env.DEV) return null;
    const { bundledConfig } = await import('./fallbackNotes');
    return Object.values(bundledConfig)[0] ?? null;
  }

  /** Parse the project config text; reports problems. Returns true when the effective config changed. */
  private takeConfig(raw: string | null): boolean {
    if (raw === this.configRaw) return false;
    this.configRaw = raw;
    const { config, warnings } = raw ? parseProjectConfig(raw) : { config: EMPTY_CONFIG, warnings: [] as string[] };
    let parsed: any = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      /* reported by parseProjectConfig */
    }
    this.agendas = readAgendas(parsed?.agendas); // a tab of a deleted agenda shows the built-in one
    this.inboxCfg = readInbox(parsed?.inbox);
    this.goalSources = readGoals(parsed?.goals);
    this.goalSettings = readGoalSettings(parsed?.goalSettings);
    // only the statuses make the notes be read again; agendas alone do not
    const same = JSON.stringify(config) === JSON.stringify(this.config);
    this.config = config;
    if (warnings.length) this.say('.orgnotes/config.json: ' + warnings[0] + (warnings.length > 1 ? ` (и ещё ${warnings.length - 1})` : ''));
    return !same;
  }

  /** Re-parse every note with the current project config (unsaved edits stay). */
  private rebuildAll() {
    const cfg = this.config;
    this.files = this.files.map((f) => build(f.name, f.path, f.text, f.disk, f.diskRaw, f.eol, cfg));
  }

  /** How many headings carry this keyword, across all notes. */
  keywordUsage(keyword: string): number {
    let n = 0;
    for (const f of this.files) for (const h of f.headings) if (h.keyword === keyword) n++;
    return n;
  }

  /** Replace the status word `from` with `to` on every heading that has it. Returns the number of headings changed. */
  renameKeywordInFiles(from: string, to: string): number {
    let total = 0;
    for (const f of this.files) {
      const lines = f.text.split('\n');
      let changed = 0;
      for (const h of f.headings) {
        if (h.keyword !== from) continue;
        const m = /^(\*+\s+)(\S+)(.*)$/.exec(lines[h.line]);
        if (m && m[2] === from) {
          lines[h.line] = m[1] + to + m[3];
          changed++;
        }
      }
      if (changed) {
        this.setText(lines.join('\n'), f.path);
        total += changed;
      }
    }
    return total;
  }

  /**
   * ⌘,: the settings as a sheet over the main window (the same as the agenda builder), at `section` or the last one
   * shown. Again ⌘, closes them. One sheet at a time: with another one up nothing happens.
   */
  openSettings(section?: SettingsSection) {
    if (this.settingsOpen && !section) {
      this.closeSettings();
      return;
    }
    if (this.sheetOpen && !this.settingsOpen) return;
    if (section) this.showSection(section);
    this.settingsOpen = true;
  }
  closeSettings() {
    this.settingsOpen = false;
    this.keyRecording = false;
  }
  showSection(section: SettingsSection) {
    this.settingsSection = section;
    lsSet('settings:section', section);
  }

  // ---- keyboard shortcuts (ТЗ «раздел „Клавиши“»): a set of defaults and the changes on top, on this Mac ----------
  keyState = $state<KeyState>(parseState(lsGet('keys')));
  /** Every command's shortcuts now; the quick entry's is its own setting (it is registered with the system). */
  bindings = $derived.by(() => {
    const b = bindingsOf(this.keyState);
    b.set('capture', this.captureKey ? [fromAccelerator(this.captureKey)] : []);
    return b;
  });
  /** A shortcut is being recorded in the settings: the window's keys wait. */
  keyRecording = $state(false);
  /** «Навигатор: свернуть / развернуть всё» from the palette or a key: the tree of «Файлы» does it. */
  navTreeReq = $state<{ kind: 'collapse' | 'expand'; n: number } | null>(null);
  navTree(kind: 'collapse' | 'expand') {
    this.showNav = true;
    this.setNavMode('files');
    this.navTreeReq = { kind, n: Date.now() };
  }
  /** The first shortcut of a command, for tooltips and hints («⇧⌘O»); '' if it has none. */
  keyHint(id: string) {
    return this.bindings.get(id)?.[0] ?? '';
  }
  /** «Найти далее (⌘G)», or the title alone. */
  titled(title: string, id: string) {
    const k = this.keyHint(id);
    return k ? `${title} (${k})` : title;
  }
  /** Give a command these shortcuts; the quick entry's goes to the system (an error says why it could not). */
  async setKeys(id: string, keys: string[]): Promise<string | null> {
    if (id === 'capture') return this.setCaptureKey(keys[0] ? (toAccelerator(keys[0]) ?? '') : '', this.captureGlobal);
    this.keyState = withKeys(this.keyState, id, keys);
    this.saveKeys();
    return null;
  }
  setPreset(preset: Preset) {
    this.keyState = { ...this.keyState, preset };
    this.saveKeys();
  }
  /** «Сбросить все»: the defaults of the set, the quick entry's ⇧⌘I too. */
  async resetKeys() {
    this.keyState = { ...DEFAULT_STATE, preset: this.keyState.preset };
    this.saveKeys();
    if (this.captureKey !== DEFAULT_CAPTURE_KEY) await this.setCaptureKey(DEFAULT_CAPTURE_KEY, this.captureGlobal);
  }
  private saveKeys() {
    lsSet('keys', JSON.stringify(this.keyState));
  }
  /** The review of goals registers its keys while its tab is shown. */
  goalReviewKeys: { active: () => boolean; run: (id: string) => boolean } | null = null;
  /** The review registers its keys while its tab is shown (⌘1…⌘5 there win over the window's). */
  reviewKeys: { active: () => boolean; run: (id: string) => boolean } | null = null;

  /** Persist the project config (Settings) and apply it right away. */
  async saveConfig(json: string): Promise<boolean> {
    try {
      if (isTauri) await invoke('write_project_config', { text: json });
      if (this.takeConfig(json)) this.rebuildAll();
      return true;
    } catch (e) {
      this.say('Не удалось сохранить настройки: ' + e);
      return false;
    }
  }
  /**
   * Change the project config from its newest text on disk: statuses and agendas are written at different times,
   * and neither may drop what the other just wrote (nor what was written by hand meanwhile).
   */
  async updateConfig(make: (raw: string | null) => string): Promise<boolean> {
    let raw = this.configRaw;
    if (isTauri) {
      try {
        raw = await this.readConfig();
      } catch {
        /* keep what we have */
      }
    }
    return this.saveConfig(make(raw));
  }

  // ---- custom agendas («Мои агенды», `agendas` in config.json) -------------------------------------------------
  agendas = $state.raw<Agenda[]>([]);
  /** The custom agenda shown by the active tab (undefined: a file, or the built-in agenda). */
  get agenda(): Agenda | undefined {
    return this.agendaOf(this.tab);
  }
  agendaOf(t: Tab | undefined): Agenda | undefined {
    return t?.kind === 'agenda' && t.agenda ? this.agendas.find((a) => a.id === t.agenda) : undefined;
  }
  /** The left navigator: the files, or the list of agendas. A setting of the window: switching tabs or panes keeps it. */
  navMode = $state<NavMode>((['files', 'inbox', 'agendas', 'goals', 'search'] as const).find((m) => m === lsGet('nav:mode')) ?? 'files');
  setNavMode(m: NavMode) {
    this.navMode = m;
    this.showNav = true;
    lsSet('nav:mode', m);
  }
  /**
   * An agenda picked in the list opens in the active pane: the agenda tab there shows it now; from a file tab,
   * a tab that already shows it is reused, else a new agenda tab comes.
   */
  openAgendaHere(id: string) {
    const L = this.layout;
    const p = L.panes[L.active];
    if (!p) return;
    const cur = p.tabs[p.active];
    if (cur?.kind === 'agenda') {
      cur.agenda = id || undefined;
    } else {
      const i = p.tabs.findIndex((t) => t.kind === 'agenda' && (t.agenda ?? '') === id);
      if (i >= 0) p.active = i;
      else {
        const t = newTab('agenda');
        if (id) t.agenda = id;
        const at = p.tabs.length ? p.active + 1 : 0;
        p.tabs.splice(at, 0, t);
        p.active = at;
      }
    }
    this.persistLayout();
  }
  // ---- Inbox (`inbox` in config.json: the file and how it works; every change goes to disk at once) -----------
  inboxCfg = $state.raw<InboxConfig>(DEFAULT_INBOX);
  get inboxFile(): NoteFile | undefined {
    const f = this.inboxCfg.file;
    return f ? this.files.find((x) => x.name === f) : undefined;
  }
  /** The unsorted tasks of the Inbox file. */
  get inboxList(): InboxItem[] {
    const f = this.inboxFile;
    return f ? inboxItems(f.text, f.headings, f.wf, this.inboxCfg.order) : [];
  }
  async setInbox(c: Partial<InboxConfig>) {
    const next = { ...this.inboxCfg, ...c };
    await this.updateConfig((raw) => withInbox(raw, { ...readInbox(this.inboxIn(raw)), ...c }));
    this.inboxCfg = next;
  }
  private inboxIn(raw: string | null) {
    try {
      return raw ? JSON.parse(raw)?.inbox : undefined;
    } catch {
      return undefined;
    }
  }
  /** «Создать inbox.org в рабочей папке»: an empty file in the root, set as the Inbox at once (an existing one is
   *  simply taken). */
  async createInboxFile() {
    if (!this.files.some((f) => f.name === 'inbox.org')) {
      try {
        await this.flush();
        if (isTauri) await invoke<string>('create_entry', { parent: this.abs(''), name: 'inbox.org', isDir: false });
        await this.reload();
      } catch (e) {
        if (!String(e).includes('exist')) return this.say('Не удалось создать inbox.org: ' + e);
      }
    }
    await this.setInbox({ file: 'inbox.org' });
  }
  /** Write a file now (not after the autosave pause): unsaved edits of its tab go along. Null, or why it failed. */
  async writeNow(path: string, text: string): Promise<string | null> {
    this.setText(text, path);
    clearTimeout(this.timers.get(path));
    this.timers.delete(path);
    if (!isTauri) return null;
    return this.save(path);
  }
  /** What the Inbox actions changed in this session, for ⌘Z in the list: each step is one or two files. */
  private inboxUndo: { path: string; before: string; after: string }[][] = [];
  /** Write files one by one, at once; the step to take it back, or null (and why, said) when a write failed. */
  private async writeSteps(steps: { path: string; text: string }[]): Promise<{ path: string; before: string; after: string }[] | null> {
    const done: { path: string; before: string; after: string }[] = [];
    for (const st of steps) {
      const f = this.files.find((x) => x.path === st.path);
      if (!f) return null;
      const before = f.text;
      const err = await this.writeNow(st.path, st.text);
      if (err) {
        this.say('Не удалось записать «' + displayName(f.name) + '»: ' + err);
        return null; // what was written before stays (a move writes the target first: nothing is lost)
      }
      done.push({ path: st.path, before, after: st.text });
    }
    return done;
  }
  private async inboxWrite(steps: { path: string; text: string }[]): Promise<boolean> {
    const done = await this.writeSteps(steps);
    if (done) this.inboxUndo.push(done);
    return !!done;
  }
  /** Take a step back, if its files were not changed since. */
  private async undoStep(step: { path: string; before: string; after: string }[]): Promise<boolean> {
    for (const s of [...step].reverse()) {
      const f = this.files.find((x) => x.path === s.path);
      if (!f || f.text !== s.after) {
        this.say('Отменить нельзя: файл уже изменился');
        return false;
      }
    }
    for (const s of [...step].reverse()) await this.writeNow(s.path, s.before);
    return true;
  }
  /** ⌘Z in the Inbox list: the last action is taken back (if the files were not changed since). */
  async undoInbox(): Promise<boolean> {
    const step = this.inboxUndo.pop();
    if (!step) return false;
    if (await this.undoStep(step)) return true;
    this.inboxUndo.push(step);
    return false;
  }
  private inboxHeading(item: InboxItem): { f: NoteFile; h: Heading } | null {
    const f = this.inboxFile;
    const h = f?.headings.find((x) => x.line === item.line && x.title === item.title);
    return f && h ? { f, h } : null;
  }
  /** Quick entry: a task at the top or the end of the Inbox file (as set), on disk at once. */
  async addToInbox(title: string, details: string): Promise<'ok' | 'nofile' | 'empty' | 'error'> {
    if (!title.trim()) return 'empty';
    const f = this.inboxFile;
    if (!f) return 'nofile';
    const status = this.inboxCfg.status && f.wf.open.includes(this.inboxCfg.status) ? this.inboxCfg.status : startOf(sequenceFor(f.wf, null));
    const task = entry(title, details, status, this.inboxCfg.created ? new Date() : null);
    return (await this.inboxWrite([{ path: f.path, text: (this.inboxCfg.add === 'end' ? append : prepend)(f.text, task) }])) ? 'ok' : 'error';
  }
  async inboxDone(item: InboxItem) {
    const r = this.inboxHeading(item);
    if (!r) return;
    const kw = firstDone(sequenceFor(r.f.wf, r.h.keyword)) ?? r.f.wf.done[0];
    if (kw) await this.inboxWrite([{ path: r.f.path, text: setKeyword(r.f.text, r.h, kw, r.f.wf) }]);
  }
  async inboxDelete(item: InboxItem) {
    const r = this.inboxHeading(item);
    if (r) await this.inboxWrite([{ path: r.f.path, text: remove(r.f.text, r.h) }]);
  }
  async inboxDate(item: InboxItem, kind: 'SCHEDULED' | 'DEADLINE', date: Date | null) {
    const r = this.inboxHeading(item);
    if (r) await this.inboxWrite([{ path: r.f.path, text: setPlanning(r.f.text, r.h, kind, date) }]);
  }
  /** «Открыть»: the Inbox file in the editor, at the task. */
  openInboxItem(item: InboxItem) {
    const f = this.inboxFile;
    const i = f ? this.files.indexOf(f) : -1;
    if (i >= 0) this.open(i, item.line);
  }
  // ---- goals of the quarter (ТЗ 23) ----------------------------------------------------------------------------
  /** Where the goals are: a file and its level-1 heading (`goals` in config.json). */
  goalSources = $state.raw<GoalSource[]>([]);
  /** «Цели квартала» in «Настройки → Агенды»: when a goal «молчит», how early a deadline is lit. */
  goalSettings = $state.raw<GoalSettings>(DEFAULT_GOAL_SETTINGS);
  async setGoalSettings(c: Partial<GoalSettings>) {
    const next = { ...this.goalSettings, ...c };
    this.goalSettings = next;
    return this.updateConfig((raw) => withGoalSettings(raw, next));
  }
  goalSilent = (g: Goal) => isSilent(g, new Date(), this.goalSettings.silent);
  goalSoon = (g: Goal, done: string[]) => deadlineSoon(g, done, new Date(), this.goalSettings.soon);
  /** «Отчёт за квартал»: `key` the person shown first ('*' = everybody). */
  goalReport = $state<{ key: string; n: number } | null>(null);
  openGoalReport(key = '*') {
    if (this.sheetOpen) return;
    this.goalReport = { key, n: Date.now() };
  }
  /** «Перенести незакрытые»: the list to confirm, from `goalsQuarter` to the next one. */
  goalCarry = $state<{ key: string; n: number } | null>(null);
  openGoalCarry(key = '*') {
    if (this.sheetOpen && !this.goalReport) return;
    this.goalReport = null;
    this.goalCarry = { key, n: Date.now() };
  }
  /** The open goals of the shown quarter: what «Перенести незакрытые» offers. */
  openGoalsOf(p: GoalPerson): Goal[] {
    const done = p.file?.wf.done ?? [];
    return goalsIn(p.data, this.goalsQuarter).filter((g) => !isDone(g, done));
  }
  /** Move the chosen open goals (titles per source) under the next quarter, one write per file. */
  async carryGoals(chosen: Map<string, string[]>): Promise<number> {
    const from = this.goalsQuarter;
    const to = shiftQuarter(from, 1);
    const steps: { path: string; text: string }[] = [];
    let n = 0;
    for (const [key, titles] of chosen) {
      const p = this.goalPeople.find((x) => x.key === key);
      const f = p?.file && this.files.find((x) => x.path === p.file!.path);
      if (!p || !f || !titles.length) continue;
      const r = carryOver(f.text, p.src.heading, from, to, titles, weekdayNames(f.text), (t) => parseHeadings(t, f.wf));
      if (r.moved.length) {
        steps.push({ path: f.path, text: r.text });
        n += r.moved.length;
      }
    }
    if (steps.length && !(await this.writeSteps(steps))) return 0;
    this.goalCarry = null;
    this.goalsQuarter = to;
    this.note(`Перенесено в ${quarterLabel(to)}: ${n}`);
    return n;
  }
  /** The quarter the goals views show (the same in the navigator, the overview and a person's view). */
  goalsQuarter = $state<Quarter>(quarterOf(new Date()));
  /** Each source with its file and what is under its heading now; «Мои цели» first. */
  goalPeople = $derived.by((): GoalPerson[] =>
    this.goalSources
      .map((src) => {
        const file = this.files.find((f) => f.name === src.file);
        const data: SourceGoals = file ? readSource(file.text, file.headings, src.heading) : { head: -1, quarters: [] };
        return { src, key: sourceKey(src), file, data, found: !!file && data.head >= 0, ini: initials(src.title, src.me), color: avatarColor(src.file), name: src.me ? 'Мои цели' : src.title };
      })
      .sort((a, b) => Number(!!b.src.me) - Number(!!a.src.me) || a.name.localeCompare(b.name, 'ru')),
  );
  /** «Цели»: the overview (`*`) or one person, in the goals tab of the active pane. */
  openGoals(key = '*') {
    openGoals(this.layout, this.layout.active, key);
  }
  /** Open the file of a source at its heading (a double click in the navigator). */
  openGoalFile(key: string, line?: number) {
    const p = this.goalPeople.find((x) => x.key === key);
    if (!p?.file) return;
    const i = this.files.indexOf(p.file);
    this.open(i, line ?? (p.data.head >= 0 ? p.file.headings[p.data.head].line : 0));
  }
  /** «Цели на квартал» in the project's statuses, if no set knows ACTIVE (with «Задачи» if there were none). */
  private withGoalsWorkflow(raw: string | null): string {
    let base: Record<string, any> = {};
    try {
      const p = raw ? JSON.parse(raw) : null;
      if (p && typeof p === 'object' && !Array.isArray(p)) base = p;
    } catch {
      /* replaced */
    }
    const wfs: any[] = Array.isArray(base.workflows) ? base.workflows : [];
    if (wfs.some((w) => Array.isArray(w?.states) && w.states.some((x: any) => x?.name === 'ACTIVE'))) return raw ?? JSON.stringify(base);
    const def = { name: DEFAULT_SEQUENCE.name, states: DEFAULT_SEQUENCE.states.map((x) => (x.done ? { name: x.name, done: true } : { name: x.name })) };
    return JSON.stringify({ version: base.version ?? 1, ...base, workflows: [...(wfs.length ? wfs : [def]), GOALS_WORKFLOW] }, null, 2) + '\n';
  }
  /** «Добавить цели»: a source (made in the file first if asked); «мои» moves to it; `replace`: «Сменить заголовок…». */
  async addGoalSource(src: GoalSource, opts: { create?: boolean; replace?: string } = {}): Promise<boolean> {
    if (opts.create) {
      const f = this.files.find((x) => x.name === src.file);
      if (!f || !(await this.writeSteps([{ path: f.path, text: addSourceHeading(f.text, src.heading) }]))) return false;
    }
    const list = this.goalSources
      .filter((x) => sourceKey(x) !== sourceKey(src) && sourceKey(x) !== opts.replace)
      .map((x) => (src.me ? { ...x, me: undefined } : x));
    list.push(src);
    return this.updateConfig((raw) => withGoals(this.withGoalsWorkflow(raw), list));
  }
  async removeGoalSource(key: string) {
    return this.updateConfig((raw) => withGoals(raw, this.goalSources.filter((x) => sourceKey(x) !== key)));
  }
  async renameGoalSource(key: string, title: string) {
    const t = title.trim();
    if (!t) return false;
    return this.updateConfig((raw) => withGoals(raw, this.goalSources.map((x) => (sourceKey(x) === key ? { ...x, title: t } : x))));
  }
  /** «Новая цель»: written at once, at the end of its quarter (made if needed); a toast with «Открыть». */
  async addGoal(key: string, q: Quarter, g: NewGoal): Promise<boolean> {
    const p = this.goalPeople.find((x) => x.key === key);
    if (!p?.file || !g.title.trim()) return false;
    if (!(await this.updateConfig((raw) => this.withGoalsWorkflow(raw)))) return false;
    const f = this.files.find((x) => x.path === p.file!.path)!; // read again: the statuses may have changed
    const r = insertGoal(f.text, f.headings, p.src.heading, q, g, weekdayNames(f.text));
    if (!r || !(await this.writeSteps([{ path: f.path, text: r.text }]))) return false;
    const path = f.path;
    this.note(`Цель добавлена — ${p.name}`, [{ label: 'Открыть', run: () => this.open(this.files.findIndex((x) => x.path === path), r.line) }]);
    return true;
  }
  /** The source whose file is in the editor (the goal form picks this person), if any. */
  goalKeyOfFile(): string | null {
    const name = this.file?.name;
    return (name && this.goalPeople.find((p) => p.src.file === name)?.key) || null;
  }
  /** The goal form: open, with a person chosen beforehand (the «+» of a group, the file in the editor). */
  goalForm = $state<{ key: string | null; n: number } | null>(null);
  openGoalForm(key: string | null = null) {
    if (this.sheetOpen) return;
    this.goalForm = { key, n: Date.now() };
  }
  /** «Добавить цели» / «Сменить заголовок…»: the dialog of sources. */
  goalAdd = $state<{ me?: boolean; replace?: string; file?: string; n: number } | null>(null);
  openGoalAdd(o: { me?: boolean; replace?: string; file?: string } = {}) {
    if (this.sheetOpen) return;
    this.goalAdd = { ...o, n: Date.now() };
  }

  // ---- the review of goals on 1-1 (ТЗ 23, part 2) -------------------------------------------------------------
  /**
   * The cards (a goal is known by its quarter and title: lines move with every edit), the card shown (−1: the
   * summary), what was done, and the new mark being written (it is saved when the card changes).
   */
  goalReview = $state<GoalReviewState | null>(null);
  /** The person and the goal of the card shown, read from the file now. */
  get goalCard() {
    const r = this.goalReview;
    if (!r || r.cur < 0) return null;
    const p = this.goalPeople.find((x) => x.key === r.key);
    const it = r.items[r.cur];
    const goal = p && it ? findGoal(p.data, it.q, it.title) : null;
    return p && it ? { p, it, goal } : null;
  }
  /** «Разобрать цели»: the open goals of the quarter, the silent first; `title`: start at that goal (⌥-click). */
  startGoalReview(key: string, title?: string) {
    const p = this.goalPeople.find((x) => x.key === key);
    if (!p?.file) return;
    const q = this.goalsQuarter;
    const queue = goalQueue(goalsIn(p.data, q), p.file.wf.done, new Date(), this.goalSettings.silent);
    if (!queue.length) {
      this.note(`Открытых целей в ${quarterLabel(q)} нет`);
      return;
    }
    const at = title ? Math.max(0, queue.findIndex((g) => g.title === title)) : 0;
    this.goalReview = { key, items: queue.map((g) => ({ title: g.title, q })), cur: at, marks: 0, closed: 0, moved: 0, draft: '', date: null };
    // one tab of the review: shown in the active pane
    const found = this.layout.panes.flatMap((pn, pi) => pn.tabs.map((t, ti) => ({ t, pi, ti }))).find((x) => x.t.kind === 'goalReview');
    if (found) {
      found.t.path = p.file.path;
      found.t.goals = key;
      this.activateTab(found.pi, found.ti);
    } else {
      const pn = this.layout.panes[this.layout.active];
      const at = pn.tabs.length ? pn.active + 1 : 0;
      pn.tabs.splice(at, 0, { ...newTab('goalReview', p.file.path), goals: key });
      pn.active = at;
    }
  }
  endGoalReview() {
    this.goalReview = null;
    for (const [pi, p] of this.layout.panes.entries())
      for (let ti = p.tabs.length - 1; ti >= 0; ti--) if (p.tabs[ti].kind === 'goalReview') closeTab(this.layout, pi, ti);
  }
  /** Write a step of the review to the person's file. */
  private async goalWrite(make: (text: string, hs: Heading[], names: string[]) => string | null): Promise<boolean> {
    const c = this.goalCard;
    const f = c?.p.file && this.files.find((x) => x.path === c.p.file!.path);
    if (!c || !f) return false;
    const next = make(f.text, f.headings, weekdayNames(f.text));
    return !!next && next !== f.text && !!(await this.writeSteps([{ path: f.path, text: next }]));
  }
  /** «Добавить отметку»: the text of the field under the chosen day (today by default), in date order. */
  async goalAddMark(): Promise<boolean> {
    const r = this.goalReview;
    const c = this.goalCard;
    if (!r || !c || !r.draft.trim()) return false;
    const date = r.date ?? new Date();
    const ok = await this.goalWrite((t, hs, names) => addMark(t, hs, c.p.src.heading, c.it.q, c.it.title, date, r.draft, names));
    if (ok) {
      r.marks++;
      r.draft = '';
      r.date = null;
    }
    return ok;
  }
  /** «Цель достигнута»: COMPLETED with CLOSED; the field is ready for «Итог:». */
  async goalComplete(): Promise<boolean> {
    const r = this.goalReview;
    const c = this.goalCard;
    if (!r || !c?.goal) return false;
    const done = c.p.file!.wf.done.includes(GOAL_STATES.done) ? GOAL_STATES.done : c.p.file!.wf.done[0];
    if (!done || c.goal.keyword === done) return false;
    const g = c.goal;
    const ok = await this.goalWrite((t, hs) => {
      const h = hs.find((x) => x.line === g.line);
      return h ? setKeyword(t, h, done, this.files.find((x) => x.path === c.p.file!.path)!.wf) : null;
    });
    if (ok) {
      r.closed++;
      if (!r.draft.trim()) r.draft = 'Итог: ';
    }
    return ok;
  }
  /** «Сдвинуть срок…»: the new DEADLINE and a mark «Срок перенесён: 30 ноя → 15 дек». */
  async goalShiftDeadline(to: Date): Promise<boolean> {
    const r = this.goalReview;
    const c = this.goalCard;
    if (!r || !c?.goal) return false;
    const g = c.goal;
    const from = g.deadline;
    const mark = from ? `Срок перенесён: ${shortDay(from)} → ${shortDay(to)}` : `Срок: ${shortDay(to)}`;
    const ok = await this.goalWrite((t, hs, names) => {
      const h = hs.find((x) => x.line === g.line);
      if (!h) return null;
      const t1 = setPlanning(t, h, 'DEADLINE', to);
      const f = this.files.find((x) => x.path === c.p.file!.path)!;
      return addMark(t1, parseHeadings(t1, f.wf), c.p.src.heading, c.it.q, c.it.title, new Date(), mark, names);
    });
    if (ok) r.moved++;
    return ok;
  }
  /** «Квартал»: the goal goes under another quarter; the card follows it. */
  async goalMoveQuarter(to: Quarter): Promise<boolean> {
    const r = this.goalReview;
    const c = this.goalCard;
    if (!r || !c?.goal) return false;
    const f = this.files.find((x) => x.path === c.p.file!.path)!;
    const ok = await this.goalWrite((t, hs) => moveGoal(t, hs, c.p.src.heading, c.it.q, c.it.title, to, (x) => parseHeadings(x, f.wf))?.text ?? null);
    if (ok) r.items[r.cur] = { ...c.it, q: to };
    return ok;
  }
  /** «Следующая» / «Назад»: a mark being written is saved first, without asking. */
  async goalStep(d: 1 | -1) {
    const r = this.goalReview;
    if (!r) return;
    if (r.draft.trim() && r.cur >= 0) await this.goalAddMark();
    r.draft = '';
    r.date = null;
    if (r.cur < 0) r.cur = d < 0 ? r.items.length - 1 : -1;
    else r.cur = r.cur + d >= r.items.length ? -1 : Math.max(0, r.cur + d);
  }

  /** The quick entry's shortcut and whether it works from any program (a preference of this Mac). */
  captureKey = $state(lsGet('capture:key') || DEFAULT_CAPTURE_KEY);
  captureGlobal = $state(lsGet('capture:global') !== '0');
  /** Register the shortcut with the system; null, or why it could not be (taken by another program, say). */
  async applyCaptureKey(): Promise<string | null> {
    if (!isTauri) return null;
    try {
      await invoke('set_capture_shortcut', { accelerator: this.captureKey, global: this.captureGlobal });
      return null;
    } catch (e) {
      return String(e);
    }
  }
  async setCaptureKey(key: string, global: boolean): Promise<string | null> {
    this.captureKey = key;
    this.captureGlobal = global;
    lsSet('capture:key', key);
    lsSet('capture:global', global ? '1' : '0');
    return this.applyCaptureKey();
  }
  /** The quick entry inside the window (⇧⌘I with the window in front, «+» in the Inbox panel). */
  capture = $state<{ n: number } | null>(null);
  /** «Выбрать файл…» for the Inbox: the palette of files. */
  pickInbox = $state(0);
  openCapture() {
    if (this.sheetOpen && !this.capture) return;
    this.capture = { n: Date.now() };
  }

  /** The builder: an editable copy of the agenda; `orig` is null for a new one. */
  builder = $state<{ draft: Agenda; orig: Agenda | null; n: number } | null>(null);
  /** ⌘S while the builder is open: «Сохранить агенду» (the builder watches this). */
  builderSave = $state(0);
  /** «Новая агенда»: opens the builder with an empty agenda (nothing is saved until «Сохранить агенду»). */
  newAgendaInBuilder(from?: Element | null) {
    if (this.builder) return;
    this.builderFrom = from ?? (document.activeElement as Element | null);
    this.builder = { draft: newAgenda(), orig: null, n: Date.now() };
  }
  editAgenda(id: string, from?: Element | null) {
    const a = this.agendas.find((x) => x.id === id);
    if (!a || this.builder) return;
    this.builderFrom = from ?? (document.activeElement as Element | null);
    this.builder = { draft: cloneAgenda(a), orig: a, n: Date.now() };
  }
  /** Where the builder was opened from: the focus goes back there when it closes (a clicked button has none in WebKit). */
  private builderFrom: Element | null = null;
  private leaveBuilder() {
    this.builder = null;
    const el = this.builderFrom as HTMLElement | null;
    this.builderFrom = null;
    // after the window under the sheet takes input again
    if (el?.isConnected) setTimeout(() => el.isConnected && el.focus());
  }
  get builderDirty() {
    const b = this.builder;
    return !!b && (!b.orig || !sameAgenda(b.draft, b.orig));
  }
  closeBuilder() {
    this.leaveBuilder();
  }
  /** «Сохранить агенду»: writes it (a saved one is replaced whole), closes the builder and shows the agenda. */
  async saveAgenda(a: Agenda): Promise<boolean> {
    const copy = cloneAgenda(a);
    const ok = await this.updateConfig((raw) => {
      const list = this.agendasIn(raw);
      const i = list.findIndex((x) => x.id === copy.id);
      if (i >= 0) list[i] = copy;
      else list.push(copy);
      return withAgendas(raw, list);
    });
    if (!ok) return false;
    this.leaveBuilder();
    this.openAgendaHere(copy.id);
    return true;
  }
  async deleteAgenda(id: string) {
    await this.updateConfig((raw) => withAgendas(raw, this.agendasIn(raw).filter((x) => x.id !== id)));
  }
  private agendasIn(raw: string | null): Agenda[] {
    try {
      return readAgendas(raw ? JSON.parse(raw)?.agendas : null);
    } catch {
      return [];
    }
  }
  /** Today, for relative dates in agendas: it changes at midnight (checked every minute and on coming back). */
  today = $state(new Date());
  private tickDay() {
    const now = new Date();
    if (now.toDateString() !== this.today.toDateString()) this.today = now;
  }

  private sorted(list: Listed[]) {
    const order = (n: string) => (n.includes('/') ? 1 : 0);
    return list.sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name, 'ru'));
  }

  /** First load, and after the notes folder changes. */
  async load() {
    if (isTauri) {
      const st = await invoke<{ dir: string | null; missing: string | null }>('notes_dir_status');
      this.dir = st.dir;
      this.hasSample = !!(await invoke<string | null>('sample_notes_dir'));
      this.needFolder = !this.dir;
      if (!this.dir) {
        this.start = st.missing ? { kind: 'missing', path: st.missing } : { kind: 'welcome' };
        this.files = [];
        this.loaded = true;
        return;
      }
      if (this.start?.kind !== 'found') this.start = null;
    }
    // gather everything first and publish it in one go: the UI becomes usable the moment `files` is set,
    // and anything the user does after that must not be overwritten by the tail of this function
    const list = this.sorted(await this.listFiles());
    this.configRaw = null;
    this.takeConfig(await this.readConfig());
    const cfg = this.config;
    const files = list.map((l) => fromDisk(l, cfg));
    const folders = await this.readFolders(files);
    // the panes and tabs of the last session; files that cannot be opened any more are skipped
    const exists = (p: string) => files.some((f) => f.path === p);
    const saved = restore(lsGet(this.layoutKey()), exists);
    const last = lsGet('lastFile:' + (this.dir ?? ''));
    const pick = files.find((f) => f.path === last) ?? files.find((f) => f.name === 'Weekly.org') ?? files[0];
    this.folders = folders;
    this.layout = saved ?? emptyLayout(pick ? newTab('file', pick.path) : undefined);
    this.files = files;
    this.loaded = true;
  }

  private async readFolders(files: { name: string }[]): Promise<string[]> {
    if (isTauri) return invoke<string[]>('list_folders');
    const set = new Set<string>();
    for (const f of files) {
      const parts = f.name.split('/').slice(0, -1);
      parts.forEach((_, i) => set.add(parts.slice(0, i + 1).join('/')));
    }
    return [...set];
  }

  /**
   * Re-read the folder after something changed on disk, keeping unsaved local edits.
   * A disk snapshot is only trusted if no save of ours was running or finished while it was being
   * read; otherwise it can be older than what we already wrote (and than what the user typed on
   * top of it) and applying it would revert text and throw the cursor around.
   */
  async reload() {
    if (!this.dir && isTauri) return;
    for (let attempt = 0; attempt < 6; attempt++) {
      for (let i = 0; this.saving > 0 && i < 100; i++) await new Promise((r) => setTimeout(r, 20));
      const seq = this.writes;
      let raw: Listed[];
      try {
        raw = await this.listFiles();
      } catch {
        // the folder is gone (deleted, unmounted): every open file goes the «deleted» way, nothing is lost
        this.folderGone = true;
        this.applySnapshot([], []);
        return;
      }
      this.folderGone = false;
      const list = this.sorted(raw);
      const folders = await this.readFolders(list);
      const cfgRaw = await this.readConfig();
      if (this.saving > 0 || this.writes !== seq) continue; // stale snapshot, take a new one
      if (this.takeConfig(cfgRaw)) this.rebuildAll(); // statuses changed: every note is re-read with them
      this.applySnapshot(list, folders);
      return;
    }
    // we keep writing: the echo of our last save will trigger another reload
  }

  private applySnapshot(list: Listed[], folders: string[]) {
    // open orphans count as known files: one that comes back is compared like any other
    const old = new Map([...Object.values(this.orphans), ...this.files].map((f) => [f.path, f]));
    const reloaded: string[] = [];
    const conflicts = { ...this.conflicts };
    const gen = { ...this.diskGen };
    const files = list.map((n) => {
      const o = old.get(n.path);
      if (!o) return fromDisk(n, this.config);
      if (n.text === o.diskRaw) return o; // nothing new on disk: untouched, «touched», or the echo of our own save
      const { text, eol } = splitEol(n.text);
      if (text === o.text) {
        delete conflicts[n.path]; // the disk caught up with what the tab shows
        return { ...o, disk: text, diskRaw: n.text };
      }
      if (o.text !== o.disk) {
        // unsaved edits here and a new version there: nothing is lost, the user picks one (the newest disk version)
        clearTimeout(this.timers.get(n.path));
        this.timers.delete(n.path);
        conflicts[n.path] = { path: n.path, name: o.name, disk: text, diskRaw: n.text, eol, mtime: n.mtime ?? Date.now(), postponed: false };
        return o;
      }
      // no edits: take the disk version silently
      if (this.isVisible(n.path)) reloaded.push(o.name);
      gen[n.path] = (gen[n.path] ?? 0) + 1;
      return fromDisk(n, this.config);
    });
    // gone from disk: moved within the folder (the same text appeared elsewhere), or deleted
    const known = new Set(list.map((n) => n.path));
    const added = list.filter((n) => !old.has(n.path));
    const orphans: Record<string, NoteFile> = {};
    const moves: Record<string, string> = {};
    for (const o of old.values()) {
      if (known.has(o.path) || !this.isOpen(o.path)) continue;
      const twins = added.filter((n) => n.text === o.diskRaw);
      if (twins.length === 1) {
        moves[o.path] = twins[0].path;
        if (o.text !== o.disk) {
          // the edits move along with the tab
          const i = files.findIndex((f) => f.path === twins[0].path);
          files[i] = build(files[i].name, files[i].path, o.text, files[i].disk, files[i].diskRaw, files[i].eol, this.config);
          this.scheduleSave(files[i].path);
        }
      } else orphans[o.path] = o;
      delete conflicts[o.path];
    }
    this.files = files;
    this.folders = folders;
    this.orphans = orphans;
    this.conflicts = conflicts;
    this.diskGen = gen;
    if (Object.keys(moves).length) mapPaths(this.layout, (p) => moves[p] ?? p);
    for (const p of this.orphanAsked) if (!orphans[p]) this.orphanAsked.delete(p);
    if (reloaded.length) this.showReloaded(reloaded);
  }

  /** Shown in one of the panes (the active tab of a pane). */
  private isVisible(path: string) {
    return this.layout.panes.some((p) => { const t = p.tabs[p.active]; return t?.kind === 'file' && t.path === path; });
  }
  private isOpen(path: string) {
    return this.layout.panes.some((p) => p.tabs.some((t) => t.kind === 'file' && t.path === path));
  }
  private showReloaded(names: string[]) {
    this.toastNames = [...new Set([...(this.toast ? this.toastNames : []), ...names])];
    const n = this.toastNames.length;
    const files = n % 10 === 1 && n % 100 !== 11 ? 'файл' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'файла' : 'файлов';
    const text = n === 1 ? `«${displayName(this.toastNames[0])}» обновлён с диска: файл изменила другая программа` : `Обновлено с диска: ${n} ${files}`;
    this.toast = { text, n: Date.now() };
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 4000);
  }

  /**
   * The next disk question, if one is due: the window is in front, no sheet is up, and the tab is shown —
   * the active pane first. Called whenever any of that may have changed.
   */
  async pumpDisk() {
    if (this.sheetOpen || !this.appActive) return;
    const panes = [this.layout.active, ...this.layout.panes.map((_, i) => i).filter((i) => i !== this.layout.active)];
    for (const pi of panes) {
      const p = this.layout.panes[pi];
      const t = p?.tabs[p.active];
      if (t?.kind !== 'file' || !t.path) continue;
      const c = this.conflicts[t.path];
      if (c && !c.postponed) return void this.askChanged(t.path);
      const o = this.orphans[t.path];
      if (o && o.text !== o.disk && !this.orphanAsked.has(t.path)) return void this.askDeleted(t.path);
    }
  }
  /** «Файл изменён другой программой»: resolves to what was decided ('later' leaves the conflict for later). One
   * question per file at a time: whoever asks while it is up (the queue, closing, ⌘S) gets the same answer. */
  askChanged(path: string): Promise<DiskAnswer> {
    return (this.asking[path] ??= this.askChangedOnce(path).finally(() => delete this.asking[path]));
  }
  private asking: Record<string, Promise<DiskAnswer>> = {};
  private async askChangedOnce(path: string): Promise<DiskAnswer> {
    const a = await new Promise<DiskAnswer>((resolve) => (this.diskReq = { kind: 'changed', path, resolve }));
    this.diskReq = null;
    const c = this.conflicts[path];
    const f = this.files.find((x) => x.path === path);
    if (c && f) {
      const rest = { ...this.conflicts };
      delete rest[path];
      if (a === 'disk') {
        // the disk text comes in as an ordinary edit, so ⌘Z brings mine back
        this.files = this.files.map((x) => (x.path === path ? build(x.name, x.path, c.disk, c.disk, c.diskRaw, c.eol, this.config) : x));
        this.conflicts = rest;
      } else if (a === 'mine') {
        // the disk version is the accepted base now: the next write replaces it without asking again
        this.files = this.files.map((x) => (x.path === path ? { ...x, disk: c.disk, diskRaw: c.diskRaw } : x));
        this.conflicts = rest;
        this.scheduleSave(path);
      } else this.conflicts = { ...this.conflicts, [path]: { ...c, postponed: true } };
    }
    queueMicrotask(() => this.pumpDisk());
    return a;
  }
  /** «Файл удалён или перемещён» for a tab with edits. */
  async askDeleted(path: string): Promise<DiskAnswer> {
    const a = await new Promise<DiskAnswer>((resolve) => (this.diskReq = { kind: 'deleted', path, resolve }));
    this.diskReq = null;
    this.orphanAsked.add(path);
    if (a === 'close') this.dropOrphan(path);
    else if (a === 'saveas') {
      const [pi, ti] = this.whereFile(path);
      const t = this.layout.panes[pi]?.tabs[ti];
      if (t) await this.saveAs(t);
    }
    queueMicrotask(() => this.pumpDisk());
    return a;
  }
  /** "Закрыть без сохранения": the orphan's tabs go, in both panes. */
  private dropOrphan(path: string) {
    const rest = { ...this.orphans };
    delete rest[path];
    this.orphans = rest;
    dropMissing(this.layout, (p) => p !== path);
  }
  private whereFile(path: string): [number, number] {
    const pi = this.layout.active;
    const own = this.layout.panes[pi]?.tabs.findIndex((t) => t.kind === 'file' && t.path === path) ?? -1;
    if (own >= 0) return [pi, own];
    for (let i = 0; i < this.layout.panes.length; i++) {
      const ti = this.layout.panes[i].tabs.findIndex((t) => t.kind === 'file' && t.path === path);
      if (ti >= 0) return [i, ti];
    }
    return [-1, -1];
  }
  /** The window came to the front: questions put off with Esc come back, and the open files are read again. */
  activated() {
    this.appActive = true;
    this.tickDay();
    // the folder may be back (a disk plugged in, a folder restored)
    if (this.start?.kind === 'missing' || this.folderGone) return void this.retryFolder();
    const c: Record<string, Conflict> = {};
    for (const [k, v] of Object.entries(this.conflicts)) c[k] = { ...v, postponed: false };
    this.conflicts = c;
    void this.reload();
  }
  /** «Моя версия»: when the tab's text was last changed here. */
  editedAt(path: string) {
    return this.edited[path];
  }

  /** The system «Выбрать папку» panel; null when cancelled. */
  private async pickFolder(title: string): Promise<string | null> {
    if (!isTauri) return null;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const sel = await open({ directory: true, multiple: false, title, canCreateDirectories: true });
    return typeof sel === 'string' ? sel : null;
  }
  /** «Выбрать папку…» on the welcome screen (and «Выбрать другую…» on the next ones). Cancel changes nothing. */
  async chooseFolder() {
    const p = await this.pickFolder('Папка с заметками');
    if (p) await this.showFound(p, this.start?.kind === 'found' && this.start.change);
  }
  /** «Создать новую папку…»: the same panel with «Новая папка»; the folder made becomes the notes folder. */
  async createNewFolder() {
    const p = await this.pickFolder('Новая папка для заметок');
    if (p) await this.useFolder(p);
  }
  /** «Папка найдена»: count what is in the folder before opening it. */
  async showFound(path: string, change = false) {
    this.start = { kind: 'found', path, scan: null, change };
    try {
      const scan = await invoke<Scan>('scan_folder', { path });
      if (this.start?.kind === 'found' && this.start.path === path) this.start = { ...this.start, scan };
    } catch (e) {
      this.say(this.errorText(e));
      this.start = change ? null : { kind: 'welcome' };
    }
  }
  /** «Открыть» on «Папка найдена». */
  async openFound() {
    if (this.start?.kind !== 'found') return;
    await this.useFolder(this.start.path);
  }
  /** Esc on «Папка найдена» while changing the folder: stay with the current one. */
  backFromFound() {
    if (this.start?.kind === 'found' && this.start.change) this.start = null;
  }
  async useFolder(path: string) {
    await invoke('set_notes_dir', { path });
    this.start = null;
    this.folderGone = false;
    this.orphans = {};
    this.conflicts = {};
    await this.load();
  }
  /** «Повторить»: the remembered folder (found again by its bookmark if it moved). */
  async retryFolder(): Promise<boolean> {
    if (!isTauri) return false;
    if (this.folderGone) {
      await this.reload(); // back at the same place
      if (!this.folderGone) return true;
    }
    const dir = await invoke<string | null>('retry_notes_dir');
    if (!dir) return false;
    if (dir !== this.dir || this.start) {
      this.start = null;
      await this.load();
    } else await this.reload();
    return true;
  }
  /**
   * «Открыть другую папку…»: (1) the panel, (2) the question about unsaved tabs, (3) the tabs close, (4) «Папка
   * найдена» for the new one. A cancel at 1 or 2 leaves the folder and the tabs as they are.
   */
  async changeFolder() {
    if (this.sheetOpen) return;
    const p = await this.pickFolder('Другая папка с заметками');
    if (!p) return;
    if (!(await this.confirmClose(this.layout.panes.flatMap((x) => x.tabs)))) return;
    await this.flush();
    this.layout = emptyLayout();
    this.orphans = {};
    await this.showFound(p, true);
  }
  /** «Показать в Finder» for the notes folder. */
  async revealFolder() {
    if (!this.dir) return;
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
    await revealItemInDir(this.dir);
  }
  /** ⌘⇧W, the red button: the window goes, the app stays in the Dock with everything in memory. */
  /** The traffic lights drawn in our toolbar in full screen: green leaves full screen, red closes (hides) the window. */
  async leaveFullscreen() {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setFullscreen(false);
  }
  async closeFromFullscreen() {
    await this.leaveFullscreen();
    setTimeout(() => void this.hideWindow(), 800); // after the window is back from its space
  }
  async hideWindow() {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().hide();
  }

  async useSample() {
    const p = await invoke<string | null>('sample_notes_dir');
    if (p) await this.useFolder(p);
  }

  async listen() {
    // back in front: check the open files again in case an event was missed
    window.addEventListener('focus', () => this.activated());
    setInterval(() => this.tickDay(), 60_000);
    window.addEventListener('blur', () => (this.appActive = false));
    if (!isTauri) return;
    const { listen } = await import('@tauri-apps/api/event');
    await listen('notes-changed', () => this.reload());
    await listen<{ fullscreen: boolean; lights: boolean; menu: number }>('titlebar', (e) => (this.titlebar = e.payload));
    // the quick entry: ⇧⌘I with this window in front, and the tasks the panel hands over
    const { emitTo } = await import('@tauri-apps/api/event');
    await listen('capture-here', () => this.openCapture());
    await listen<{ id: number; title: string; details: string }>('capture-submit', async (e) => {
      const result = await this.addToInbox(e.payload.title, e.payload.details);
      await emitTo('capture', 'capture-result', { id: e.payload.id, result });
    });
    await listen('capture-pick', () => {
      this.setNavMode('inbox');
      this.pickInbox = Date.now();
    });
    void this.applyCaptureKey();
    await listen('quit-requested', () => this.quit()); // «Завершить» from the Dock
  }

  setText(text: string, path: string = this.curPath) {
    const orphan = this.orphans[path];
    if (orphan) {
      // a file gone from disk lives in its tab only; ⌘S writes it again
      if (orphan.text !== text) this.orphans = { ...this.orphans, [path]: build(orphan.name, orphan.path, text, orphan.disk, orphan.diskRaw, orphan.eol, this.config) };
      return;
    }
    const f = this.files.find((x) => x.path === path);
    if (!f || f.text === text) return;
    this.edited[path] = Date.now();
    const next = build(f.name, f.path, text, f.disk, f.diskRaw, f.eol, this.config);
    this.files = this.files.map((x) => (x.path === path ? next : x));
    this.scheduleSave(path);
  }

  /** Apply a text patch to the heading under the cursor. */
  patch(fn: (text: string, h: Heading, wf: Workflow) => string) {
    const f = this.file;
    const h = f?.headings[this.selected];
    if (!f || !h) return;
    this.setText(fn(f.text, h, f.wf), f.path);
  }
  setKeyword(kw: string | null) { this.patch((t, h, wf) => setKeyword(t, h, kw, wf)); }
  /** The same on the heading at a line of a file (a click on a drawn capsule: the caret does not move). */
  patchAt(path: string, line: number, fn: (text: string, h: Heading, wf: Workflow) => string) {
    const f = this.files.find((x) => x.path === path);
    const h = f?.headings.find((x) => x.line === line);
    if (f && h) this.setText(fn(f.text, h, f.wf), f.path);
  }
  setPriority(p: string | null) { this.patch((t, h) => setPriority(t, h, p)); }
  setPlanning(kind: 'SCHEDULED' | 'DEADLINE', date: Date | null) { this.patch((t, h) => setPlanning(t, h, kind, date)); }
  setTags(tags: string[]) { this.patch((t, h) => setTags(t, h, tags)); }

  // ---- «Перенести»: a heading with its subtree into a file, under a heading there or at its 1st level ----------
  /** What is being moved: the heading under the cursor (the palette's command) or an Inbox task. */
  refile = $state<{ from: 'palette' | 'inbox' | 'review'; path: string; line: number; title: string; item?: InboxItem; n: number } | null>(null);
  /** The Inbox task going away after «Перенести» (the same short fade as «Готово»). */
  inboxLeaving = $state<number | null>(null);
  startRefile(from: 'palette' | 'inbox', item?: InboxItem) {
    const f = from === 'inbox' ? this.inboxFile : this.file;
    const h = from === 'inbox' ? (item ? this.inboxHeading(item)?.h : undefined) : f?.headings[this.selected];
    if (!f || !h) return;
    this.refile = { from, path: f.path, line: h.line, title: h.title, item, n: Date.now() };
  }
  /** The heading being moved, as it is now. */
  refileSource(): { f: NoteFile; h: Heading } | null {
    const r = this.refile;
    if (!r) return null;
    const f = this.files.find((x) => x.path === r.path);
    const h = f?.headings.find((x) => x.line === r.line && x.title === r.title);
    return f && h ? { f, h } : null;
  }
  private recentKey() {
    return 'refile:recent:' + (this.dir ?? '');
  }
  /** The last places moved to, newest first, one per file: its path and the heading's key ('' = the 1st level). */
  refileRecent(): { path: string; key: string }[] {
    try {
      const v = JSON.parse(lsGet(this.recentKey()) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => x && typeof x.path === 'string' && typeof x.key === 'string') : [];
    } catch {
      return [];
    }
  }
  /** «НЕДАВНИЕ» of step 1: the last places moved to, then recently opened files (the own file only as a place
   *  moved to before). */
  refileRecentFiles(self: string): string[] {
    const opened = [...this.layout.panes.flatMap((p) => p.tabs.flatMap((t) => (t.kind === 'file' && t.path ? [t.path] : []))), ...this.history.map((h) => h.path), this.curPath].reverse();
    return [...new Set([...this.refileRecent().map((x) => x.path), ...opened.filter((p) => p && p !== self)])];
  }
  /**
   * Move it. The target is saved first (its unsaved edits go along) and re-read from disk; a heading chosen there
   * that is gone now gives 'gone' and the dialog stays. Then the target is written, and only then the source.
   */
  async refileMove(dstPath: string, under: { key: string; line: number } | null): Promise<'ok' | 'gone' | 'error'> {
    const review = this.refile?.from === 'review';
    if (review) this.reviewBusy = true; // the task leaves the Inbox: not a change on disk for the review
    try {
      return await this.refileMoveNow(dstPath, under);
    } finally {
      if (review) this.reviewBusy = false;
    }
  }
  private async refileMoveNow(dstPath: string, under: { key: string; line: number } | null): Promise<'ok' | 'gone' | 'error'> {
    const req = this.refile;
    if (!req) return 'error';
    const d0 = this.files.find((x) => x.path === dstPath);
    if (d0 && d0.text !== d0.disk && !this.conflicts[dstPath]) {
      clearTimeout(this.timers.get(dstPath));
      this.timers.delete(dstPath);
      const err = await this.save(dstPath);
      if (err) {
        this.say('Не удалось записать «' + displayName(d0.name) + '»: ' + err);
        return 'error';
      }
    }
    await this.reload();
    const src = this.refileSource();
    const dst = this.files.find((x) => x.path === dstPath);
    if (!src || !dst) {
      this.refile = null;
      this.say('Не удалось перенести: файл изменился');
      return 'error';
    }
    const same = dst.path === src.f.path;
    let uh: Heading | null = null;
    if (under) {
      const inside = (x: Heading) => same && x.line >= src.h.line && x.line < src.h.end;
      const found = dst.headings.filter((x) => keyOf(x) === under.key && !inside(x));
      uh = found.sort((a, b) => Math.abs(a.line - under.line) - Math.abs(b.line - under.line))[0] ?? null;
      if (!uh) return 'gone';
    }
    this.refile = null;
    if (req.from === 'inbox') {
      this.inboxLeaving = src.h.line;
      await new Promise((r) => setTimeout(r, 180));
      this.inboxLeaving = null;
    }
    let steps: { path: string; text: string }[];
    let line: number;
    if (same) {
      const r = moveWithin(src.f.text, src.h, uh);
      steps = [{ path: dst.path, text: r.text }];
      line = r.line;
    } else {
      const r = moveTo(src.f.text, src.h, dst.text, uh);
      steps = [{ path: dst.path, text: r.dst }, { path: src.f.path, text: r.src }];
      line = r.line;
    }
    const done = await this.writeSteps(steps);
    if (!done) return 'error';
    if (req.from === 'inbox') this.inboxUndo.push(done);
    const rec = [{ path: dst.path, key: uh ? keyOf(uh) : '' }, ...this.refileRecent().filter((x) => x.path !== dst.path)].slice(0, 20);
    lsSet(this.recentKey(), JSON.stringify(rec));
    if (req.from === 'palette') this.caretAfterRefile(src.f.path, src.h, same ? line : null);
    const name = displayName(dst.name);
    if (req.from === 'review') {
      this.reviewMoved(dst.path, line, `${name}${uh ? ' › ' + bareTitle(uh.title) : ''}`, done);
      return 'ok';
    }
    this.note(`Перенесено в ${name}${uh ? ' › ' + bareTitle(uh.title) : ''}`, [
      { label: 'Открыть', run: () => { const i = this.files.findIndex((x) => x.path === dst.path); if (i >= 0) this.open(i, line); } },
      { label: 'Отменить', run: () => void this.undoStep(done).then((ok) => { if (ok) this.inboxUndo = this.inboxUndo.filter((s) => s !== done); }) },
    ], 3000);
    return 'ok';
  }
  // ---- search: ⌘F in a pane, ⇧⌘F in every file ------------------------------------------------------------
  /** «Aa» and «Слово», shared by both searches (this Mac). */
  findCase = $state(lsGet('find:cs') === '1');
  findWord = $state(lsGet('find:word') === '1');
  setFindOpts(o: { cs?: boolean; word?: boolean }) {
    if (o.cs !== undefined) lsSet('find:cs', (this.findCase = o.cs) ? '1' : '0');
    if (o.word !== undefined) lsSet('find:word', (this.findWord = o.word) ? '1' : '0');
  }
  /** What a pane's find bar is asked (the menu, the keys, a jump from the search in every file). */
  findReq = $state<{ kind: 'open' | 'next' | 'prev' | 'useSel' | 'jump'; pane: number; n: number; q?: string; at?: { path: string; line: number; col: number } } | null>(null);
  askFind(kind: 'open' | 'next' | 'prev' | 'useSel') {
    this.findReq = { kind, pane: this.layout.active, n: Date.now() + Math.random() };
  }
  /** The search in every file: its query, where, the results (kept until the app quits). */
  search = $state<SearchState>({ q: '', ran: '', scope: 'all', running: false, groups: [], total: 0, capped: false, scanned: 0, sel: null, focusN: 0 });
  private searchRun = 0;
  /** ⇧⌘F: the section «Поиск», the field in focus (the editor's one-line selection in it, not searched yet). */
  openSearch(selection = '') {
    this.setNavMode('search');
    if (selection && !selection.includes('\n')) this.search.q = selection;
    this.search.focusN++;
  }
  private recentKey2() {
    return 'search:recent';
  }
  searchRecent(): { q: string; t: number }[] {
    try {
      const v = JSON.parse(lsGet(this.recentKey2()) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => x && typeof x.q === 'string') : [];
    } catch {
      return [];
    }
  }
  clearSearchRecent() {
    lsSet(this.recentKey2(), '[]');
    this.search.focusN++;
  }
  /** ↩: every .org file of the folder (the open ones with their unsaved edits), a portion at a time; a new run stops
   *  the old one. */
  async runSearch() {
    const q = this.search.q.trim();
    if (!q) return;
    const run = ++this.searchRun;
    lsSet(this.recentKey2(), JSON.stringify([{ q, t: Date.now() }, ...this.searchRecent().filter((x) => x.q !== q)].slice(0, 8)));
    const opts = { cs: this.findCase, word: this.findWord };
    const scope = this.search.scope;
    const open = new Set(this.layout.panes.flatMap((p) => p.tabs.flatMap((t) => (t.kind === 'file' && t.path ? [t.path] : []))));
    const files = [...this.files];
    const groups: SearchGroup[] = [];
    let total = 0;
    let capped = false;
    Object.assign(this.search, { ran: q, running: true, groups: [], total: 0, capped: false, scanned: 0, sel: null });
    const order = (a: SearchGroup, b: SearchGroup) =>
      Number(open.has(b.path)) - Number(open.has(a.path)) || b.hits.length - a.hits.length || a.name.localeCompare(b.name, 'ru');
    const show = () => {
      const g = [...groups].sort(order);
      g.forEach((x, i) => (x.open = i < 5));
      Object.assign(this.search, { groups: g, total, capped });
    };
    for (let i = 0; i < files.length; i++) {
      if (run !== this.searchRun) return;
      const f = files[i];
      const hits = searchFile(f.text, f.headings, q, opts, scope, SEARCH_CAP - total);
      if (hits.length) groups.push({ path: f.path, name: f.name, hits, open: false, all: false, stamp: f.text });
      total += hits.length;
      if (total >= SEARCH_CAP) {
        capped = true;
        break;
      }
      if (i % 40 === 39) {
        this.search.scanned = i + 1;
        show();
        await new Promise((r) => setTimeout(r, 0)); // the window stays alive on a big folder
      }
    }
    if (run !== this.searchRun) return;
    show();
    this.search.running = false;
  }
  /** A result: its file in the active pane at the match; the pane's find bar with the same query. */
  openHit(g: number, i: number) {
    const grp = this.search.groups[g];
    const hit = grp?.hits[i];
    const idx = grp ? this.files.findIndex((f) => f.path === grp.path) : -1;
    if (!hit || idx < 0) return;
    this.search.sel = { g, i };
    this.open(idx, hit.line, false);
    this.findReq = { kind: 'jump', pane: this.layout.active, n: Date.now() + Math.random(), q: this.search.ran, at: { path: grp.path, line: hit.line, col: hit.col } };
  }
  /** ⌥⌘G / ⇧⌥⌘G: the next / previous result, from file to file. */
  searchStep(dir: 1 | -1) {
    const flat = this.search.groups.flatMap((g, gi) => g.hits.map((_, i) => ({ g: gi, i })));
    if (!flat.length) return;
    const s = this.search.sel;
    const at = s ? flat.findIndex((x) => x.g === s.g && x.i === s.i) : -1;
    const next = flat[(at + dir + flat.length) % flat.length];
    this.openHit(next.g, next.i);
  }

  // ---- «Разбор Inbox»: the tasks one by one, as cards, in a tab of their own ---------------------------------
  /** The review going on: its queue (fixed when it starts), the card shown (-1: the summary), the tasks there were. */
  review = $state<{ items: ReviewItem[]; cur: number; known: string[] } | null>(null);
  /** An action is being written: the review does not take the task's absence for a change on disk. */
  private reviewBusy = false;
  /** Takes the last action of the review back (the toast's «Отменить», ⌘Z on the summary). */
  reviewUndoLast: (() => void) | null = null;
  /** The queue a review would start with now. */
  get reviewPending(): ReviewItem[] {
    const f = this.inboxFile;
    return f ? reviewQueue(f.text, f.headings, f.wf, f.path, this.inboxCfg.reviewOrder) : [];
  }
  private taskKeys(): string[] {
    const f = this.inboxFile;
    return f ? reviewQueue(f.text, f.headings, f.wf, f.path, 'old').map((x) => x.created ?? x.title) : [];
  }
  /** «Разобрать»: a review of `items` (by default what is in the Inbox now) in the «Разбор Inbox» tab. */
  startReview(items: ReviewItem[] = this.reviewPending) {
    if (!items.length) return;
    this.reviewUndoLast = null;
    this.review = { items, cur: 0, known: this.taskKeys() };
    const at = this.layout.panes.flatMap((p, pi) => p.tabs.map((t, ti) => ({ t, pi, ti }))).find((x) => x.t.kind === 'review');
    if (at) this.activateTab(at.pi, at.ti);
    else {
      const p = this.layout.panes[this.layout.active];
      p.tabs.splice(p.tabs.length ? p.active + 1 : 0, 0, newTab('review', items[0].path));
      p.active = p.tabs.length ? p.tabs.findIndex((t) => t.kind === 'review') : 0;
    }
    this.reviewShow(0);
  }
  /** «Закончить»: the tab goes; everything is on disk already. */
  endReview() {
    this.review = null;
    for (let pi = this.layout.panes.length - 1; pi >= 0; pi--) {
      const p = this.layout.panes[pi];
      for (let ti = p.tabs.length - 1; ti >= 0; ti--) if (p.tabs[ti].kind === 'review') closeTab(this.layout, pi, ti);
    }
    this.persistLayout();
  }
  get reviewItem(): ReviewItem | undefined {
    const r = this.review;
    return r && r.cur >= 0 ? r.items[r.cur] : undefined;
  }
  /** The file and the heading of a task, as they are now. */
  reviewHeading(it: ReviewItem): { f: NoteFile; h: Heading } | null {
    const f = this.files.find((x) => x.path === it.path);
    const h = f && locate(f.text, f.headings, it);
    return f && h ? { f, h } : null;
  }
  /** Show a card (or the summary, -1); the tab follows the card's file, so the palette and the inspector see it. */
  reviewShow(i: number) {
    const r = this.review;
    if (!r) return;
    r.cur = i;
    const it = r.items[i];
    const t = this.layout.panes.flatMap((p) => p.tabs).find((x) => x.kind === 'review');
    if (t) {
      t.path = it?.path;
      const h = it && this.reviewHeading(it);
      if (h) t.cursor = { line: h.h.line, col: 0 };
    }
  }
  /** The card's editor reports where the task is now (it moves with edits). */
  reviewAt(it: ReviewItem, line: number) {
    it.line = line;
    const h = this.reviewHeading(it);
    if (h) it.title = h.h.title;
  }
  private reviewNext() {
    const r = this.review;
    if (r) this.reviewShow(nextOpen(r.items, r.cur));
  }
  /** ⌥⌘[: the card before, as it is now (a moved task in its new file). */
  reviewBack() {
    const r = this.review;
    if (!r) return;
    let i = r.cur < 0 ? r.items.length - 1 : r.cur - 1;
    while (i >= 0 && r.items[i].result === 'delete') i--;
    if (i >= 0) this.reviewShow(i);
  }
  /** Write an action, mark the task, go on; the toast takes it back. */
  private async reviewWrite(it: ReviewItem, text: (f: NoteFile, h: Heading) => string | null, mark: Partial<ReviewItem> & { result: Result }, toast: string) {
    const r = this.reviewHeading(it);
    if (!r) return;
    const t = text(r.f, r.h);
    if (t === null) return;
    this.reviewBusy = true;
    const before = { result: it.result, note: it.note, keyword: it.keyword };
    const step = await this.writeSteps([{ path: r.f.path, text: t }]);
    this.reviewBusy = false;
    if (!step) return;
    Object.assign(it, mark);
    const at = this.review?.items.indexOf(it) ?? -1;
    this.reviewNext();
    const undo = () => void this.undoStep(step).then((ok) => { if (ok) this.reviewUndone(it, before, at); });
    this.reviewUndoLast = undo;
    this.note(toast, [{ label: 'Отменить', run: undo }], 4000);
  }
  private reviewUndone(it: ReviewItem, before: Partial<ReviewItem>, at: number) {
    this.reviewUndoLast = null;
    Object.assign(it, before);
    if (this.review && at >= 0) this.reviewShow(at);
  }
  /** The status «Выполнено» / «Отменить» writes for this task (null: its set has none). */
  reviewStatus(it: ReviewItem, which: 'done' | 'cancel'): string | null {
    const r = this.reviewHeading(it);
    const wf = r?.f.wf ?? this.inboxFile?.wf;
    return wf ? closingStatus(wf, r?.h.keyword ?? it.keyword, which, which === 'done' ? this.inboxCfg.reviewDone : this.inboxCfg.reviewCancel) : null;
  }
  async reviewClose(which: 'done' | 'cancel') {
    const it = this.reviewItem;
    const kw = it && this.reviewStatus(it, which);
    if (!it || !kw) return;
    const word = which === 'done' ? 'Выполнено' : 'Отменено';
    await this.reviewWrite(it, (f, h) => setKeyword(f.text, h, kw, f.wf), { result: which, keyword: kw, note: `${word} · ${kw}` }, `${word}: ${it.title}`);
  }
  async reviewDefer(date: Date) {
    const it = this.reviewItem;
    if (!it) return;
    await this.reviewWrite(it, (f, h) => setPlanning(f.text, h, 'SCHEDULED', date), { result: 'defer', note: `Отложена до ${short(date)} · в Inbox` }, `Отложена до ${short(date)}: ${it.title}`);
  }
  async reviewDelete() {
    const it = this.reviewItem;
    if (!it) return;
    await this.reviewWrite(it, (f, h) => remove(f.text, h), { result: 'delete', note: 'Удалена' }, `Удалено: ${it.title}`);
  }
  reviewSkip() {
    const it = this.reviewItem;
    if (!it) return;
    it.result = 'skip';
    this.reviewNext();
  }
  /** «Перенести…»: the move of ТЗ 16 over the tab; Esc comes back to the same card. */
  reviewMove() {
    const it = this.reviewItem;
    const r = it && this.reviewHeading(it);
    if (r) this.refile = { from: 'review', path: r.f.path, line: r.h.line, title: r.h.title, n: Date.now() };
  }
  private reviewMoved(path: string, line: number, label: string, step: { path: string; before: string; after: string }[]) {
    const it = this.reviewItem;
    if (!it) return;
    const before = { result: it.result, note: it.note, path: it.path, line: it.line };
    const at = this.review!.cur;
    Object.assign(it, { result: 'move' as Result, note: '→ ' + label, path, line });
    this.reviewNext();
    const undo = () => void this.undoStep(step).then((ok) => { if (ok) this.reviewUndone(it, before, at); });
    this.reviewUndoLast = undo;
    this.note(`Перенесено в ${label}`, [{ label: 'Отменить', run: undo }], 4000);
  }
  /** «Открыть в файле»: the task's file at its heading, in the other pane (or a new tab), the review goes on. */
  reviewOpenInFile() {
    const it = this.reviewItem;
    const r = it && this.reviewHeading(it);
    if (!r) return;
    const here = this.layout.active;
    const p = this.layout.panes[here];
    const reviewTab = p.tabs[p.active];
    const other = this.layout.panes.length > 1 ? 1 - here : here;
    openFile(this.layout, other, r.f.path, r.h.line, { replace: false, focus: false });
    // one pane: a new tab next to the review, which stays in front
    this.layout.active = here;
    p.active = Math.max(0, p.tabs.indexOf(reviewTab));
    this.persistLayout();
  }
  /** A change on disk: tasks gone from their file leave the queue quietly; the current one says so. */
  reviewSync() {
    const r = this.review;
    if (!r || this.reviewBusy || this.refile) return;
    const cur = r.items[r.cur];
    const gone = r.items.filter((it) => (!it.result || it.result === 'skip') && !this.reviewHeading(it));
    if (!gone.length) return;
    const curGone = !!cur && gone.includes(cur);
    r.items = r.items.filter((it) => !gone.includes(it));
    const i = cur && !curGone ? r.items.indexOf(cur) : Math.min(r.cur, r.items.length) - 1;
    r.cur = i;
    if (curGone) {
      this.reviewShow(nextOpen(r.items, Math.max(-1, i)));
      this.note('Задача изменена вне приложения и пропущена');
    }
  }
  /** Tasks put into the Inbox since the review started (they wait for the next one). */
  get reviewAdded(): ReviewItem[] {
    const r = this.review;
    if (!r) return [];
    return this.reviewPending.filter((x) => !r.known.includes(x.created ?? x.title));
  }
  /** The caret in the source (if shown in the active tab) on the heading that came after the moved one, else on
   *  the one before. `movedAt`: where the heading went, when it stayed in the same file. */
  private caretAfterRefile(path: string, h: Heading, movedAt: number | null) {
    const f = this.files.find((x) => x.path === path);
    const t = this.tab;
    if (!f || t?.kind !== 'file' || t.path !== path) return;
    const m = movedAt === null ? undefined : f.headings.find((x) => x.line === movedAt);
    const size = m ? m.end - m.line : 0;
    const rest = m ? f.headings.filter((x) => x.line < m.line || x.line >= m.end) : f.headings;
    const at = m && m.line <= h.line ? h.line + size : h.line;
    this.revealLine(caretAfter(rest, at), true);
  }
  /** "Новая задача": a top-level task at the end of the current file, the caret after its keyword. */
  newTask() {
    const f = this.file;
    const t = this.tab;
    if (!f || t?.kind !== 'file') return;
    const r = appendTask(f.text, startOf(sequenceFor(f.wf, null)));
    this.setText(r.text, f.path);
    t.reveal = { line: r.line, n: Date.now(), focus: true, col: 1e9 };
  }

  /**
   * Open a file in the active pane: a tab that already shows it is reused, the active file tab is retargeted
   * (like a click in Xcode's navigator), an agenda tab keeps its place and the file opens next to it.
   */
  open(fileIdx: number, line = 0, focus = true) {
    const f = this.files[fileIdx];
    if (!f) return;
    openFile(this.layout, this.layout.active, f.path, line, { replace: true, focus });
    lsSet('lastFile:' + (this.dir ?? ''), f.path);
  }

  // ---- panes and tabs ---------------------------------------------------------------

  private layoutKey() {
    return 'layout:' + (this.dir ?? '');
  }
  persistLayout() {
    lsSet(this.layoutKey(), serialize(this.layout));
  }
  setActivePane(i: number) {
    if (i >= 0 && i < this.layout.panes.length && this.layout.active !== i) this.layout.active = i;
  }
  activateTab(pi: number, ti: number) {
    const p = this.layout.panes[pi];
    if (!p || !p.tabs[ti]) return;
    p.active = ti;
    this.layout.active = pi;
  }
  /** The editor of a tab reports its caret; leaving the heading opened from the agenda drops the caption. */
  setTabCursor(tab: Tab, line: number, col: number) {
    tab.cursor = { line, col };
    if (tab.kind === 'file' && tab.path) this.lastCursor[tab.path] = { line, col };
    if (tab.fromAgenda) {
      const f = this.fileOf(tab);
      const at = f ? headingAt(f.headings, line) : -1;
      const from = f ? headingAt(f.headings, tab.fromAgenda.line) : -1;
      if (at !== from) tab.fromAgenda = null;
    }
  }
  /** Toolbar: "Второй редактор" / "Агенда" in the second pane. */
  toggleSecond(kind: 'file' | 'agenda') {
    toggleSecond(this.layout, kind, () => {
      const t = this.tab;
      if (t?.kind === 'file') return copyTab(t);
      const anyFile = this.layout.panes.flatMap((p) => p.tabs).find((x) => x.kind === 'file');
      if (anyFile) return copyTab(anyFile);
      return this.files[0] ? newTab('file', this.files[0].path) : undefined;
    });
  }
  splitRight() {
    return splitRight(this.layout);
  }
  swapPanes() {
    swap(this.layout);
  }
  keepOnePane() {
    keepOne(this.layout);
  }
  closePane(pi: number) {
    closePane(this.layout, pi);
  }
  focusPane(dir: -1 | 1) {
    focusPane(this.layout, dir);
  }
  /** The agenda in pane `pi` opens a task: in the neighbour pane (file on the left) or in its own pane. */
  openFromAgenda(pi: number, fileIdx: number, line: number, mode: 'neighbor' | 'neighbor-focus' | 'here') {
    const f = this.files[fileIdx];
    if (!f) return;
    const h = f.headings.find((x) => x.line === line);
    openFromAgenda(this.layout, pi, f.path, line, h?.title ?? '', mode);
  }
  /** ⌘2: the agenda in the active pane; ⌘1: back to the last file tab of that pane. */
  showAgendaHere() {
    openAgenda(this.layout, this.layout.active);
  }
  showNotesHere() {
    const p = this.layout.panes[this.layout.active];
    const i = p ? p.tabs.findLastIndex((t) => t.kind === 'file') : -1;
    if (i >= 0) p.active = i;
  }
  // ---- untitled tabs, closing, moving ------------------------------------------------

  /** Statuses for text that has no file yet: the project's, as a file without #+TODO would get. */
  get untitledWf() {
    return resolveWorkflow('', UNTITLED + '.org', this.config);
  }
  /** A new note with text in it (spaces and blank lines do not count), or a file whose text is not on disk yet. */
  isUnsaved(t: Tab | undefined) {
    if (!t) return false;
    if (t.kind === 'untitled') return !!t.text?.trim();
    const f = t.kind === 'file' ? this.files.find((x) => x.path === t.path) : undefined;
    return !!f && f.text !== f.disk;
  }
  hasUnsaved() {
    return this.layout.panes.some((p) => p.tabs.some((t) => this.isUnsaved(t)));
  }
  /** Double click on the free part of a tab row. */
  newUntitled(pi: number) {
    const t = newUntitled(this.layout, pi);
    t.reveal = { line: 0, n: Date.now(), focus: true };
    return t;
  }
  private where(t: Tab): [number, number] {
    for (let pi = 0; pi < this.layout.panes.length; pi++) {
      const ti = this.layout.panes[pi].tabs.indexOf(t);
      if (ti >= 0) return [pi, ti];
    }
    // $state proxies: compare by id
    for (let pi = 0; pi < this.layout.panes.length; pi++) {
      const ti = this.layout.panes[pi].tabs.findIndex((x) => x.id === t.id);
      if (ti >= 0) return [pi, ti];
    }
    return [-1, -1];
  }
  /**
   * What closing the tabs `ts` would lose, in the order of the window (left pane first, left to right).
   * Files save themselves half a second after an edit, so a write that is only waiting goes out now; a file is
   * listed only when that write fails, and only when its last tab is among the closing ones (the same file in
   * the other pane keeps the text). New notes with text are always listed.
   */
  private async unsavedOf(ts: Tab[]): Promise<Unsaved[]> {
    const closing = new Set(ts.map((t) => t.id));
    const order = this.layout.panes.flatMap((p) => p.tabs).filter((t) => closing.has(t.id));
    const openElsewhere = (path: string) => this.layout.panes.some((p) => p.tabs.some((t) => t.kind === 'file' && t.path === path && !closing.has(t.id)));
    const paths = [...new Set(order.flatMap((t) => (t.kind === 'file' && t.path && !openElsewhere(t.path) ? [t.path] : [])))];
    for (const path of paths) {
      const f = this.files.find((x) => x.path === path);
      if (!f || f.text === f.disk || this.conflicts[path]) continue;
      clearTimeout(this.timers.get(path));
      this.timers.delete(path);
      await this.save(path);
    }
    const out: Unsaved[] = [];
    const seen = new Set<string>();
    for (const t of order) {
      if (t.kind === 'untitled' && t.text?.trim()) out.push({ tab: t, kind: 'note', name: noteName(t.text) });
      if (t.kind !== 'file' || !t.path || !paths.includes(t.path) || seen.has(t.path)) continue;
      seen.add(t.path); // listed and counted once, whichever pane
      const f = this.files.find((x) => x.path === t.path) ?? this.orphans[t.path];
      if (f && f.text !== f.disk) out.push({ tab: t, kind: 'file', name: displayName(f.name) });
    }
    return out;
  }
  /**
   * Ask before tabs go away. True when they may close: nothing would be lost, "Не сохранять", or everything was
   * saved. "Сохранить всё" writes the files, then opens "Сохранить как" for each new note in turn; a cancel or a
   * failed write stops there and nothing closes (what was saved stays open, without its dot).
   */
  async confirmClose(ts: Tab[]): Promise<boolean> {
    if (this.sheetOpen) return false; // a second ⌘W while the sheet is up does nothing
    const items = await this.unsavedOf(ts);
    if (!items.length) return true;
    if (items.length === 1) {
      const [pi, ti] = this.where(items[0].tab);
      items[0].tab.reveal = null;
      if (pi >= 0) this.activateTab(pi, ti); // show what the question is about
    }
    const answer = await new Promise<'save' | 'discard' | 'cancel'>((resolve) => (this.unsavedReq = { items, resolve }));
    this.unsavedReq = null;
    if (answer === 'cancel') return false;
    if (answer === 'discard') {
      for (const it of items) if (it.kind === 'file') this.revert(it.tab.path!);
      return true;
    }
    for (const it of items.filter((x) => x.kind === 'file')) {
      const path = it.tab.path!;
      if (this.orphans[path]) {
        if (!(await this.recreate(path))) return false;
        continue;
      }
      // an unresolved conflict asks which version first; Esc stops the closing
      if (this.conflicts[path]) {
        const a = await this.askChanged(path);
        if (a === 'later') return false;
        if (a === 'disk') continue;
      }
      const err = await this.save(path);
      if (err) {
        await new Promise<void>((resolve) => (this.errorReq = { title: `Не удалось сохранить «${it.name}»`, text: err[0].toUpperCase() + err.slice(1) + '. Текст остался в редакторе.', resolve }));
        this.errorReq = null;
        return false;
      }
    }
    for (const it of items.filter((x) => x.kind === 'note')) {
      const [pi, ti] = this.where(it.tab);
      it.tab.reveal = null; // shown, not focused: the keyboard stays with the sheet
      if (pi >= 0) this.activateTab(pi, ti);
      if (!(await this.saveAs(it.tab))) return false;
    }
    return true;
  }
  /** "Не сохранять" on a file: the text goes back to what is on disk. */
  private revert(path: string) {
    clearTimeout(this.timers.get(path));
    this.timers.delete(path);
    this.files = this.files.map((f) => (f.path === path ? build(f.name, f.path, f.disk, f.disk, f.diskRaw, f.eol, this.config) : f));
  }
  async closeTab(pi: number, ti: number) {
    const t = this.layout.panes[pi]?.tabs[ti];
    if (!t || !(await this.confirmClose([t]))) return;
    const [p2, t2] = this.where(t);
    if (p2 >= 0) closeTab(this.layout, p2, t2);
  }
  async closeActiveTab() {
    const p = this.layout.panes[this.layout.active];
    if (p?.tabs.length) await this.closeTab(this.layout.active, p.active);
  }
  /** "Закрыть остальные": one question about the others (the kept tab is not in it, whatever its state). */
  async closeOthers(pi: number, ti: number) {
    const keep = this.layout.panes[pi]?.tabs[ti];
    if (!keep) return;
    const others = othersOf(this.layout, pi, ti);
    if (!(await this.confirmClose(others))) return;
    for (const t of others) {
      const [p2, t2] = this.where(t);
      if (p2 >= 0) closeTab(this.layout, p2, t2);
    }
    const [p3, t3] = this.where(keep);
    if (p3 >= 0) this.activateTab(p3, t3);
  }
  moveTab(pi: number, ti: number) {
    moveTab(this.layout, pi, ti);
  }
  duplicateTab(pi: number, ti: number) {
    duplicateTab(this.layout, pi, ti);
  }
  /** Shortcut variant: only when the neighbour is on that side. */
  tabToSide(dir: -1 | 1, duplicate: boolean) {
    const pi = this.layout.active;
    const to = targetOf(this.layout, pi);
    if (to < 0 || Math.sign(to - pi) !== dir) return;
    const ti = this.layout.panes[pi].active;
    if (duplicate) this.duplicateTab(pi, ti);
    else this.moveTab(pi, ti);
  }
  revealInNavigator(t: Tab | undefined) {
    if (t?.kind !== 'file' || !t.path) return;
    this.showNav = true;
    this.navReveal = { path: t.path, n: Date.now() };
  }
  async copyPath(t: Tab | undefined) {
    if (t?.kind !== 'file' || !t.path) return;
    try {
      await navigator.clipboard.writeText(t.path);
      this.say('Путь скопирован');
    } catch (e) {
      this.say('Не удалось скопировать путь: ' + e);
    }
  }
  /** ⌘S: a tab without a file opens "Сохранить как…"; files are saved on their own anyway. */
  async saveActive() {
    const t = this.tab;
    if (t?.kind === 'untitled') return void (await this.saveAs(t));
    const path = t?.kind === 'file' ? t.path ?? '' : '';
    const c = this.conflicts[path];
    if (c) {
      // ⌘S on an unresolved conflict asks first and writes nothing
      this.conflicts = { ...this.conflicts, [path]: { ...c, postponed: false } };
      return void this.pumpDisk();
    }
    if (this.orphans[path]) return void (await this.recreate(path));
    await this.flush();
  }
  /** ⌘S on a file gone from disk: write it again at its old path (no folder there any more: «Сохранить как…»). */
  private async recreate(path: string): Promise<boolean> {
    const o = this.orphans[path];
    if (!o) return true;
    const dir = o.name.includes('/') ? o.name.slice(0, o.name.lastIndexOf('/')) : '';
    try {
      await invoke<string>('save_new_file', { parent: this.abs(dir), name: o.name.split('/').pop()!, text: joinEol(o.text, o.eol), overwrite: false });
      const rest = { ...this.orphans };
      delete rest[path];
      this.orphans = rest; // the reload below finds the file again
      this.files = [...this.files, { ...o, disk: o.text, diskRaw: joinEol(o.text, o.eol) }];
      await this.reload();
      return true;
    } catch {
      const [pi, ti] = this.whereFile(path);
      const t = this.layout.panes[pi]?.tabs[ti];
      return t ? this.saveAs(t) : false;
    }
  }
  /** What "Сохранить как…" writes: a new note's text, or the text of a file gone from disk. */
  textOf(t: Tab) {
    return t.kind === 'untitled' ? (t.text ?? '') : (this.orphans[t.path ?? '']?.text ?? '');
  }
  /** Opens the "Сохранить как…" sheet; resolves true once the text is on disk. */
  saveAs(t: Tab): Promise<boolean> {
    return new Promise<boolean>((resolve) => (this.saveAsReq = { tab: t, resolve }));
  }
  finishSaveAs(saved: boolean) {
    const r = this.saveAsReq;
    this.saveAsReq = null;
    r?.resolve(saved);
  }
  /**
   * Write an untitled tab's text as a new file. 'exists' asks the sheet to confirm a replacement.
   * On success the tab becomes an ordinary file tab, the file shows up (and is marked) in the navigator.
   */
  async commitSaveAs(t: Tab, dirRel: string, name: string, overwrite: boolean): Promise<'ok' | 'exists' | string> {
    try {
      const path = isTauri
        ? await invoke<string>('save_new_file', { parent: this.abs(dirRel), name, text: this.textOf(t), overwrite })
        : `${dirRel ? dirRel + '/' : ''}${withOrg(name)}`;
      lsSet('saveAsDir:' + (this.dir ?? ''), dirRel);
      if (isTauri) await this.reload();
      else this.files = [...this.files, fromDisk({ name: path, path, text: this.textOf(t) }, this.config)].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      if (t.kind === 'file' && t.path && this.orphans[t.path]) {
        // a file gone from disk, saved under a new name: every tab of it follows
        const from = t.path;
        const rest = { ...this.orphans };
        delete rest[from];
        this.orphans = rest;
        mapPaths(this.layout, (p) => (p === from ? path : p));
      }
      t.kind = 'file';
      t.path = path;
      t.title = undefined;
      t.text = undefined;
      t.reveal = null; // the caret stays where it was
      this.navReveal = { path, n: Date.now() };
      return 'ok';
    } catch (e) {
      const m = String(e);
      if (m.includes('exists')) return 'exists';
      return m.includes('bad name') ? 'Недопустимое имя: без «/», «:» и точки в начале' : 'Не удалось сохранить: ' + m;
    }
  }
  /** "Новая папка" in the save sheet; returns its relative path. */
  async createFolder(parentRel: string, name: string): Promise<string | null> {
    try {
      const path = await invoke<string>('create_entry', { parent: this.abs(parentRel), name, isDir: true });
      await this.reload();
      return path.slice((this.dir ?? '').length + 1);
    } catch (e) {
      this.sayDraft(this.errorText(e)); // it comes from the save sheet
      return null;
    }
  }
  /** ⌘Q, ⌘⇧W, the red button: one question about the unsaved tabs of both panes. */
  async quit() {
    if (!(await this.confirmClose(this.layout.panes.flatMap((p) => p.tabs)))) return;
    await this.flush();
    if (isTauri) await invoke('quit_app');
  }

  /** Not enough room for two panes: the second one becomes tabs of the first. */
  mergePanes() {
    closePane(this.layout, 1);
  }


  // ---- file operations ----------------------------------------------------------

  get canManageFiles() {
    return isTauri && !!this.dir;
  }
  /** The app runs but no notes folder is chosen yet. */
  get needsFolder() {
    return isTauri && !this.dir;
  }

  abs(rel: string) {
    return rel ? `${this.dir}/${rel}` : this.dir!;
  }

  private errorText(e: unknown) {
    const m = String(e);
    if (m.includes('exists')) return 'Файл или папка с таким именем уже существует';
    if (m.includes('bad name')) return 'Недопустимое имя: без «/», «:», пустое имя и точки в начале';
    if (m.includes('into itself')) return 'Нельзя переместить папку внутрь самой себя';
    return 'Операция не удалась: ' + m;
  }

  /** Make sure nothing unsaved is lost before a file moves or disappears. */
  private async flush() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const f of this.files.filter((x) => x.text !== x.disk && !this.conflicts[x.path])) await this.save(f.path);
  }

  async createEntry(parentRel: string, name: string, kind: 'file' | 'folder') {
    this.creating = null;
    if (!name.trim()) return;
    try {
      await this.flush();
      const path = await invoke<string>('create_entry', { parent: this.abs(parentRel), name, isDir: kind === 'folder' });
      await this.reload();
      if (kind === 'file') {
        const i = this.files.findIndex((f) => f.path === path);
        if (i >= 0) this.open(i, 0);
      }
    } catch (e) {
      this.say(this.errorText(e));
    }
  }

  async renameEntry(rel: string, newName: string) {
    this.renaming = null;
    const base = rel.split('/').pop()!;
    if (!newName.trim() || newName.trim() === base || newName.trim() + '.org' === base) return;
    await this.relocate(rel, (path) => invoke<string>('rename_entry', { path, newName }));
  }

  async moveEntry(rel: string, destRel: string) {
    const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    if (parent === destRel) return;
    await this.relocate(rel, (path) => invoke<string>('move_entry', { path, dest: this.abs(destRel) }));
  }

  async deleteEntry(rel: string) {
    this.dialog = null;
    try {
      await this.flush();
      const abs = this.abs(rel);
      await invoke('trash_entry', { path: abs });
      dropMissing(this.layout, (p) => p !== abs && !p.startsWith(abs + '/')); // deleted here: its tabs go too
      await this.reload();
      this.say('Перемещено в Корзину');
    } catch (e) {
      this.say(this.errorText(e));
    }
  }

  async revealEntry(rel: string) {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
    await revealItemInDir(this.abs(rel));
  }

  /** Rename/move one entry, then repair `file:` links everywhere that pointed into it. */
  private async relocate(rel: string, op: (absPath: string) => Promise<string>) {
    try {
      await this.flush();
      const oldAbs = this.abs(rel);
      const newAbs = await op(oldAbs);
      const oldPaths = this.files.map((f) => f.path);
      const map = mapperFor(oldAbs, newAbs);

      // current file / history follow the move (before reload, which would otherwise fall back to the first file)
      mapPaths(this.layout, map); // tabs in both panes follow the move
      this.history = this.history.map((h) => ({ ...h, path: map(h.path) }));
      lsSet('lastFile:' + (this.dir ?? ''), this.curPath);
      await this.reload();

      // every note: its own old location (it may have moved too) -> rewrite its file links
      let links = 0;
      let notes = 0;
      const inverse = new Map<string, string>();
      for (const oldPath of oldPaths) {
        const np = map(oldPath);
        if (np !== oldPath) inverse.set(np, oldPath);
      }
      for (const f of this.files) {
        const oldPath = inverse.get(f.path) ?? f.path;
        const r = rewriteFileLinks(f.text, oldPath, f.path, map);
        if (r.count > 0) {
          this.setText(r.text, f.path);
          links += r.count;
          notes++;
        }
      }
      if (links > 0) this.say(`Обновлено ссылок: ${links} (в заметках: ${notes})`);
    } catch (e) {
      this.say(this.errorText(e));
    }
  }

  /** Open another place and remember where we came from (⌘[ goes back). */
  jump(fileIdx: number, line = 0) {
    const f = this.file;
    if (f) this.history = [...this.history.slice(-49), { path: f.path, line: this.cursor.line }];
    this.open(fileIdx, line);
  }

  back() {
    const last = this.history[this.history.length - 1];
    if (!last) return;
    this.history = this.history.slice(0, -1);
    const i = this.files.findIndex((f) => f.path === last.path);
    if (i >= 0) this.open(i, last.line);
  }

  follow(link: OrgLink) {
    if (!this.file) return;
    const t = resolveLink(link, this.cur, this.files);
    if (t.kind === 'url') {
      openExternal(t.url).catch((e) => this.say('Не удалось открыть ссылку: ' + e));
    } else if (t.kind === 'missing') {
      this.say(`Не найдено: ${t.what}`);
    } else {
      this.jump(t.file, t.line ?? 0);
      if (t.missingSection) this.say(`Раздел «${t.missingSection.replace(/^[*#]/, '')}» не найден — открыт файл целиком`);
    }
  }

  private scheduleSave(path: string) {
    if (!isTauri || this.conflicts[path]) return; // a conflict waits for the user's choice
    this.saveState = 'saving';
    clearTimeout(this.timers.get(path));
    this.timers.set(path, setTimeout(() => this.save(path), 500));
  }

  /** Write a file; resolves to the reason it failed, or null. */
  private async save(path: string): Promise<string | null> {
    if (this.conflicts[path]) return CONFLICT; // never over a version the user has not seen
    const f = this.files.find((x) => x.path === path);
    if (!f || f.text === f.disk) {
      this.saveState = 'saved';
      return null;
    }
    const text = f.text;
    const out = joinEol(text, f.eol);
    let failure: unknown = null;
    this.saving++;
    try {
      await invoke('save_org_file', { path, text: out, base: f.diskRaw });
      this.writes++;
      this.files = this.files.map((x) => (x.path === path ? { ...x, disk: text, diskRaw: out } : x));
    } catch (e) {
      failure = e;
    } finally {
      this.saving--;
    }
    if (failure) {
      this.saveState = 'saved';
      if (String(failure) === 'conflict') {
        // the file changed since we read it (and no event told us yet): read it, the user decides
        await this.reload();
        if (!this.conflicts[path]) {
          const now = this.files.find((x) => x.path === path);
          if (now && now.text !== now.disk) this.scheduleSave(path);
          return null;
        }
        queueMicrotask(() => this.pumpDisk());
        return CONFLICT;
      }
      this.say('Не удалось сохранить: ' + failure);
      return String(failure);
    }
    // typed more while the write was in flight: keep going
    const now = this.files.find((x) => x.path === path);
    if (now && now.text !== now.disk) this.scheduleSave(path);
    else this.saveState = 'saved';
    return null;
  }
}

export const DEFAULT_CAPTURE_KEY = 'Shift+CmdOrCtrl+KeyI';
export interface GoalReviewState {
  key: string;
  items: { title: string; q: Quarter }[];
  cur: number; // −1: «Разбор закончен»
  marks: number;
  closed: number;
  moved: number;
  draft: string; // the new mark
  date: Date | null; // its day; null = today
}
/** A source of goals as the views use it. */
export interface GoalPerson {
  src: GoalSource;
  key: string;
  file: NoteFile | undefined;
  data: SourceGoals;
  found: boolean; // the file and its heading are there
  ini: string;
  color: string;
  name: string; // «Мои цели» for mine
}
export const SECTIONS = ['Основные', 'Статусы', 'Теги', 'Агенды', 'Календарь', 'Inbox', 'Файлы', 'Клавиши'] as const;
export type SettingsSection = (typeof SECTIONS)[number];
export type NavMode = 'files' | 'inbox' | 'agendas' | 'goals' | 'search';
/** The search in every file: up to this many matches are listed. */
export const SEARCH_CAP = 1000;
export interface SearchGroup {
  path: string;
  name: string; // relative
  hits: Hit[];
  open: boolean; // its results shown
  all: boolean; // «Ещё N» opened: every result, not the first 4
  stamp: string; // the text searched: the file changed since when it differs
}
export interface SearchState {
  q: string; // the field
  ran: string; // the query of the results shown
  scope: Scope;
  running: boolean;
  groups: SearchGroup[];
  total: number;
  capped: boolean; // more than SEARCH_CAP: only the first shown
  scanned: number; // files looked at so far
  sel: { g: number; i: number } | null;
  focusN: number; // bumped: the field takes the focus
}
export type Scan = { name: string; path: string; shown: string; org: number; folders: number; other: number; capped: boolean; big: boolean };
export type StartScreen = { kind: 'welcome' } | { kind: 'found'; path: string; scan: Scan | null; change: boolean } | { kind: 'missing'; path: string } | null;
export type Unsaved = { tab: Tab; kind: 'file' | 'note'; name: string };
export type Conflict = { path: string; name: string; disk: string; diskRaw: string; eol: Eol; mtime: number; postponed: boolean };
export type DiskAnswer = 'disk' | 'mine' | 'later' | 'saveas' | 'keep' | 'close';
const CONFLICT = 'файл на диске изменён другой программой';

export const store = new Store();
