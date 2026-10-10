import { mapperFor, resolveLink, rewriteFileLinks, type OrgLink } from './links';
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
  curPath = $state('');
  mode = $state<'notes' | 'agenda'>('notes');
  cursor = $state({ line: 0, col: 0 });
  showNav = $state(true);
  showInspector = $state(true);
  navW = $state(264);
  inspW = $state(272);
  reveal = $state<{ line: number; n: number } | null>(null);
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

  get cur(): number {
    const i = this.files.findIndex((f) => f.path === this.curPath);
    return i >= 0 ? i : 0;
  }
  get file(): NoteFile | undefined {
    return this.files[this.cur];
  }
  get selected(): number {
    const f = this.file;
    return f ? headingAt(f.headings, this.cursor.line) : -1;
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
    const last = lsGet('lastFile:' + (this.dir ?? ''));
    const pick = files.find((f) => f.path === last) ?? files.find((f) => f.name === 'Weekly.org') ?? files[0];
    this.folders = folders;
    this.curPath = pick?.path ?? '';
    this.cursor = { line: 0, col: 0 };
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
    if (adopted) this.say(`«${adopted.split('/').pop()}» изменён снаружи — загружена версия с диска`);
    if (!this.files.some((f) => f.path === this.curPath)) this.curPath = this.files[0]?.path ?? '';
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

  setText(text: string, path = this.curPath) {
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

  open(fileIdx: number, line = 0) {
    const f = this.files[fileIdx];
    if (!f) return;
    this.curPath = f.path;
    lsSet('lastFile:' + (this.dir ?? ''), f.path);
    this.mode = 'notes';
    this.cursor = { line, col: 0 };
    this.reveal = { line, n: Date.now() };
  }


  // ---- file operations ----------------------------------------------------------

  get canManageFiles() {
    return isTauri && !!this.dir;
  }

  private abs(rel: string) {
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
      this.curPath = map(this.curPath);
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
