import {
  activeTab, closePane, closeTab, dropMissing, emptyLayout, focusPane, keepOne, mapPaths, newTab, openAgenda,
  openFile, openFromAgenda, restore, serialize, splitRight, swap, toggleSecond, copyTab, type Layout, type Tab,
  newUntitled, moveTab, duplicateTab, othersOf, targetOf, UNTITLED,
} from './layout';
import { mapperFor, resolveLink, rewriteFileLinks, type OrgLink } from './links';
import { displayName, withOrg } from './names';
import { EMPTY_CONFIG, headingAt, joinEol, parseHeadings, parseProjectConfig, resolveWorkflow, setKeyword, setPriority, splitEol, type Eol, type Heading, type ProjectConfig, type Workflow } from './org';

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

const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

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

type Listed = { name: string; path: string; text: string };

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
  unsavedReq = $state<{ tab: Tab; resolve: (answer: 'save' | 'discard' | 'cancel') => void } | null>(null);
  /** "Показать в навигаторе": expand to this file and mark it for a moment. */
  navReveal = $state<{ path: string; n: number } | null>(null);
  showNav = $state(true);
  showInspector = $state(true);
  navW = $state(248);
  inspW = $state(272);
  saveState = $state<'saved' | 'saving' | 'memory'>(isTauri ? 'saved' : 'memory');
  dir = $state<string | null>(null);
  needFolder = $state(false);
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
    return this.files.findIndex((f) => f.path === this.curPath);
  }
  get file(): NoteFile | undefined {
    return this.files[this.cur];
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
    return t?.kind === 'file' ? this.files.find((f) => f.path === t.path) : undefined;
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
    this.config = config;
    if (warnings.length) this.say('.orgnotes/config.json: ' + warnings[0] + (warnings.length > 1 ? ` (и ещё ${warnings.length - 1})` : ''));
    return true;
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

  /** Settings open in their own window inside the app, and as a sheet in a plain browser. */
  async openSettings() {
    if (!isTauri || (window as any).__ORG_SETTINGS_OVERLAY__) {
      this.settingsOpen = true;
      return;
    }
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existing = await WebviewWindow.getByLabel('settings');
      if (existing) {
        await existing.setFocus();
        return;
      }
      new WebviewWindow('settings', {
        url: 'index.html#settings',
        title: 'Настройки',
        width: 1040,
        height: 740,
        minWidth: 840,
        minHeight: 560,
        center: true,
        dragDropEnabled: false,
      });
    } catch (e) {
      this.settingsOpen = true; // never leave the user without settings
      this.say('Не удалось открыть окно настроек: ' + e);
    }
  }

  /** Persist the project config (Settings) and apply it right away. */
  async saveConfig(json: string) {
    try {
      if (isTauri) await invoke('write_project_config', { text: json });
      if (this.takeConfig(json)) this.rebuildAll();
    } catch (e) {
      this.say('Не удалось сохранить настройки: ' + e);
    }
  }

  private sorted(list: Listed[]) {
    const order = (n: string) => (n.includes('/') ? 1 : 0);
    return list.sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name, 'ru'));
  }

  /** First load, and after the notes folder changes. */
  async load() {
    if (isTauri) {
      this.dir = await invoke<string | null>('get_notes_dir');
      this.hasSample = !!(await invoke<string | null>('sample_notes_dir'));
      this.needFolder = !this.dir;
      if (!this.dir) {
        this.files = [];
        this.loaded = true;
        return;
      }
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
      const list = this.sorted(await this.listFiles());
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
    const old = new Map(this.files.map((f) => [f.path, f]));
    let adopted = '';
    this.files = list.map((n) => {
      const o = old.get(n.path);
      if (!o) return fromDisk(n, this.config);
      if (n.text === o.diskRaw) return o; // nothing new on disk (untouched, or the echo of our own save)
      const { text } = splitEol(n.text);
      if (text === o.text) return { ...o, disk: text, diskRaw: n.text };
      if (o.text !== o.disk) adopted = n.name; // we had unsaved edits: disk wins, but say so
      return fromDisk(n, this.config);
    });
    this.folders = folders;
    if (adopted) this.say(`«${displayName(adopted)}» изменён снаружи — загружена версия с диска`);
    // a file that disappeared closes its tabs, in both panes
    dropMissing(this.layout, (p) => this.files.some((f) => f.path === p));
  }

  async chooseFolder() {
    if (!isTauri) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const sel = await open({ directory: true, multiple: false, title: 'Папка с заметками' });
    if (typeof sel === 'string') await this.useFolder(sel);
  }

  async useFolder(path: string) {
    await invoke('set_notes_dir', { path });
    await this.load();
  }

  async useSample() {
    const p = await invoke<string | null>('sample_notes_dir');
    if (p) await this.useFolder(p);
  }

  async listen() {
    if (!isTauri) return;
    const { listen } = await import('@tauri-apps/api/event');
    await listen('notes-changed', () => this.reload());
  }

  setText(text: string, path: string = this.curPath) {
    const f = this.files.find((x) => x.path === path);
    if (!f || f.text === text) return;
    const next = build(f.name, f.path, text, f.disk, f.diskRaw, f.eol, this.config);
    this.files = this.files.map((x) => (x.path === path ? next : x));
    this.scheduleSave(path);
  }

  /** Apply a text patch to the heading under the cursor. */
  patch(fn: (text: string, h: Heading, wf: Workflow) => string) {
    const f = this.file;
    const h = f?.headings[this.selected];
    if (!f || !h) return;
    this.setText(fn(f.text, h, f.wf));
  }
  setKeyword(kw: string | null) { this.patch((t, h, wf) => setKeyword(t, h, kw, wf)); }
  setPriority(p: string | null) { this.patch((t, h) => setPriority(t, h, p)); }

  /**
   * Open a file in the active pane: a tab that already shows it is reused, the active file tab is retargeted
   * (like a click in Xcode's navigator), an agenda tab keeps its place and the file opens next to it.
   */
  open(fileIdx: number, line = 0) {
    const f = this.files[fileIdx];
    if (!f) return;
    openFile(this.layout, this.layout.active, f.path, line, { replace: true });
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
  isUnsaved(t: Tab | undefined) {
    return !!t && t.kind === 'untitled' && !!t.text;
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
  /** Ask about unsaved text before a tab goes away. True when it may be closed. */
  private async mayClose(t: Tab): Promise<boolean> {
    if (!this.isUnsaved(t)) return true;
    const [pi, ti] = this.where(t);
    if (pi >= 0) this.activateTab(pi, ti); // show what the question is about
    const answer = await new Promise<'save' | 'discard' | 'cancel'>((resolve) => (this.unsavedReq = { tab: t, resolve }));
    this.unsavedReq = null;
    if (answer === 'cancel') return false;
    if (answer === 'discard') return true;
    return this.saveAs(t); // closes only after a successful write
  }
  async closeTab(pi: number, ti: number) {
    const t = this.layout.panes[pi]?.tabs[ti];
    if (!t || !(await this.mayClose(t))) return;
    const [p2, t2] = this.where(t);
    if (p2 >= 0) closeTab(this.layout, p2, t2);
  }
  async closeActiveTab() {
    const p = this.layout.panes[this.layout.active];
    if (p?.tabs.length) await this.closeTab(this.layout.active, p.active);
  }
  /** "Закрыть остальные": asks about each unsaved tab in turn; "Отмена" stops there. */
  async closeOthers(pi: number, ti: number) {
    const keep = this.layout.panes[pi]?.tabs[ti];
    if (!keep) return;
    for (const t of othersOf(this.layout, pi, ti)) {
      if (!(await this.mayClose(t))) break;
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
    if (t?.kind === 'untitled') await this.saveAs(t);
    else await this.flush();
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
        ? await invoke<string>('save_new_file', { parent: this.abs(dirRel), name, text: t.text ?? '', overwrite })
        : `${dirRel ? dirRel + '/' : ''}${withOrg(name)}`;
      lsSet('saveAsDir:' + (this.dir ?? ''), dirRel);
      if (isTauri) await this.reload();
      else this.files = [...this.files, fromDisk({ name: path, path, text: t.text ?? '' }, this.config)].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
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
      this.say(this.errorText(e));
      return null;
    }
  }
  /** Quit, asking about every unsaved tab first. */
  async quit() {
    for (const p of [...this.layout.panes])
      for (const t of [...p.tabs]) {
        if (!this.isUnsaved(t)) continue;
        if (!(await this.mayClose(t))) return;
      }
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
    for (const f of this.files.filter((x) => x.text !== x.disk)) await this.save(f.path);
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
      await invoke('trash_entry', { path: this.abs(rel) });
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
    if (!isTauri) return;
    this.saveState = 'saving';
    clearTimeout(this.timers.get(path));
    this.timers.set(path, setTimeout(() => this.save(path), 500));
  }

  private async save(path: string) {
    const f = this.files.find((x) => x.path === path);
    if (!f || f.text === f.disk) {
      this.saveState = 'saved';
      return;
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
      if (String(failure) === 'conflict') await this.reload();
      else this.say('Не удалось сохранить: ' + failure);
      return;
    }
    // typed more while the write was in flight: keep going
    const now = this.files.find((x) => x.path === path);
    if (now && now.text !== now.disk) this.scheduleSave(path);
    else this.saveState = 'saved';
  }
}

export const store = new Store();
