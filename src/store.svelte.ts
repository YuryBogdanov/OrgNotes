import {
  activeTab, addPane, closePane, closeTab, dropMissing, emptyLayout, focusPane, keepOne, mapPaths, newTab, openAgenda,
  openFile, openFromAgenda, pinFirst, restore, serialize, splitRight, swap, toggleSecond, copyTab, type Layout, type Tab,
  newUntitled, moveTab, duplicateTab, othersOf, targetOf, UNTITLED,
} from './layout';
import { mapperFor, resolveLink, rewriteFileLinks, type OrgLink } from './links';
import { displayName, noteName, withOrg } from './names';
import { appendTask, setPlanning, setTags, weekdayNames } from './edits';
import { bareTitle, caretAfter, keyOf, moveTo, moveWithin } from './refile';
import type { CalSpec, Plate } from './commands';
import { searchFile, type Hit, type Scope } from './search';
import { DEFAULT_LEVELS, type LevelView } from './orgIndent';
import { DEFAULT_INBOX, append, entry, prepend, readInbox, withInbox, type InboxConfig } from './inbox';
import { cloneAgenda, newAgenda, readAgendas, sameAgenda, withAgendas, type Agenda } from './agendas';
import { cachedTheme, effective, readChoice, readThemeNames, saveChoice, saveThemeName, systemDark as isSystemDark, themeNamed } from './appearance';
import { BUILTIN, DEFAULT_THEME, builtinFor, copyOf, parseTheme, themeFile, themeJson, uniqueName, type Appearance, type AppearanceChoice, type Theme } from './themes';
import { navOf, viewOf } from './views';
import { mini as miniSettings } from './miniOptions.svelte';
import { Journal, Tx, canUndo, type HeadingRef, type Step } from './journal';
import { bindingsOf, fromAccelerator, parseState, toAccelerator, withKeys, DEFAULT_STATE, type KeyState, type Preset } from './keys';
import { DEFAULT_SEQUENCE, EMPTY_CONFIG, firstDone, headingAt, joinEol, parseHeadings, parseProjectConfig, resolveWorkflow, setKeyword, setPriority, sequenceFor, splitEol, startOf, type Eol, type Heading, type ProjectConfig, type Workflow, type WorkflowDef } from './org';

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
/** The note of the mini window (ТЗ 31): a heading of a file (by its title near its line), or the file whole. */
export interface MiniNote {
  path: string; // the file's name in the notes folder
  line: number;
  title: string;
  whole?: boolean;
}
interface MiniSnapshot {
  dir: string | null;
  configRaw: string | null;
  note: MiniNote | null;
  files: { name: string; path: string; text: string; disk: string; diskRaw: string; eol: string }[];
}
function lsGetJson<T>(k: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null');
  } catch {
    return null;
  }
}

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
export type PaletteStart = 'newFile' | 'newFolder' | 'goto' | 'status' | 'priority' | 'schedule' | 'deadline' | 'tags' | 'calendar' | 'step';
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
  settingsSection = $state<SettingsSection>(lsGet('settings:section') || 'Основные'); // one that is not there: «Основные»
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
  /** Sheets of the features (registered by them): while one is open, the window's other sheets and keys wait. */
  private sheetChecks = $state.raw<(() => boolean)[]>([]);
  addSheet(open: () => boolean) {
    this.sheetChecks = [...this.sheetChecks, open];
  }
  get sheetOpen() {
    return !!(this.unsavedReq || this.saveAsReq || this.errorReq || this.palette || this.diskReq || this.builder || this.capture || this.refile || this.pickInbox || this.settingsOpen || this.sheetChecks.some((f) => f()));
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
  /** The palette at a step a plugin made (`ui.choose`, ТЗ 27). */
  stepReq: import('./commands').Step | null = null;
  openStep(step: import('./commands').Step) {
    this.stepReq = step;
    this.openPalette('step');
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
    const v = viewOf(t?.kind);
    const path = v?.fileOf ? (v.fileOf(t!) ?? '') : this.curPath; // a review: the card's file
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

  /** The project config as parsed last, for the features' own keys (`onConfig`, and their settings saved there
   *  before roadmap 0.6). */
  private parsedConfig = $state.raw<any>(null);
  private configHooks: ((parsed: any) => void)[] = [];
  /** A feature reads its keys of config.json: now, and every time it is read again. */
  onConfig(fn: (parsed: any) => void) {
    this.configHooks.push(fn);
    fn(this.parsedConfig);
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
    this.parsedConfig = parsed;
    for (const fn of this.configHooks) fn(parsed);
    this.baseConfig = config;
    const withSets = this.withFeatureSets(config);
    // only the statuses make the notes be read again; agendas alone do not
    const same = JSON.stringify(withSets) === JSON.stringify(this.config);
    this.config = withSets;
    if (warnings.length) this.say('.orgnotes/config.json: ' + warnings[0] + (warnings.length > 1 ? ` (и ещё ${warnings.length - 1})` : ''));
    return !same;
  }

  // ---- what features keep and register (roadmap 0.6) -----------------------------------------------------------
  /** Sets of statuses of the features (the goals' «Цели на квартал»): in memory while the feature is on, never
   *  written to config.json; `when` says whether the project needs it (no set knows ACTIVE yet, say). */
  private featureSets: { id: string; def: WorkflowDef; when?: (defs: WorkflowDef[]) => boolean }[] = [];
  registerStatusSet(id: string, def: WorkflowDef, when?: (defs: WorkflowDef[]) => boolean) {
    const s = { id, def, when };
    this.featureSets.push(s);
    return () => {
      this.featureSets = this.featureSets.filter((x) => x !== s);
      this.refreshStatusSets();
    };
  }
  /** The project's config as written (the features' sets not added). */
  private baseConfig: ProjectConfig = EMPTY_CONFIG;
  /** A feature's `when` may have changed (goals added): the sets again, the notes read again if they did. */
  refreshStatusSets() {
    const next = this.withFeatureSets(this.baseConfig);
    if (JSON.stringify(next) === JSON.stringify(this.config)) return;
    this.config = next;
    this.rebuildAll();
  }
  private withFeatureSets(c: ProjectConfig): ProjectConfig {
    const add = this.featureSets.filter((x) => !x.when || x.when(c.workflows)).map((x) => ({ ...x.def, feature: x.id }));
    if (!add.length) return c;
    // a project without sets of its own works with «Задачи»: it stays the first (the default one)
    return { ...c, workflows: [...(c.workflows.length ? c.workflows : [DEFAULT_SEQUENCE]), ...add] };
  }

  /**
   * A feature's own settings (roadmap 0.6): what describes the files and the team's ways (the goals' sources, the
   * calendar's files) in the notes folder, `.orgnotes/plugins/<id>.json`, going along with the files; what is
   * personal on this Mac. Before 0.6 they were keys of config.json: read from there until written anew.
   */
  private storages = new Map<string, StorageSpec>();
  /** The folder's files of the features, as read (undefined: there is none yet). */
  private featureFiles = $state<Record<string, unknown>>({});
  registerStorage(id: string, o: StorageSpec = {}) {
    this.storages.set(id, o);
  }
  hasStorage(id: string) {
    return this.storages.has(id);
  }
  /** config.json still has the feature's old keys (its file is not written yet). */
  hasLegacy(id: string) {
    return (this.storages.get(id)?.legacyKeys ?? []).some((k) => hasPath(this.parsedConfig, k));
  }
  /** The feature's settings in the notes folder (its file, else what config.json had before 0.6). */
  folderData(id: string): unknown {
    const s = this.storages.get(id);
    if (!(id in this.featureFiles)) return s?.legacy?.(this.parsedConfig);
    const v = this.featureFiles[id];
    return s?.upgrade ? s.upgrade(v, 'folder') : v;
  }
  async setFolderData(id: string, value: unknown): Promise<boolean> {
    const text = JSON.stringify(value, null, 2) + '\n';
    try {
      if (isTauri) await invoke('write_feature_file', { id, text });
    } catch (e) {
      this.say('Не удалось сохранить настройки: ' + e);
      return false;
    }
    this.featureFiles = { ...this.featureFiles, [id]: value };
    this.refreshStatusSets();
    // moved: the old keys leave config.json (the file is the place now)
    const keys = (this.storages.get(id)?.legacyKeys ?? []).filter((k) => hasPath(this.parsedConfig, k));
    if (keys.length)
      await this.updateConfig((raw) => {
        try {
          const p = raw ? JSON.parse(raw) : {};
          for (const k of keys) dropPath(p, k);
          return JSON.stringify(p, null, 2) + '\n';
        } catch {
          return raw ?? '';
        }
      });
    return true;
  }
  /** One feature's file read now (a plugin turned on after the folder was read). */
  async readFeatureFile(id: string) {
    if (!isTauri || id in this.featureFiles) return;
    try {
      const t = await invoke<string | null>('read_feature_file', { id });
      if (t !== null) this.featureFiles = { ...this.featureFiles, [id]: JSON.parse(t) };
    } catch {
      /* unreadable: as if there were none */
    }
  }
  private async readFeatureFiles() {
    const out: Record<string, unknown> = {};
    if (isTauri)
      for (const id of this.storages.keys()) {
        try {
          const t = await invoke<string | null>('read_feature_file', { id });
          if (t !== null) out[id] = JSON.parse(t);
        } catch {
          /* unreadable: as if there were none */
        }
      }
    this.featureFiles = out;
  }
  /** The feature's personal settings on this Mac (else what `legacy` gives: config.json before 0.6). */
  localData(id: string): unknown {
    void this.localTick;
    const raw = lsGet('feature:' + id);
    const s = this.storages.get(id);
    if (raw !== null) {
      try {
        const v = JSON.parse(raw);
        return s?.upgrade ? s.upgrade(v, 'local') : v;
      } catch {
        /* the default */
      }
    }
    return s?.localLegacy?.(this.parsedConfig);
  }
  private localTick = $state(0);
  setLocalData(id: string, value: unknown) {
    lsSet('feature:' + id, JSON.stringify(value));
    this.localTick++;
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
    this.themeEditing = null;
  }
  showSection(section: SettingsSection) {
    if (section !== this.settingsSection) this.themeEditing = null;
    this.settingsSection = section;
    lsSet('settings:section', section);
  }

  // ---- keyboard shortcuts (ТЗ «раздел „Клавиши“»): a set of defaults and the changes on top, on this Mac ----------
  keyState = $state<KeyState>(parseState(lsGet('keys')));
  /** Every command's shortcuts now; the quick entry's is its own setting (it is registered with the system). */
  /** The registry of commands changed (a plugin turned on or off): the shortcuts again. */
  keysVersion = $state(0);
  bindings = $derived.by(() => {
    void this.keysVersion;
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
  /** A feature's scope of keys (keys.ts `registerScope`) runs its commands while its tab is shown (⌘1…⌘5 of a
   *  review win over the window's): set by the tab, taken away when it goes. */
  scopeKeys = new Map<string, ScopeKeys>();
  setScopeKeys(scope: string, keys: ScopeKeys | null) {
    if (keys) this.scopeKeys.set(scope, keys);
    else this.scopeKeys.delete(scope);
  }

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
  // a feature's mode that is not there falls back to «Файлы» (NavPanel); «Цели» became the plugin «quarter-goals» (ТЗ 27)
  navMode = $state<NavMode>(((m) => (m === 'goals' ? 'quarter-goals' : m))(lsGet('nav:mode')) || 'files');
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
  /** A file of the folder, made empty when it is not there yet (the journal of «Завершить день»); none if it failed. */
  async ensureFile(rel: string): Promise<NoteFile | undefined> {
    const have = this.files.find((f) => f.name === rel);
    if (have) return have;
    const i = rel.lastIndexOf('/');
    try {
      await this.flush();
      if (isTauri) await invoke<string>('create_entry', { parent: this.abs(i < 0 ? '' : rel.slice(0, i)), name: rel.slice(i + 1), isDir: false });
      await this.reload();
    } catch (e) {
      if (!String(e).includes('exist')) {
        this.say(`Не удалось создать «${rel}»: ${e}`);
        return undefined;
      }
    }
    return this.files.find((f) => f.name === rel);
  }
  /** Write a file now (not after the autosave pause): unsaved edits of its tab go along. Null, or why it failed. */
  async writeNow(path: string, text: string): Promise<string | null> {
    this.setText(text, path);
    clearTimeout(this.timers.get(path));
    this.timers.delete(path);
    if (!isTauri) return null;
    return this.save(path);
  }
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
  // ---- the journal of edits (roadmap 0.1): what features write is a transaction and a step of one ⌘Z ------------
  private journal = new Journal();
  /**
   * Build a transaction, write its files at once and record it as a step; `onUndo` puts the feature's own state
   * back when the step is taken back. Null: nothing changed, a heading was not found (said), or a write failed (said).
   */
  async transaction(label: string, build: (tx: Tx) => void, onUndo?: () => void): Promise<Step | null> {
    const tx = new Tx((path) => {
      const f = this.files.find((x) => x.path === path);
      return f && { path: f.path, text: f.text, wf: f.wf };
    });
    build(tx);
    if (tx.conflict || tx.error) {
      this.say(tx.conflict ? 'Не удалось: заголовок изменился или пропал' : 'Не удалось: ' + tx.error);
      return null;
    }
    const steps = tx.result();
    if (!steps.length) return null;
    const done = await this.writeSteps(steps);
    return done ? this.journal.record(label, done, onUndo) : null;
  }
  /** Texts the feature has made itself, as one transaction. */
  writeAll(label: string, texts: { path: string; text: string }[], onUndo?: () => void): Promise<Step | null> {
    return this.transaction(label, (tx) => texts.forEach((x) => tx.update(x.path, () => x.text)), onUndo);
  }
  /** Take a step back, if its files were not changed since (the toast's «Отменить»). */
  async undo(step: Step): Promise<boolean> {
    if (!this.journal.has(step)) return false;
    if (!canUndo(step, (p) => this.files.find((x) => x.path === p)?.text)) {
      this.say('Отменить нельзя: файл уже изменился');
      return false;
    }
    for (const c of [...step.changes].reverse()) await this.writeNow(c.path, c.before);
    this.journal.drop(step);
    step.onUndo?.();
    return true;
  }
  /** ⌘Z outside a text editor: the last step, wherever it was made. False: there is none (or it cannot be). */
  async undoLast(): Promise<boolean> {
    const s = this.journal.last();
    return s ? this.undo(s) : false;
  }
  /** Quick entry: a task at the top or the end of the Inbox file (as set), on disk at once. */
  async addToInbox(title: string, details: string): Promise<'ok' | 'nofile' | 'empty' | 'error'> {
    if (!title.trim()) return 'empty';
    const f = this.inboxFile;
    if (!f) return 'nofile';
    const status = this.inboxCfg.status && f.wf.open.includes(this.inboxCfg.status) ? this.inboxCfg.status : startOf(sequenceFor(f.wf, null));
    const task = entry(title, details, status, this.inboxCfg.created ? new Date() : null);
    const add = this.inboxCfg.add === 'end' ? append : prepend;
    return (await this.transaction('Новая задача в Inbox', (tx) => tx.update(f.path, (t) => add(t, task)))) ? 'ok' : 'error';
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
  /** The mini window's system-wide shortcut (ТЗ 31; ⌃⌥⌘M: ⌃⌥Space switches the input source on macOS), as set in
   *  «Клавиши»: registered again when it changes; one taken by another program is said. */
  private miniKeyNow: string | null = null;
  async applyMiniKey(): Promise<string | null> {
    if (!isTauri) return null;
    const accelerator = toAccelerator(this.bindings.get('miniShow')?.[0] ?? '') ?? '';
    if (accelerator === this.miniKeyNow) return null;
    this.miniKeyNow = accelerator;
    try {
      await invoke('set_mini_shortcut', { accelerator });
      return null;
    } catch (e) {
      this.say('Сочетание мини-окна занято другой программой: ' + e);
      return String(e);
    }
  }
  /** «Мини-окно: показать»: shown with the keys in it (or the keys back to the program before). */
  toggleMini() {
    if (isTauri) void invoke('mini_toggle').catch(() => {});
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
    await this.readFeatureFiles(); // first: a feature's set of statuses may depend on them
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
      if (!o) return (this.diskTaken.add(n.name), fromDisk(n, this.config));
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
      this.diskTaken.add(o.name);
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
  /** The files just taken from disk (their names): the plugins' «file.changed» says «disk» for them, then forgets. */
  diskTaken = new Set<string>();

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

  // ---- the mini window (ТЗ 31): one state of the files in two windows ----------------------------------------------
  // The main window owns the files (it reads, watches and writes them); the mini window mirrors them: it gets them
  // all at its start, sends its edits here, and gets every change of another (typed here, from disk) back.
  /** This store is the mini window's: no disk of its own, its edits go to the main window. */
  mirror = false;
  /** The note of the mini window (shown in it, or for its next show): a heading, or the file whole. */
  miniNote = $state<MiniNote | null>(lsGetJson<MiniNote>('mini:note'));
  /** The main window: the text the mini window has of each file (sent or got from it); null — no mini window yet. */
  private mini: Map<string, string> | null = null;
  private async emitMini(event: string, payload: unknown) {
    if (!isTauri) return;
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo(this.mirror ? 'main' : 'mini', event, payload).catch(() => {});
  }
  /** The main window: the files and the statuses the mini window's snapshot had. */
  private miniPaths = '';
  private miniCfg: string | null = null;
  private snapshot() {
    this.mini = new Map(this.files.map((f) => [f.path, f.text]));
    this.miniPaths = this.files.map((f) => f.path).join('\n');
    this.miniCfg = this.configRaw;
    return { dir: this.dir, configRaw: this.configRaw, note: this.miniNote, files: this.files.map((f) => ({ name: f.name, path: f.path, text: f.text, disk: f.disk, diskRaw: f.diskRaw, eol: f.eol })) };
  }
  /** The main window: the mini window started (or asks again) — everything it mirrors; then each change. */
  private async serveMini() {
    const { listen } = await import('@tauri-apps/api/event');
    await listen('mini-hello', () => void this.emitMini('mini-snapshot', this.snapshot()));
    await listen<{ path: string; text: string }>('mini-edit', (e) => {
      this.mini?.set(e.payload.path, e.payload.text); // it has it: not sent back
      this.setText(e.payload.text, e.payload.path);
    });
    await listen<{ path: string; line: number }>('mini-open-main', (e) => void this.openFromMini(e.payload.path, e.payload.line));
    $effect.root(() => {
      $effect(() => {
        const files = this.files;
        const m = this.mini;
        if (!m) return;
        // a file came or went, the statuses changed: all of it again
        if (files.map((f) => f.path).join('\n') !== this.miniPaths || this.configRaw !== this.miniCfg) return void this.emitMini('mini-snapshot', this.snapshot());
        for (const f of files)
          if (m.get(f.path) !== f.text) {
            m.set(f.path, f.text);
            void this.emitMini('mini-file', { path: f.path, text: f.text, disk: f.disk, diskRaw: f.diskRaw });
          }
      });
    });
  }
  /** The mini window: its files from the main window. */
  async loadMirror() {
    this.mirror = true;
    if (!isTauri) {
      this.loaded = true;
      return;
    }
    const { listen } = await import('@tauri-apps/api/event');
    await listen<MiniSnapshot>('mini-snapshot', (e) => {
      const s = e.payload;
      this.dir = s.dir;
      this.takeConfig(s.configRaw);
      this.files = s.files.map((f) => build(f.name, f.path, f.text, f.disk, f.diskRaw, f.eol as Eol, this.config));
      if (s.note && !this.miniNote) this.miniNote = s.note;
      this.loaded = true;
    });
    await listen<{ path: string; text: string; disk: string; diskRaw: string }>('mini-file', (e) => {
      const p = e.payload;
      const f = this.files.find((x) => x.path === p.path);
      if (!f || f.text === p.text) return;
      this.files = this.files.map((x) => (x.path === p.path ? build(x.name, x.path, p.text, p.disk, p.diskRaw, x.eol, this.config) : x));
    });
    await listen<MiniNote>('mini-open', (e) => this.setMiniNote(e.payload));
    void this.emitMini('mini-hello', null);
  }
  /** The note the mini window shows, kept for its next show. */
  setMiniNote(n: MiniNote | null) {
    this.miniNote = n;
    lsSet('mini:note', JSON.stringify(n));
  }
  /** ⇧⌘M: the heading the caret is in (the file whole above the first one, or as set), in the mini window. */
  openInMini(whole = miniSettings.cfg.what === 'file') {
    const t = this.tab;
    const f = this.file;
    let note: MiniNote | null = null;
    if (t?.kind === 'file' && f) {
      const h = this.selected >= 0 ? f.headings[this.selected] : undefined;
      note = h && !whole ? { path: f.name, line: h.line, title: h.title } : { path: f.name, line: h?.line ?? 0, title: '', whole: true };
    }
    if (note) this.setMiniNote(note);
    if (isTauri) void invoke('mini_open', { note }).catch(() => {});
  }
  /** «Открыть в главном окне»: the file at the line in a tab here, the app in front. */
  async openFromMini(name: string, line: number) {
    const i = this.files.findIndex((f) => f.name === name);
    if (i >= 0) this.open(i, line);
    if (isTauri) await invoke('show_main_window').catch(() => {});
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
      if (navOf('inbox')) this.setNavMode('inbox'); // the Inbox section, when it is on
      this.pickInbox = Date.now();
    });
    void this.applyCaptureKey();
    // and again when «Клавиши» change it
    $effect.root(() => {
      $effect(() => {
        void this.applyMiniKey();
      });
    });
    void miniSettings.apply(); // the panel's settings, kept by Rust until it is made
    await this.serveMini();
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
  /** What is being moved: the heading under the cursor (the palette's command), or one a feature hands over. */
  refile = $state<RefileReq | null>(null);
  /** «Перенести…» of the palette: the heading under the cursor; its own file is a place too, the caret follows. */
  startRefile() {
    const f = this.file;
    const h = f?.headings[this.selected];
    if (f && h) this.refile = { path: f.path, line: h.line, title: h.title, self: true, n: Date.now() };
  }
  /** A feature moves a heading of its own (an Inbox task, a review card) with its hooks around the write. */
  refileHeading(f: NoteFile, h: Heading, hooks: RefileHooks) {
    this.refile = { path: f.path, line: h.line, title: h.title, self: false, hooks, n: Date.now() };
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
    const hooks = this.refile?.hooks;
    hooks?.busy?.(true);
    try {
      return await this.refileMoveNow(dstPath, under);
    } finally {
      hooks?.busy?.(false);
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
    await req.hooks?.before?.(src.h);
    let steps: { path: string; text: string }[];
    let line: number;
    if (same) {
      const r = moveWithin(src.f.text, src.h, uh);
      steps = [{ path: dst.path, text: r.text }];
      line = r.line;
    } else {
      const r = moveTo(src.f.text, src.h, dst.text, uh);
      steps = [{ path: dst.path, text: r.dst }, { path: src.f.path, text: r.src }]; // the target first: nothing is lost
      line = r.line;
    }
    const done = await this.writeAll(`Перенесено: ${bareTitle(src.h.title)}`, steps);
    if (!done) return 'error';
    const rec = [{ path: dst.path, key: uh ? keyOf(uh) : '' }, ...this.refileRecent().filter((x) => x.path !== dst.path)].slice(0, 20);
    lsSet(this.recentKey(), JSON.stringify(rec));
    if (req.self) this.caretAfterRefile(src.f.path, src.h, same ? line : null);
    const name = displayName(dst.name);
    if (req.hooks?.done?.({ path: dst.path, line, label: `${name}${uh ? ' › ' + bareTitle(uh.title) : ''}`, step: done })) return 'ok';
    this.note(`Перенесено в ${name}${uh ? ' › ' + bareTitle(uh.title) : ''}`, [
      { label: 'Открыть', run: () => { const i = this.files.findIndex((x) => x.path === dst.path); if (i >= 0) this.open(i, line); } },
      { label: 'Отменить', run: () => void this.undo(done) },
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
    pinFirst(this.layout);
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
  /** «Второй редактор», «Агенда», or a feature's button: `make` gives the feature's new tab. */
  toggleSecond(kind: string, make?: () => Tab | undefined) {
    toggleSecond(this.layout, kind, make ?? (() => {
      const t = this.tab;
      if (t?.kind === 'file') return copyTab(t);
      const anyFile = this.layout.panes.flatMap((p) => p.tabs).find((x) => x.kind === 'file');
      if (anyFile) return copyTab(anyFile);
      return this.files[0] ? newTab('file', this.files[0].path) : undefined;
    }));
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
  // ---- «Настройки → Оформление» (ТЗ 25): the appearance of the app and the editor theme of each, on this Mac ------
  appearanceChoice = $state<AppearanceChoice>(readChoice());
  /** macOS is dark (for «Системное»); followed while the app runs. */
  systemDark = $state(isSystemDark());
  themeNames = $state<Record<Appearance, string>>(readThemeNames());
  /** Own themes: `themes/*.json` in the app's config folder (ТЗ 25 §4). */
  ownThemes = $state.raw<Theme[]>([]);
  /** Every theme to choose from: the built-in ones, then the own ones by name. */
  get themes(): Theme[] {
    return [...BUILTIN, ...this.pluginThemes, ...this.ownThemes];
  }
  /** The plugins' themes (roadmap 1.4: the Emacs ones are the plugin «theme-pack»), in the order they came. */
  pluginThemes = $state.raw<Theme[]>([]);
  /** The plugins have been started: till then a chosen plugin's theme is the one cached at the last run. */
  pluginsReady = $state(false);
  addThemes(plugin: string, list: Theme[]) {
    const names = new Set([...BUILTIN, ...this.pluginThemes].map((t) => t.name));
    const mine = list.filter((t) => !names.has(t.name) && !!names.add(t.name)).map((t) => ({ ...t, builtin: true, plugin }));
    this.pluginThemes = [...this.pluginThemes, ...mine];
    this.ownThemes = this.ownThemes.filter((t) => !mine.some((m) => m.name === t.name));
    return () => void (this.pluginThemes = this.pluginThemes.filter((t) => t.plugin !== plugin));
  }
  /** A chosen theme that is gone (its plugin turned off) gives way to Panopticon of its appearance. */
  resetMissingThemes() {
    if (!this.themesRead) return;
    for (const a of ['light', 'dark'] as const) if (!this.themes.some((t) => t.name === this.themeNames[a] && t.appearance === a)) this.setThemeName(a, DEFAULT_THEME[a]);
  }
  /** The own themes have been read (till then a chosen own theme is the one cached at the last run). */
  themesRead = $state(false);
  async loadThemes() {
    if (!isTauri) return void (this.themesRead = true);
    const texts = await invoke<string[]>('list_themes').catch(() => [] as string[]);
    const seen = new Set<string>();
    this.ownThemes = texts
      .map(parseTheme)
      .filter((t): t is Theme => !!t && ![...BUILTIN, ...this.pluginThemes].some((b) => b.name === t.name) && !seen.has(t.name) && !!seen.add(t.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    this.themesRead = true;
  }
  private async saveTheme(t: Theme): Promise<boolean> {
    try {
      if (isTauri) await invoke('write_theme', { file: themeFile(t.name), text: themeJson(t) });
      return true;
    } catch (e) {
      this.say('Не удалось сохранить тему: ' + e);
      return false;
    }
  }
  private putTheme(t: Theme, replace?: string) {
    this.ownThemes = [...this.ownThemes.filter((x) => x.name !== t.name && x.name !== replace), t].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
  /** «+ Новая тема», «Дублировать», editing a built-in one: an own copy, saved and chosen for its appearance. */
  async copyTheme(t: Theme): Promise<Theme | null> {
    const c = copyOf(t, this.themes.map((x) => x.name));
    if (!(await this.saveTheme(c))) return null;
    this.putTheme(c);
    this.setThemeName(c.appearance, c.name);
    return c;
  }
  /** «Переименовать»: the file follows the name; a taken name gets «(2)». Null: nothing to do. */
  async renameTheme(t: Theme, to: string): Promise<string | null> {
    const name = to.trim().slice(0, 80);
    if (t.builtin || !name || name === t.name) return null;
    const n = uniqueName(name, this.themes.filter((x) => x.name !== t.name).map((x) => x.name));
    const next = { ...t, name: n };
    if (!(await this.saveTheme(next))) return null;
    if (themeFile(n) !== themeFile(t.name) && isTauri) await invoke('delete_theme', { file: themeFile(t.name) }).catch(() => {});
    this.putTheme(next, t.name);
    for (const a of ['light', 'dark'] as const) if (this.themeNames[a] === t.name) this.setThemeName(a, n);
    if (this.themeEditing === t.name) this.themeEditing = n;
    return n;
  }
  /** The theme open in the theme editor (ТЗ 25 §2), inside «Настройки → Оформление»; null: the section itself. */
  themeEditing = $state<string | null>(null);
  /** «Редактировать»: a built-in theme gets an own copy («<тема> — моя») first; the theme is chosen and opened. */
  async editTheme(t: Theme) {
    const own = t.builtin ? await this.copyTheme(t) : t;
    if (!own) return;
    this.setThemeName(own.appearance, own.name);
    this.themeEditing = own.name;
  }
  private themeTimer: ReturnType<typeof setTimeout> | undefined;
  /** A colour changed in the editor: shown at once everywhere, written to its file a moment later. */
  setThemeColors(name: string, colors: Theme['colors']) {
    const t = this.ownThemes.find((x) => x.name === name);
    if (!t) return;
    const next = { ...t, colors };
    this.putTheme(next);
    clearTimeout(this.themeTimer);
    this.themeTimer = setTimeout(() => void this.saveTheme(next), 300);
  }
  /** «Сбросить»: the colours of the theme it is based on (else of Panopticon of its appearance). */
  resetTheme(name: string) {
    const t = this.ownThemes.find((x) => x.name === name);
    if (!t) return;
    const base = this.themes.find((x) => x.name === t.basedOn && x.appearance === t.appearance && x.name !== t.name) ?? builtinFor(t.appearance);
    this.setThemeColors(name, { ...base.colors, palette: { ...base.colors.palette } });
  }
  /** «Удалить» (own themes only): a chosen one gives way to the built-in Panopticon theme of its appearance. */
  async deleteTheme(t: Theme) {
    if (t.builtin) return;
    try {
      if (isTauri) await invoke('delete_theme', { file: themeFile(t.name) });
    } catch (e) {
      return this.say('Не удалось удалить тему: ' + e);
    }
    this.ownThemes = this.ownThemes.filter((x) => x.name !== t.name);
    for (const a of ['light', 'dark'] as const) if (this.themeNames[a] === t.name) this.setThemeName(a, DEFAULT_THEME[a]);
    if (this.themeEditing === t.name) this.themeEditing = null;
  }
  /** «Экспорт…»: the theme's file where the system save panel says. */
  async exportTheme(t: Theme) {
    if (!isTauri) return;
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ title: 'Экспорт темы', defaultPath: themeFile(t.name), filters: [{ name: 'Тема Panopticon', extensions: ['json'] }] });
    if (!path) return;
    try {
      await invoke('export_text', { path, text: themeJson({ ...t, builtin: false }) });
      this.note(`Тема «${t.name}» сохранена`);
    } catch (e) {
      this.say('Не удалось сохранить тему: ' + e);
    }
  }
  /** «Импорт…»: a theme file of this format becomes an own theme (a taken name gets «(2)»). */
  async importTheme() {
    if (!isTauri) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ title: 'Импорт темы', multiple: false, directory: false, filters: [{ name: 'Тема Panopticon', extensions: ['json'] }] });
    if (typeof path !== 'string') return;
    let t: Theme | null = null;
    try {
      t = parseTheme(await invoke<string>('import_text', { path }));
    } catch (e) {
      return this.say('Не удалось прочитать файл: ' + e);
    }
    if (!t) return this.say('Это не тема Panopticon: нужен файл .json с "format": "panopticon-theme"');
    const it = { ...t, name: uniqueName(t.name, this.themes.map((x) => x.name)) };
    if (!(await this.saveTheme(it))) return;
    this.putTheme(it);
    this.note(`Тема «${it.name}» добавлена — ${it.appearance === 'dark' ? 'для тёмного оформления' : 'для светлого оформления'}`);
  }
  get appearance(): Appearance {
    return effective(this.appearanceChoice, this.systemDark);
  }
  themeFor(a: Appearance): Theme {
    const name = this.themeNames[a];
    if ((!this.themesRead || !this.pluginsReady) && !this.themes.some((t) => t.name === name)) return cachedTheme(a, name) ?? themeNamed(name, a);
    return themeNamed(name, a, this.themes);
  }
  /** The editor theme in effect now. */
  get theme(): Theme {
    return this.themeFor(this.appearance);
  }
  setAppearance(c: AppearanceChoice) {
    this.appearanceChoice = c;
    saveChoice(c);
  }
  setThemeName(a: Appearance, name: string) {
    this.themeNames = { ...this.themeNames, [a]: name };
    saveThemeName(a, name);
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
    if (this.mirror) {
      // the mini window: the main window writes it (and says if it could not)
      const f = this.files.find((x) => x.path === path);
      if (f) void this.emitMini('mini-edit', { path, text: f.text });
      return;
    }
    if (!isTauri || this.conflicts[path]) return; // a conflict waits for the user's choice
    this.saveState = 'saving';
    clearTimeout(this.timers.get(path));
    this.timers.set(path, setTimeout(() => this.save(path), 500));
  }

  /** Write a file; resolves to the reason it failed, or null. */
  private async save(path: string): Promise<string | null> {
    if (this.mirror) return (this.scheduleSave(path), null); // the main window writes the mini window's edits
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
/** A key of config.json («goals») or a key in one («inbox.order»). */
function hasPath(o: any, path: string): boolean {
  const [a, b] = path.split('.');
  return !!o && typeof o === 'object' && a in o && (b === undefined || (!!o[a] && typeof o[a] === 'object' && b in o[a]));
}
function dropPath(o: any, path: string) {
  const [a, b] = path.split('.');
  if (b === undefined) return void delete o[a];
  if (!o[a] || typeof o[a] !== 'object') return;
  delete o[a][b];
  if (!Object.keys(o[a]).length) delete o[a];
}
/** What a feature does around a move it asked for. */
/** Where a feature keeps its settings and where they were before roadmap 0.6 (config.json). */
export interface StorageSpec {
  /** Its folder's settings as config.json had them. */
  legacy?: (parsed: any) => unknown;
  /** The keys of config.json dropped once the feature's file is written («goals», or «inbox.order» inside a key: the
   *  key goes when nothing is left in it). */
  legacyKeys?: string[];
  /** Its settings of this Mac as config.json had them. */
  localLegacy?: (parsed: any) => unknown;
  /** Its file or its settings of this Mac as written before, read in their new shape (the calendar became a plugin:
   *  its flat settings → `{ settings, data }`); the next write keeps the new one. */
  upgrade?: (v: unknown, where: 'folder' | 'local') => unknown;
}
/** What a feature's tab does with the keys of its scope. */
export interface ScopeKeys {
  active: () => boolean;
  run: (id: string) => boolean;
}
/** What a feature does around a move it asked for. */
export interface RefileHooks {
  /** Just before the write: a fade of the row going away, say. */
  before?(h: Heading): Promise<void> | void;
  /** While the move is written: the heading leaving its file is not a change from outside. */
  busy?(on: boolean): void;
  /** After it: true when the feature tells of it itself (no toast of the core). */
  done?(r: { path: string; line: number; label: string; step: Step }): boolean;
}
export interface RefileReq {
  path: string;
  line: number;
  title: string;
  /** The palette's move: its own file is a place too, and the caret goes on in it. */
  self: boolean;
  hooks?: RefileHooks;
  n: number;
}
/** A section of the settings sheet: the core's (Основные … Клавиши) or a feature's (views.ts). */
export type SettingsSection = string;
/** The navigator's mode: the core's (files, agendas, search) or a feature's section (views.ts). */
export type NavMode = string;
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
