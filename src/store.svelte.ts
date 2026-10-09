import { resolveLink, type OrgLink } from './links';
import { headingAt, parseHeadings, parseWorkflow, setKeyword, setPriority, type Heading, type Workflow } from './org';

export interface NoteFile {
  name: string; // relative path inside the notes folder
  path: string;
  text: string; // current (possibly edited) text
  disk: string; // text as last read from / written to disk
  wf: Workflow;
  headings: Heading[];
  filetags: string[];
}

const isTauri = '__TAURI_INTERNALS__' in window;

function build(name: string, path: string, text: string, disk = text): NoteFile {
  const wf = parseWorkflow(text);
  const ft = /^#\+FILETAGS:\s*(.+)$/m.exec(text);
  return {
    name, path, text, disk, wf,
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

class Store {
  files = $state.raw<NoteFile[]>([]);
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
    this.files = list.map((f) => build(f.name, f.path, f.text));
    const last = lsGet('lastFile:' + (this.dir ?? ''));
    const pick = this.files.find((f) => f.path === last) ?? this.files.find((f) => f.name === 'Weekly.org') ?? this.files[0];
    this.curPath = pick?.path ?? '';
    this.cursor = { line: 0, col: 0 };
    this.loaded = true;
  }

  /** Re-read the folder after something changed on disk, keeping unsaved local edits. */
  async reload() {
    if (!this.dir && isTauri) return;
    const list = this.sorted(await this.listFiles());
    const old = new Map(this.files.map((f) => [f.path, f]));
    let adopted = '';
    this.files = list.map((n) => {
      const o = old.get(n.path);
      if (!o) return build(n.name, n.path, n.text);
      if (n.text === o.disk) return o; // nothing new on disk (untouched)
      if (n.text === o.text) return { ...o, disk: n.text }; // echo of our own save
      if (o.text !== o.disk) adopted = n.name; // we had unsaved edits: disk wins, but say so
      return build(n.name, n.path, n.text);
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
    const next = build(f.name, f.path, text, f.disk);
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
    try {
      await invoke('save_org_file', { path, text, base: f.disk });
      this.files = this.files.map((x) => (x.path === path ? { ...x, disk: text } : x));
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
