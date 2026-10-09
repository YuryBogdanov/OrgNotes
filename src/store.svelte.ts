import { mapperFor, resolveLink, rewriteFileLinks, type OrgLink } from './links';
import { headingAt, joinEol, parseHeadings, parseWorkflow, setKeyword, setPriority, splitEol, type Eol, type Heading, type Workflow } from './org';

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

function build(name: string, path: string, text: string, disk: string, diskRaw: string, eol: Eol): NoteFile {
  const wf = parseWorkflow(text);
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

function fromDisk(l: Listed): NoteFile {
  const { text, eol } = splitEol(l.text);
  return build(l.name, l.path, text, text, l.text, eol);
}

class Store {
  files = $state.raw<NoteFile[]>([]);
  folders = $state.raw<string[]>([]); // relative paths of all sub-folders, including empty ones
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
    // browser fallback: bundled sample notes, edits stay in memory
    const raw = import.meta.glob('../sample-notes/**/*.org', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    return Object.entries(raw).map(([k, text]) => ({ name: k.replace('../sample-notes/', ''), path: k, text }));
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
    const list = this.sorted(await this.listFiles());
    this.files = list.map(fromDisk);
    await this.loadFolders();
    const last = lsGet('lastFile:' + (this.dir ?? ''));
    const pick = this.files.find((f) => f.path === last) ?? this.files.find((f) => f.name === 'Weekly.org') ?? this.files[0];
    this.curPath = pick?.path ?? '';
    this.cursor = { line: 0, col: 0 };
    this.loaded = true;
  }

  private async loadFolders() {
    if (isTauri) {
      this.folders = await invoke<string[]>('list_folders');
    } else {
      const set = new Set<string>();
      for (const f of this.files) {
        const parts = f.name.split('/').slice(0, -1);
        parts.forEach((_, i) => set.add(parts.slice(0, i + 1).join('/')));
      }
      this.folders = [...set];
    }
  }

  /** Re-read the folder after something changed on disk, keeping unsaved local edits. */
  async reload() {
    if (!this.dir && isTauri) return;
    const list = this.sorted(await this.listFiles());
    await this.loadFolders();
    const old = new Map(this.files.map((f) => [f.path, f]));
    let adopted = '';
    this.files = list.map((n) => {
      const o = old.get(n.path);
      if (!o) return fromDisk(n);
      if (n.text === o.diskRaw) return o; // nothing new on disk (untouched)
      const { text } = splitEol(n.text);
      if (text === o.text) return { ...o, disk: text, diskRaw: n.text }; // echo of our own save
      if (o.text !== o.disk) adopted = n.name; // we had unsaved edits: disk wins, but say so
      return fromDisk(n);
    });
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
    const next = build(f.name, f.path, text, f.disk, f.diskRaw, f.eol);
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
    try {
      await invoke('save_org_file', { path, text: out, base: f.diskRaw });
      this.files = this.files.map((x) => (x.path === path ? { ...x, disk: text, diskRaw: out } : x));
      // typed more while the write was in flight: keep going
      const now = this.files.find((x) => x.path === path);
      if (now && now.text !== now.disk) this.scheduleSave(path);
      else this.saveState = 'saved';
    } catch (e) {
      this.saveState = 'saved';
      if (String(e) === 'conflict') await this.reload();
      else this.say('Не удалось сохранить: ' + e);
    }
  }
}

export const store = new Store();
