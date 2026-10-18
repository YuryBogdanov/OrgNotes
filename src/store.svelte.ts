import {
  activeTab, addPane, closePane, closeTab, dropMissing, emptyLayout, focusPane, keepOne, mapPaths, newTab, openAgenda,
  openFile, openFromAgenda, pinFirst, restore, serialize, splitRight, swap, toggleSecond, copyTab, type Layout, type Tab,
  newUntitled, moveTab, duplicateTab, othersOf, targetOf, UNTITLED, foldPanes, unfoldPanes, type Folded,
} from './layout';
import { mapperFor, resolveLink, rewriteFileLinks, type OrgLink } from './links';
import { narrowTarget } from './narrowTab';
import { isMainWindow, nextOn, setNext } from './uiFlag';
import { displayName, isArchive, noteName, withOrg } from './names';
import { appendTask, setPlanning, setTags } from './edits';
import { bareTitle, caretAfter } from './refile';
import { archiveEntry, archiveTarget, categoryOf } from './archive';
import { addNote } from './logbook';
import type { CalSpec, Plate } from './commands';
import { lsGet, lsSet } from './storage';
import { notify } from './notify.svelte';
import { prefs } from './prefs.svelte';
import { themes } from './themes.svelte';
import { shortcuts } from './shortcuts.svelte';
import { PluginStore } from './pluginData.svelte';
import { searchAll } from './searchAll.svelte';
import { invoke, isTauri } from './tauri';
import { MiniSync, type MiniNote } from './mirror.svelte';
import { touches } from './touchIndex.svelte';
import { AgendaStore } from './agendaStore.svelte';
import { InboxStore } from './inboxStore.svelte';
import { RefileStore } from './refileStore.svelte';
import { closeFromFullscreen, hideWindow, leaveFullscreen } from './appWindow';
export type { MiniNote } from './mirror.svelte';
export { DEFAULT_CAPTURE_KEY, type ScopeKeys } from './shortcuts.svelte';
export type { PluginData, StorageSpec } from './pluginData.svelte';
export { SEARCH_CAP, type SearchGroup, type SearchState } from './searchAll.svelte';
import { readInbox } from './inbox';
import { readAgendas, type Agenda } from './agendas';
import { allFileViews, fileViewOf, navOf, viewOf } from './views';
import { mini as miniSettings } from './miniOptions.svelte';
import { Journal, Tx, canUndo, type Step } from './journal';
import { fileLink, headingLink, labelOf, linkHooks } from './linkEdit';
import { newId } from './endDay';
import { fileTypeOf, fileTypes, isOrgName, watchFileTypes, withExt } from './fileTypes.svelte';
import { DEFAULT_SEQUENCE, EMPTY_CONFIG, headingAt, joinEol, parseHeadings, parseProjectConfig, resolveWorkflow, setKeyword, setPriority, sequenceFor, splitEol, startOf, toneFor, type Eol, type Heading, type ProjectConfig, type Workflow, type WorkflowDef } from './org';
import { toneStyle } from './colors';
import { bodyOf } from './orgOps';

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

/** A link (ТЗ 35): the icon of its toasts. */
const LINK_ICON = 'M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1';

function build(name: string, path: string, text: string, disk: string, diskRaw: string, eol: Eol, cfg: ProjectConfig): NoteFile {
  const wf = resolveWorkflow(text, name, cfg);
  // a plugin's file (a canvas, ТЗ 39): no headings — the agenda, the tags, the links do not see it
  const org = isOrgName(name);
  const ft = org ? /^#\+FILETAGS:\s*(.+)$/m.exec(text) : null;
  return {
    name, path, text, disk, diskRaw, eol, wf,
    headings: org ? parseHeadings(text, wf) : [],
    filetags: ft ? ft[1].split(':').map((s) => s.trim()).filter(Boolean) : [],
  };
}

/** Where the palette opens: a step of a command at once (the card's buttons in «Разбор Inbox» use the heading ones). */
export type PaletteStart = 'newFile' | 'newFolder' | 'goto' | 'status' | 'priority' | 'schedule' | 'deadline' | 'tags' | 'calendar' | 'step';

export async function openExternal(url: string) {
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
  // ---- owned (tech sprint 2.4): the agendas and their builder, the Inbox, «Перенести» --------------------------
  private agendaStore = new AgendaStore({ updateConfig: (make) => this.updateConfig(make), show: (id) => this.openAgendaHere(id) });
  get agendas() {
    return this.agendaStore.list;
  }
  set agendas(v) {
    this.agendaStore.list = v;
  }
  get builder() {
    return this.agendaStore.builder;
  }
  set builder(v) {
    this.agendaStore.builder = v;
  }
  get builderSave() {
    return this.agendaStore.builderSave;
  }
  set builderSave(v) {
    this.agendaStore.builderSave = v;
  }
  get builderDirty() {
    return this.agendaStore.builderDirty;
  }
  readonly agendaOf = this.agendaStore.of.bind(this.agendaStore);
  readonly newAgendaInBuilder = this.agendaStore.newAgendaInBuilder.bind(this.agendaStore);
  readonly editAgenda = this.agendaStore.editAgenda.bind(this.agendaStore);
  readonly closeBuilder = this.agendaStore.closeBuilder.bind(this.agendaStore);
  /** The open builder's «Сохранить» with its checks (the new interface's tab sets it): what closing the tab calls. */
  builderSaveFn: (() => Promise<boolean>) | null = null;
  readonly saveAgenda = this.agendaStore.saveAgenda.bind(this.agendaStore);
  readonly deleteAgenda = this.agendaStore.deleteAgenda.bind(this.agendaStore);
  private inbox = new InboxStore({
    files: () => this.files,
    updateConfig: (make) => this.updateConfig(make),
    transaction: (label, build) => this.transaction(label, build),
    create: async (name) => {
      try {
        await this.flush();
        if (isTauri) await invoke<string>('create_entry', { parent: this.abs(''), name, isDir: false });
        await this.reload();
        return null;
      } catch (e) {
        return String(e).includes('exist') ? null : String(e);
      }
    },
    sheetOpen: () => this.sheetOpen,
  });
  get inboxCfg() {
    return this.inbox.cfg;
  }
  set inboxCfg(v) {
    this.inbox.cfg = v;
  }
  get capture() {
    return this.inbox.capture;
  }
  set capture(v) {
    this.inbox.capture = v;
  }
  get pickInbox() {
    return this.inbox.pickInbox;
  }
  set pickInbox(v) {
    this.inbox.pickInbox = v;
  }
  get inboxFile() {
    return this.inbox.file;
  }
  readonly setInbox = this.inbox.setInbox.bind(this.inbox);
  readonly createInboxFile = this.inbox.createInboxFile.bind(this.inbox);
  readonly addToInbox = this.inbox.addToInbox.bind(this.inbox);
  readonly openCapture = this.inbox.openCapture.bind(this.inbox);
  private refiling = new RefileStore({
    files: () => this.files,
    dir: () => this.dir,
    current: () => {
      const f = this.file;
      const h = f?.headings[this.selected];
      return f && h ? { f, h } : null;
    },
    opened: () => [...this.layout.panes.flatMap((p) => p.tabs.flatMap((t) => (t.kind === 'file' && t.path ? [t.path] : []))), ...this.history.map((h) => h.path), this.curPath].reverse(),
    saveNow: async (path) => {
      if (this.conflicts[path]) return null; // a conflict waits for the user's choice
      clearTimeout(this.timers.get(path));
      this.timers.delete(path);
      return this.save(path);
    },
    reload: () => this.reload(),
    writeAll: (label, texts) => this.writeAll(label, texts),
    undo: (step) => this.undo(step),
    open: (i, line) => this.open(i, line),
    caretAfter: (path, h, movedAt) => this.caretAfterRefile(path, h, movedAt),
  });
  get refile() {
    return this.refiling.req;
  }
  set refile(v) {
    this.refiling.req = v;
  }
  readonly startRefile = this.refiling.start.bind(this.refiling);
  readonly refileHeading = this.refiling.heading.bind(this.refiling);
  readonly refileSource = this.refiling.source.bind(this.refiling);
  readonly refileRecent = this.refiling.recent.bind(this.refiling);
  readonly refileRecentFiles = this.refiling.recentFiles.bind(this.refiling);
  readonly refileMove = this.refiling.move.bind(this.refiling);
  readonly leaveFullscreen = leaveFullscreen;
  readonly closeFromFullscreen = closeFromFullscreen;
  readonly hideWindow = hideWindow;
  // ---- forwarded (tech sprint 2.2): the shortcuts, what features keep, the search in every file -------------
  get keyState() {
    return shortcuts.keyState;
  }
  set keyState(v) {
    shortcuts.keyState = v;
  }
  get keysVersion() {
    return shortcuts.keysVersion;
  }
  set keysVersion(v) {
    shortcuts.keysVersion = v;
  }
  get keyRecording() {
    return shortcuts.keyRecording;
  }
  set keyRecording(v) {
    shortcuts.keyRecording = v;
  }
  get captureKey() {
    return shortcuts.captureKey;
  }
  set captureKey(v) {
    shortcuts.captureKey = v;
  }
  get captureGlobal() {
    return shortcuts.captureGlobal;
  }
  set captureGlobal(v) {
    shortcuts.captureGlobal = v;
  }
  get bindings() {
    return shortcuts.bindings;
  }
  get scopeKeys() {
    return shortcuts.scopeKeys;
  }
  readonly keyHint = shortcuts.keyHint.bind(shortcuts);
  readonly titled = shortcuts.titled.bind(shortcuts);
  readonly setKeys = shortcuts.setKeys.bind(shortcuts);
  readonly setPreset = shortcuts.setPreset.bind(shortcuts);
  readonly resetKeys = shortcuts.resetKeys.bind(shortcuts);
  readonly setScopeKeys = shortcuts.setScopeKeys.bind(shortcuts);
  readonly applyCaptureKey = shortcuts.applyCaptureKey.bind(shortcuts);
  readonly applyMiniKey = shortcuts.applyMiniKey.bind(shortcuts);
  readonly toggleMini = shortcuts.toggleMini.bind(shortcuts);
  readonly setCaptureKey = shortcuts.setCaptureKey.bind(shortcuts);
  private data = new PluginStore({ config: () => this.parsedConfig, updateConfig: (make) => this.updateConfig(make), refresh: () => this.refreshStatusSets() });
  readonly registerStorage = this.data.registerStorage.bind(this.data);
  readonly hasStorage = this.data.hasStorage.bind(this.data);
  readonly hasLegacy = this.data.hasLegacy.bind(this.data);
  readonly folderData = this.data.folderData.bind(this.data);
  readonly setFolderData = this.data.setFolderData.bind(this.data);
  readonly readFeatureFile = this.data.readFeatureFile.bind(this.data);
  readonly localData = this.data.localData.bind(this.data);
  readonly setLocalData = this.data.setLocalData.bind(this.data);
  readonly forgetPluginData = this.data.forgetPluginData.bind(this.data);
  readonly restorePluginData = this.data.restorePluginData.bind(this.data);
  get search() {
    return searchAll.state;
  }
  readonly searchRecent = searchAll.recent.bind(searchAll);
  readonly clearSearchRecent = searchAll.clearRecent.bind(searchAll);
  // ---- forwarded (tech sprint 2.1): the notes at the bottom, the view preferences, the themes ---------------
  get toast() {
    return notify.toast;
  }
  set toast(v) {
    notify.toast = v;
  }
  get notice() {
    return notify.notice;
  }
  set notice(v) {
    notify.notice = v;
  }
  get draftNotice() {
    return notify.draftNotice;
  }
  set draftNotice(v) {
    notify.draftNotice = v;
  }
  readonly note = notify.note.bind(notify);
  readonly say = notify.say.bind(notify);
  readonly sayDraft = notify.sayDraft.bind(notify);
  get showNav() {
    return prefs.showNav;
  }
  set showNav(v) {
    prefs.showNav = v;
  }
  get showInspector() {
    return prefs.showInspector;
  }
  set showInspector(v) {
    prefs.showInspector = v;
  }
  get navW() {
    return prefs.navW;
  }
  set navW(v) {
    prefs.navW = v;
  }
  get inspW() {
    return prefs.inspW;
  }
  set inspW(v) {
    prefs.inspW = v;
  }
  get navHeadings() {
    return prefs.navHeadings;
  }
  set navHeadings(v) {
    prefs.navHeadings = v;
  }
  get levels() {
    return prefs.levels;
  }
  set levels(v) {
    prefs.levels = v;
  }
  get rich() {
    return prefs.rich;
  }
  set rich(v) {
    prefs.rich = v;
  }
  get richNumbers() {
    return prefs.richNumbers;
  }
  set richNumbers(v) {
    prefs.richNumbers = v;
  }
  get linkFormat() {
    return prefs.linkFormat;
  }
  set linkFormat(v) {
    prefs.linkFormat = v;
  }
  get foldDrawers() {
    return prefs.foldDrawers;
  }
  set foldDrawers(v) {
    prefs.foldDrawers = v;
  }
  get inspectorTab() {
    return prefs.inspectorTab;
  }
  set inspectorTab(v) {
    prefs.inspectorTab = v;
  }
  get findCase() {
    return prefs.findCase;
  }
  set findCase(v) {
    prefs.findCase = v;
  }
  get findWord() {
    return prefs.findWord;
  }
  set findWord(v) {
    prefs.findWord = v;
  }
  readonly setNavHeadings = prefs.setNavHeadings.bind(prefs);
  readonly setRich = prefs.setRich.bind(prefs);
  readonly setRichNumbers = prefs.setRichNumbers.bind(prefs);
  readonly setLinkFormat = prefs.setLinkFormat.bind(prefs);
  readonly setFoldDrawers = prefs.setFoldDrawers.bind(prefs);
  readonly setLevels = prefs.setLevels.bind(prefs);
  readonly toggleStructure = prefs.toggleStructure.bind(prefs);
  readonly setInspectorTab = prefs.setInspectorTab.bind(prefs);
  readonly setFindOpts = prefs.setFindOpts.bind(prefs);
  get appearanceChoice() {
    return themes.appearanceChoice;
  }
  set appearanceChoice(v) {
    themes.appearanceChoice = v;
  }
  get systemDark() {
    return themes.systemDark;
  }
  set systemDark(v) {
    themes.systemDark = v;
  }
  get themeNames() {
    return themes.themeNames;
  }
  set themeNames(v) {
    themes.themeNames = v;
  }
  get ownThemes() {
    return themes.ownThemes;
  }
  set ownThemes(v) {
    themes.ownThemes = v;
  }
  get pluginThemes() {
    return themes.pluginThemes;
  }
  set pluginThemes(v) {
    themes.pluginThemes = v;
  }
  get pluginsReady() {
    return themes.pluginsReady;
  }
  set pluginsReady(v) {
    themes.pluginsReady = v;
  }
  get themesRead() {
    return themes.themesRead;
  }
  set themesRead(v) {
    themes.themesRead = v;
  }
  get themeEditing() {
    return themes.themeEditing;
  }
  set themeEditing(v) {
    themes.themeEditing = v;
  }
  get themes() {
    return themes.themes;
  }
  get appearance() {
    return themes.appearance;
  }
  get theme() {
    return themes.theme;
  }
  readonly addThemes = themes.addThemes.bind(themes);
  readonly resetMissingThemes = themes.resetMissingThemes.bind(themes);
  readonly loadThemes = themes.loadThemes.bind(themes);
  readonly copyTheme = themes.copyTheme.bind(themes);
  readonly renameTheme = themes.renameTheme.bind(themes);
  readonly editTheme = themes.editTheme.bind(themes);
  readonly setThemeColors = themes.setThemeColors.bind(themes);
  readonly resetTheme = themes.resetTheme.bind(themes);
  readonly deleteTheme = themes.deleteTheme.bind(themes);
  readonly exportTheme = themes.exportTheme.bind(themes);
  readonly importTheme = themes.importTheme.bind(themes);
  readonly themeFor = themes.themeFor.bind(themes);
  readonly setAppearance = themes.setAppearance.bind(themes);
  readonly setThemeName = themes.setThemeName.bind(themes);
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
  creating = $state<{ dir: string; kind: 'file' | 'folder'; type?: string } | null>(null); // inline "new" row in the navigator (`type`: a plugin's file type)
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
    return !!(this.unsavedReq || this.saveAsReq || this.errorReq || this.palette || this.diskReq || (this.builder && !this.nextUi) || this.capture || this.refile || this.pickInbox || this.settingsOpen || this.sheetChecks.some((f) => f()));
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
  /**
   * The link to the heading at `line` of a file (the one the line is in; above the first heading — the file), in the
   * format set; an :ID: the heading lacks is added (one step of ⌘Z). Null: no such file, or the :ID: not written.
   */
  async headingLinkAt(path: string, line: number): Promise<{ link: string; label: string } | null> {
    const p = this.headingLinkPlan(path, line);
    if (!p || (p.write && !(await p.write()))) return null;
    return { link: p.link, label: p.label };
  }
  /** The link at once and what is still to write for it (an :ID: the heading lacks): the picker puts the link in the
   *  text first, then writes the :ID: (ТЗ 35 §3). */
  headingLinkPlan(path: string, line: number): { target: string; label: string; link: string; write: (() => Promise<boolean>) | null } | null {
    const f = this.files.find((x) => x.path === path);
    if (!f) return null;
    const hi = headingAt(f.headings, line);
    if (hi < 0) return { target: `file:${f.name}`, label: displayName(f.name), link: fileLink(f.name, displayName(f.name)), write: null };
    const h = f.headings[hi];
    const label = labelOf(h);
    if (this.linkFormat === 'title') return { target: `file:${f.name}::*${label}`, label, link: headingLink(h, { file: f.name }), write: null };
    const id = h.id ?? newId();
    const ref = { path: f.path, line: h.line, title: h.title };
    const write = h.id ? null : async () => !!(await this.transaction(`ID: ${label}`, (tx) => tx.setProperty(ref, 'ID', id)));
    return { target: `id:${id}`, label, link: headingLink(h, { id }), write };
  }
  /** ⌃C L: the link in the clipboard (text), and a word of it at the bottom of the window. */
  async copyHeadingLink(path: string, line: number): Promise<boolean> {
    const r = await this.headingLinkAt(path, line);
    if (!r) return false;
    try {
      await navigator.clipboard.writeText(r.link);
    } catch (e) {
      this.say('Не удалось скопировать ссылку: ' + e);
      return false;
    }
    this.note(`Ссылка на «${r.label}» скопирована · выделите текст и нажмите ⌘V`, undefined, 3000, LINK_ICON);
    return true;
  }
  /** The text in the clipboard: the app reads it itself (WebKit asks before giving it to a page). */
  async readClipboard(): Promise<string> {
    try {
      if (isTauri) return await invoke<string>('clipboard_text');
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
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
    const find = (p: number) => L.panes[p]?.tabs.findIndex((t) => t.kind === 'file' && t.path === path && !t.scope) ?? -1;
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
  saveState = $state<'saved' | 'saving' | 'memory'>(isTauri ? 'saved' : 'memory');
  dir = $state<string | null>(null);
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
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private saving = 0; // saves in flight
  private writes = 0; // bumped after every successful write: a snapshot of the disk taken across a bump may be stale

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
        touches.quietly(f.name, lines.join('\n')); // a status renamed in every file is not a touch (ТЗ 40)
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
    this.settingsCrumb = null;
    this.keyRecording = false;
    this.themeEditing = null;
  }
  /** A page inside a section, after its name in the sheet's title («Каталог», ТЗ 37). */
  settingsCrumb = $state<string | null>(null);
  showSection(section: SettingsSection) {
    if (section !== this.settingsSection) (this.themeEditing = null), (this.settingsCrumb = null);
    this.settingsSection = section;
    lsSet('settings:section', section);
  }

  /** «Навигатор: свернуть / развернуть всё» from the palette or a key: the tree of «Файлы» does it. */
  navTreeReq = $state<{ kind: 'collapse' | 'expand'; n: number } | null>(null);
  navTree(kind: 'collapse' | 'expand') {
    this.showNav = true;
    this.setNavMode('files');
    this.navTreeReq = { kind, n: Date.now() };
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
  /** The custom agenda shown by the active tab (undefined: a file, or the built-in agenda). */
  get agenda(): Agenda | undefined {
    return this.agendaStore.of(this.tab);
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
  /** A file of the folder, made empty when it is not there yet (the journal of «Завершить день»); none if it failed. */
  async ensureFile(rel: string): Promise<NoteFile | undefined> {
    const have = this.files.find((f) => f.name === rel);
    if (have) return have;
    const i = rel.lastIndexOf('/');
    try {
      await this.flush();
      if (isTauri) await invoke<string>('create_entry', { parent: this.abs(i < 0 ? '' : rel.slice(0, i)), name: rel.slice(i + 1), isDir: false, text: fileTypeOf(rel)?.template ?? null });
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
  /** `o.touch: false`: a mass edit (a tag or a status renamed in every file) — not a touch of its headings (ТЗ 40). */
  async transaction(label: string, build: (tx: Tx) => void, onUndo?: () => void, o: { touch?: boolean } = {}): Promise<Step | null> {
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
    if (o.touch === false)
      for (const st of steps) {
        const f = this.files.find((x) => x.path === st.path);
        if (f) touches.quietly(f.name, st.text);
      }
    const done = await this.writeSteps(steps);
    const step = done ? this.journal.record(label, done, onUndo) : null;
    if (step && o.touch === false) this.quietSteps.add(step);
    return step;
  }
  /** The steps of mass edits: taking one back is not a touch either. */
  private quietSteps = new WeakSet<Step>();
  /** Texts the feature has made itself, as one transaction. */
  writeAll(label: string, texts: { path: string; text: string }[], onUndo?: () => void): Promise<Step | null> {
    return this.transaction(label, (tx) => texts.forEach((x) => tx.update(x.path, () => x.text)), onUndo);
  }
  /** Take a step back, if its files were not changed since (the toast's «Отменить»). */
  /** The undos one after another: a second ⌘Z pressed while the first is being written takes the step before it,
   *  not the same one again. */
  private undoQueue: Promise<unknown> = Promise.resolve();
  private queued<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.undoQueue.then(fn);
    this.undoQueue = run.catch(() => undefined);
    return run;
  }
  undo(step: Step): Promise<boolean> {
    return this.queued(() => this.undoNow(step));
  }
  private async undoNow(step: Step): Promise<boolean> {
    if (!this.journal.has(step)) return false;
    if (!canUndo(step, (p) => this.files.find((x) => x.path === p)?.text)) {
      this.say('Отменить нельзя: файл уже изменился');
      return false;
    }
    for (const c of [...step.changes].reverse()) {
      const f = this.quietSteps.has(step) ? this.files.find((x) => x.path === c.path) : undefined;
      if (f) touches.quietly(f.name, c.before);
      await this.writeNow(c.path, c.before);
    }
    this.journal.drop(step);
    step.onUndo?.();
    return true;
  }
  /** ⌘Z in an editor whose text is what the last step made of it (a move, «В архив» — the step over several files):
   *  the editor takes its own file back by its history; the step's other files go back here, and the step is gone. */
  undoAlong(path: string, text: string) {
    const s = this.journal.last();
    const own = s?.changes.find((c) => c.path === path);
    if (!s || !own || own.after !== text || s.changes.length < 2) return;
    const rest = { ...s, changes: s.changes.filter((c) => c.path !== path) };
    if (!canUndo(rest, (p) => this.files.find((x) => x.path === p)?.text)) return;
    this.journal.drop(s);
    void this.queued(async () => {
      for (const c of [...rest.changes].reverse()) await this.writeNow(c.path, c.before);
      s.onUndo?.();
    });
  }
  /** ⌘Z outside a text editor: the last step, wherever it was made. False: there is none (or it cannot be). */
  undoLast(): Promise<boolean> {
    return this.queued(async () => {
      const s = this.journal.last();
      return s ? this.undoNow(s) : false;
    });
  }

  /** The files as the agenda, the calendar and «Сегодня» see them: an archive («.org_archive», ТЗ 33) has no headings
   *  there. The same list as `files` (the indexes of one are the other's). */
  agendaFiles = $derived(this.files.map((f) => (isArchive(f.name) ? { ...f, headings: [] } : f)));
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
    await this.data.readAll(); // first: a feature's set of statuses may depend on them
    this.takeConfig(await this.readConfig());
    const cfg = this.config;
    const files = list.map((l) => fromDisk(l, cfg));
    const folders = await this.readFolders(files);
    // the panes and tabs of the last session; files that cannot be opened any more are skipped
    const exists = (p: string) => files.some((f) => f.path === p);
    this.readViewMemory();
    const saved = restore(lsGet(this.layoutKey()), exists);
    const last = lsGet('lastFile:' + (this.dir ?? ''));
    const pick = files.find((f) => f.path === last) ?? files.find((f) => f.name === 'Weekly.org') ?? files[0];
    this.folders = folders;
    this.layout = saved ?? emptyLayout(pick ? newTab('file', pick.path) : undefined);
    this.files = files;
    this.loaded = true;
    // the touches of headings (ТЗ 40): what changed while the app was closed gets the file's modification time
    const mtimes = new Map(list.map((l) => [l.name, l.mtime ?? Date.now()]));
    if (!this.mirror) void touches.open(files, (name) => mtimes.get(name) ?? Date.now());
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
    const taken: { name: string; at: number }[] = []; // read from disk changed: their headings' touches (ТЗ 40)
    const conflicts = { ...this.conflicts };
    const gen = { ...this.diskGen };
    const files = list.map((n) => {
      const o = old.get(n.path);
      if (!o) return (this.diskTaken.add(n.name), taken.push({ name: n.name, at: n.mtime ?? Date.now() }), fromDisk(n, this.config));
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
      taken.push({ name: n.name, at: n.mtime ?? Date.now() });
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
    const goneNames = [...old.values()].filter((o) => !known.has(o.path) && this.files.some((f) => f.path === o.path)).map((o) => o.name);
    this.files = files;
    this.folders = folders;
    this.orphans = orphans;
    for (const name of goneNames) touches.removeFile(name);
    for (const t of taken) {
      const f = files.find((x) => x.name === t.name);
      if (f) touches.change(f, t.at);
    }
    this.conflicts = conflicts;
    this.diskGen = gen;
    if (Object.keys(moves).length) mapPaths(this.layout, (p) => moves[p] ?? p);
    for (const p of this.orphanAsked) if (!orphans[p]) this.orphanAsked.delete(p);
    if (reloaded.length) notify.reloaded(reloaded);
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
        const now = this.files.find((x) => x.path === path);
        if (now) touches.change(now, c.mtime);
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

  async useSample() {
    const p = await invoke<string | null>('sample_notes_dir');
    if (p) await this.useFolder(p);
  }

  // ---- the mini window (ТЗ 31): one state of the files in two windows (mirror.svelte.ts) ---------------------------
  private sync = new MiniSync({
    files: () => this.files,
    configRaw: () => this.configRaw,
    dir: () => this.dir,
    edit: (path, text) => this.setText(text, path),
    openMain: (name, line) => void this.openFromMini(name, line),
    take: (s) => {
      this.dir = s.dir;
      this.takeConfig(s.configRaw);
      this.files = s.files.map((f) => build(f.name, f.path, f.text, f.disk, f.diskRaw, f.eol as Eol, this.config));
      this.loaded = true;
    },
    takeFile: (p) => {
      const f = this.files.find((x) => x.path === p.path);
      if (!f || f.text === p.text) return;
      this.files = this.files.map((x) => (x.path === p.path ? build(x.name, x.path, p.text, p.disk, p.diskRaw, x.eol, this.config) : x));
    },
    ready: () => (this.loaded = true),
  });
  /** This store is the mini window's: no disk of its own, its edits go to the main window. */
  get mirror() {
    return this.sync.mirror;
  }
  get miniNote() {
    return this.sync.miniNote;
  }
  set miniNote(n) {
    this.sync.miniNote = n;
  }
  readonly setMiniNote = this.sync.setMiniNote.bind(this.sync);
  /** The mini window: its files from the main window. */
  loadMirror() {
    return this.sync.load();
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
    await this.sync.serve();
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
  setPlanning(kind: 'SCHEDULED' | 'DEADLINE', date: Date | null) { this.patch((t, h, wf) => setPlanning(t, h, kind, date, wf.behavior?.logbook ? new Date() : undefined)); }
  setTags(tags: string[]) { this.patch((t, h) => setTags(t, h, tags)); }

  // ---- search: ⌘F in a pane, ⇧⌘F in every file ------------------------------------------------------------
  /** What a pane's find bar is asked (the menu, the keys, a jump from the search in every file). */
  findReq = $state<{ kind: 'open' | 'next' | 'prev' | 'useSel' | 'jump' | 'replace'; pane: number; n: number; q?: string; re?: boolean; at?: { path: string; line: number; col: number } } | null>(null);
  askFind(kind: 'open' | 'next' | 'prev' | 'useSel' | 'replace') {
    this.findReq = { kind, pane: this.layout.active, n: Date.now() + Math.random() };
  }
  /** ⇧⌘F: the section «Поиск», the field in focus (the editor's one-line selection in it, not searched yet). */
  openSearch(selection = '') {
    this.setNavMode('search');
    if (selection && !selection.includes('\n')) this.search.q = selection;
    this.search.focusN++;
  }
  /** ↩: every .org file of the folder (the open ones with their unsaved edits) — the open ones first. */
  runSearch() {
    const open = new Set(this.layout.panes.flatMap((p) => p.tabs.flatMap((t) => (t.kind === 'file' && t.path ? [t.path] : []))));
    // not a plugin's file (a canvas's JSON)
    return searchAll.run(this.files.filter((f) => isOrgName(f.name)), open, { cs: this.findCase, word: this.findWord, re: this.search.re });
  }
  /** A result: its file in the active pane at the match; the pane's find bar with the same query. */
  openHit(g: number, i: number) {
    const grp = this.search.groups[g];
    const hit = grp?.hits[i];
    const idx = grp ? this.files.findIndex((f) => f.path === grp.path) : -1;
    if (!hit || idx < 0) return;
    this.search.sel = { g, i };
    this.open(idx, hit.line, false);
    this.findReq = { kind: 'jump', pane: this.layout.active, n: Date.now() + Math.random(), q: this.search.ran, re: this.search.ranRe, at: { path: grp.path, line: hit.line, col: hit.col } };
  }
  /** ⌥⌘G / ⇧⌥⌘G: the next / previous result, from file to file. */
  searchStep(dir: 1 | -1) {
    const flat = this.search.groups.flatMap((g, gi) => g.hits.map((_, i) => ({ g: gi, i })));
    if (!flat.length) return;
    const s = this.search.sel;
    // a file's row chosen (the new panel, ТЗ 50 §5): as if just before its first result
    const at = !s ? -1 : s.i < 0 ? flat.findIndex((x) => x.g === s.g) - 1 : flat.findIndex((x) => x.g === s.g && x.i === s.i);
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
  /** «Архивировать поддерево» (ТЗ 41 §7, Emacs `C-c C-x C-s`): the heading under the caret, its subtree whole, to
   *  its archive (`archiveTarget`), at the end of it or under its heading there; one step of ⌘Z over both files. */
  async archiveSubtree(at?: { path: string; line: number }, o: { note?: string } = {}): Promise<boolean> {
    const f = at ? this.files.find((x) => x.path === at.path) : this.file;
    const h = at ? f?.headings.find((x) => x.line === at.line) : f?.headings[this.selected];
    if (!f || !h) return false;
    if (isArchive(f.name)) {
      this.say('Заголовок уже в архиве');
      return false;
    }
    const to = archiveTarget(f.text, f.headings, h, f.name);
    const dst = to.file === f.name ? f : await this.ensureFile(to.file);
    if (!dst) return false;
    // a note first (the walk's status, ТЗ 41 §3): it goes to the archive with the subtree
    const noted = o.note ? addNote(f.text, h, o.note) : f.text;
    const nh = o.note ? (parseHeadings(noted, f.wf).find((x) => x.line === h.line) ?? h) : h;
    const entry = archiveEntry(noted, nh, f.wf, { now: new Date(), file: f.path, category: categoryOf(f.text, f.name) });
    const ref = { path: f.path, line: h.line, title: h.title };
    const title = bareTitle(h.title);
    const put = (tx: Tx) => {
      if (!to.heading) return void tx.insertHeading({ file: dst.path, position: 'end' }, entry);
      const top = tx.headings(dst.path)?.find((x) => x.level === 1 && x.title.trim() === to.heading);
      const under = top ? { path: dst.path, line: top.line, title: top.title } : tx.insertHeading({ file: dst.path, position: 'end' }, '* ' + to.heading);
      if (under) tx.insertHeading({ under, position: 'last' }, entry);
    };
    const step = await this.transaction(`В архив: ${title}`, (tx) => {
      // another file: the archive first, a failed write loses nothing; the same file: out first, its lines move
      if (dst.path === f.path) {
        tx.remove(ref);
        put(tx);
      } else {
        put(tx);
        tx.remove(ref);
      }
    });
    if (!step) return false;
    const now = this.files.find((x) => x.path === f.path);
    if (this.tab?.kind === 'file' && this.tab.path === f.path && now) this.revealLine(caretAfter(now.headings, h.line), true);
    const name = displayName(dst.name) + (to.heading ? ' › ' + to.heading : '');
    notify.note(`В архиве: ${name}`, [
      { label: 'Открыть', run: () => { const i = this.files.findIndex((x) => x.path === dst.path); if (i >= 0) this.open(i); } },
      { label: 'Отменить', run: () => void this.undo(step) },
    ], 3000);
    return true;
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

  // ---- views of a file (ТЗ 33): a file tab shown as a plugin's view («Доска») or as text ------------------------------
  /** The view each file was shown in last (name → '' text, or a view's id), on this Mac per folder. */
  private viewMemory = $state<Record<string, string>>({});
  private viewKey() {
    return 'fileView:' + (this.dir ?? '');
  }
  readViewMemory() {
    try {
      this.viewMemory = JSON.parse(lsGet(this.viewKey()) ?? '{}') ?? {};
    } catch {
      this.viewMemory = {};
    }
  }
  /** How a file tab is shown now: '' text, else a view of a plugin that is on. The tab's own choice, else the file's
   *  last one, else a view that wants the file (it has «#+BOARD»). */
  viewOf(tab: Tab | undefined): string {
    if (!tab || tab.kind !== 'file') return '';
    const ok = (v: string | undefined) => (v && fileViewOf(v) ? v : '');
    // a plugin's file type: always its view (the Org editor never shows it)
    const ft = fileTypeOf(tab.path);
    if (ft) return ft.view;
    if (tab.view !== undefined) return ok(tab.view);
    const f = this.fileOf(tab);
    if (!f) return '';
    if (f.name in this.viewMemory) return ok(this.viewMemory[f.name]);
    return allFileViews().find((v) => v.defaultFor?.(f))?.id ?? '';
  }
  /** The view the tab was set to show (its own choice, the file's last one, its file type's), even one not there now —
   *  its plugin stopped (the new interface says so in its place, ТЗ 49 §1). '' the text, null none chosen. */
  wantedView(tab: Tab | undefined): string | null {
    if (!tab || tab.kind !== 'file') return null;
    const ft = fileTypeOf(tab.path);
    if (ft) return ft.view;
    if (tab.view !== undefined) return tab.view;
    const f = this.fileOf(tab);
    return f && f.name in this.viewMemory ? this.viewMemory[f.name] : null;
  }
  /** «Показать как ›»: the tab shows the file so; remembered for the file. */
  showAs(tab: Tab, view: string) {
    const f = this.fileOf(tab);
    tab.view = view;
    if (!f) return;
    this.viewMemory = { ...this.viewMemory, [f.name]: view };
    lsSet(this.viewKey(), JSON.stringify(this.viewMemory));
  }

  // ---- panes and tabs (layout.ts does the work; the store keeps the layout of each folder) -------------------------
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
  /** The first line in view of a file tab, as it was scrolled (a tab shown again comes back there). */
  setTabTop(tab: Tab, line: number) {
    if (tab.top !== line) tab.top = line;
  }
  /** The headings folded in a file tab (S-Tab folds them all, ⇥ one): a tab shown again comes back folded so. */
  setTabFolds(tab: Tab, lines: number[]) {
    const was = tab.folds ?? [];
    if (was.length !== lines.length || was.some((x, i) => x !== lines[i])) tab.folds = lines;
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
    // the new interface has one pane yet (ТЗ 42 §4.3)
    if (this.nextUi && isMainWindow()) return void this.note('Скоро в новом интерфейсе', undefined, 2500), false;
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
  /** The active tab becomes the built-in «Агенда» («День») on a day: back from the calendar (ТЗ 47 §1.6). */
  agendaInTab(date?: string) {
    const p = this.layout.panes[this.layout.active];
    if (!p) return;
    const t = { ...newTab('agenda'), ...(date ? { data: { date } } : {}) };
    if (p.tabs.length) p.tabs[p.active] = t;
    else (p.tabs.push(t), (p.active = 0));
    this.persistLayout();
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
      if (t.kind === AGENDA_EDIT && this.builderDirty) out.push({ tab: t, kind: 'agenda', name: this.builder?.draft.name.trim() || 'Новая агенда' });
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
      if (items.some((it) => it.kind === 'agenda')) this.closeBuilder();
      return true;
    }
    // the agenda builder's tab (ТЗ 48 §5): saved by the tab itself — its checks may stop the closing
    if (items.some((it) => it.kind === 'agenda') && !(await (this.builderSaveFn?.() ?? Promise.resolve(false)))) return false;
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

  /** «Новый интерфейс (бета)» on or off (ТЗ 42 §1): unsaved tabs asked about as on quitting, the files written, then
   *  the window reloads with the other shell. */
  async setInterface(next: boolean) {
    if (next === nextOn()) return;
    if (this.settingsOpen) this.closeSettings(); // the switch is there; the unsaved tabs are asked about over the window
    if (!(await this.confirmClose(this.layout.panes.flatMap((p) => p.tabs)))) return;
    if (!next) this.unfoldPanes();
    await this.flush();
    setNext(next);
  }
  private foldedKey() {
    return 'next:folded:' + (this.dir ?? '');
  }
  /** The new interface has one pane (ТЗ 42 §4.3): a second one goes into the first, kept for the old interface. */
  foldPanesForNext() {
    const f = foldPanes(this.layout);
    if (!f) return;
    lsSet(this.foldedKey(), JSON.stringify(f));
    this.persistLayout();
  }
  /** Back to the old interface: the pane folded by the new one comes back with the tabs of it still open. */
  private unfoldPanes() {
    const raw = lsGet(this.foldedKey());
    if (!raw) return;
    lsSet(this.foldedKey(), '');
    try {
      unfoldPanes(this.layout, JSON.parse(raw) as Folded);
      this.persistLayout();
    } catch {
      /* a broken record: one pane stays */
    }
  }
  readonly nextUi = nextOn();

  /** ⌃X N S (ТЗ 42 §5.8): the tab shows only the subtree of the heading the caret is under; kept with the tab. */
  narrowTab(tab: Tab | undefined, line: number) {
    const f = this.fileOf(tab);
    const n = f ? narrowTarget(f.headings, line) : null;
    if (!tab || !n) return;
    tab.narrow = n;
    this.persistLayout();
  }
  /** ⌃X N W: the whole file again. */
  widenTab(tab: Tab | undefined) {
    if (!tab?.narrow) return;
    tab.narrow = undefined;
    this.persistLayout();
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

  async createEntry(parentRel: string, name: string, kind: 'file' | 'folder', type?: string) {
    this.creating = null;
    if (!name.trim()) return;
    const ft = type ? fileTypes().find((t) => t.ext === type) : undefined;
    try {
      await this.flush();
      const path = await invoke<string>('create_entry', { parent: this.abs(parentRel), name: ft ? withExt(name.trim(), ft) : name, isDir: kind === 'folder', text: ft?.template ?? null });
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
    // a plugin's file keeps its extension («план» → «план.canvas»)
    const ft = fileTypeOf(base);
    if (ft) newName = withExt(newName.trim(), ft);
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
      if (f) this.sync.sendEdit(path, f.text);
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
      const written = this.files.find((x) => x.path === path);
      if (written) touches.change(written, Date.now());
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
export type Scan = { name: string; path: string; shown: string; org: number; folders: number; other: number; capped: boolean; big: boolean };
export type StartScreen = { kind: 'welcome' } | { kind: 'found'; path: string; scan: Scan | null; change: boolean } | { kind: 'missing'; path: string } | null;
export type Unsaved = { tab: Tab; kind: 'file' | 'note' | 'agenda'; name: string };
export type Conflict = { path: string; name: string; disk: string; diskRaw: string; eol: Eol; mtime: number; postponed: boolean };
export type DiskAnswer = 'disk' | 'mine' | 'later' | 'saveas' | 'keep' | 'close';
const CONFLICT = 'файл на диске изменён другой программой';

export const store = new Store();
/** The agenda builder's tab in the new interface (ТЗ 48 §5). */
export const AGENDA_EDIT = 'agenda.edit';
// a plugin's file type came or went (ТЗ 39): the Rust side lists those files too, the folder is read again
let typesQueued = false;
watchFileTypes(() => {
  if (typesQueued) return;
  typesQueued = true;
  queueMicrotask(async () => {
    typesQueued = false;
    if (!isTauri) return;
    await invoke('set_note_types', { types: fileTypes().map((t) => t.ext) });
    if (store.loaded && store.dir) await store.reload();
  });
});

// the editor's part of links (ТЗ 35): it does not import the store
// the editor knows its file by its name in the folder (its path in a tab of a file that is not in it)
const fileNamed = (p: string) => store.files.find((f) => f.name === p || f.path === p);
linkHooks.rel = (p) => fileNamed(p)?.name ?? '';
linkHooks.pasted = () => store.note('Ссылка вставлена · ⌘Z — вернуть текст', undefined, 3000, LINK_ICON);
linkHooks.readClip = () => store.readClipboard();
linkHooks.archive = (p, line) => void store.archiveSubtree({ path: fileNamed(p)?.path ?? p, line });
linkHooks.undoAlong = (p, text) => store.undoAlong(fileNamed(p)?.path ?? p, text);
linkHooks.copyHeading = (p, line) => {
  const f = fileNamed(p);
  if (!f) return false;
  void store.copyHeadingLink(f.path, line);
  return true;
};
linkHooks.key = (id) => store.keyHint(id);
/** The tooltip over a link: where it goes («billing.org › Ревью архитектуры»), an address, or «не найден». */
linkHooks.describe = (link, p) => {
  const fi = store.files.findIndex((f) => f.name === p || f.path === p);
  if (fi < 0) return { text: link.raw, missing: false };
  const t = resolveLink(link, fi, store.files);
  if (t.kind === 'url') return { text: t.url, missing: false };
  if (t.kind === 'missing') return { text: link.type === 'id' || link.raw.includes('::') ? 'Заголовок не найден' : `Не найдено: ${t.what}`, missing: true };
  const f = store.files[t.file];
  const h = t.line != null ? f.headings.find((x) => x.line === t.line) : undefined;
  if (t.missingSection) return { text: `${displayName(f.name)} › раздел «${t.missingSection.replace(/^[*#]/, '')}» не найден`, missing: true };
  return { text: [f.name, h ? labelOf(h) : ''].filter(Boolean).join(' › '), missing: false };
};
/** The new interface's card over a link (ТЗ 42 §5.6). */
linkHooks.preview = (link, p) => {
  const fi = store.files.findIndex((f) => f.name === p || f.path === p);
  const t = fi < 0 ? ({ kind: 'url', url: link.raw } as const) : resolveLink(link, fi, store.files);
  if (t.kind === 'url') return { kind: 'url', url: t.url };
  if (t.kind === 'missing') return { kind: 'missing', text: link.type === 'id' || link.raw.includes('::') ? 'Заголовок не найден' : `Нет файла ${t.what}` };
  const f = store.files[t.file];
  const ref = link.type === 'id' ? 'id:' + link.path : link.raw;
  const h = t.line != null ? f.headings.find((x) => x.line === t.line) : undefined;
  if (t.missingSection) return { kind: 'missing', text: `Раздел «${t.missingSection.replace(/^[*#]/, '')}» не найден в ${displayName(f.name)}` };
  if (!h) return { kind: 'file', crumb: f.name, title: /^#\+TITLE:\s*(.+)$/im.exec(f.text)?.[1]?.trim() || displayName(f.name), ref };
  const body = bodyOf(f.text, h).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2);
  return { kind: 'heading', crumb: [displayName(f.name), ...h.path.map(plainTitle)].join(' › '), keyword: h.keyword, tone: h.keyword ? toneStyle(toneFor(h.keyword, f.wf)) : '', title: plainTitle(h.title), body, ref };
};
const plainTitle = (t: string) => t.replace(/\[\[(?:[^\]]*\]\[)?([^\]]*)\]\]/g, '$1');
linkHooks.headingAt = (p, line) => {
  const f = fileNamed(p);
  const hi = f ? headingAt(f.headings, line) : -1;
  return f && hi >= 0 ? labelOf(f.headings[hi]) : null;
};
