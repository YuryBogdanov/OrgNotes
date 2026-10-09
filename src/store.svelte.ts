import { headingAt, parseHeadings, parseWorkflow, setKeyword, setPriority, type Heading, type Workflow } from './org';

export interface NoteFile {
  name: string; // relative path inside the notes folder
  path: string;
  text: string;
  wf: Workflow;
  headings: Heading[];
  filetags: string[];
}

const isTauri = '__TAURI_INTERNALS__' in window;

function build(name: string, path: string, text: string): NoteFile {
  const wf = parseWorkflow(text);
  const ft = /^#\+FILETAGS:\s*(.+)$/m.exec(text);
  return {
    name, path, text, wf,
    headings: parseHeadings(text, wf),
    filetags: ft ? ft[1].split(':').map((s) => s.trim()).filter(Boolean) : [],
  };
}

class Store {
  files = $state.raw<NoteFile[]>([]);
  cur = $state(0);
  mode = $state<'notes' | 'agenda'>('notes');
  cursor = $state({ line: 0, col: 0 });
  showNav = $state(true);
  showInspector = $state(true);
  navW = $state(264);
  inspW = $state(272);
  reveal = $state<{ line: number; n: number } | null>(null);
  saveState = $state<'saved' | 'saving' | 'memory'>(isTauri ? 'saved' : 'memory');
  private timer: ReturnType<typeof setTimeout> | undefined;

  get file(): NoteFile | undefined {
    return this.files[this.cur];
  }
  get selected(): number {
    const f = this.file;
    return f ? headingAt(f.headings, this.cursor.line) : -1;
  }

  async load() {
    let list: { name: string; path: string; text: string }[];
    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      list = await invoke('list_org_files');
    } else {
      // browser fallback: bundled sample notes, edits stay in memory
      const raw = import.meta.glob('../sample-notes/**/*.org', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
      list = Object.entries(raw).map(([k, text]) => ({ name: k.replace('../sample-notes/', ''), path: k, text }));
    }
    const order = (n: string) => (n.includes('/') ? 1 : 0);
    list.sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name, 'ru'));
    this.files = list.map((f) => build(f.name, f.path, f.text));
    const w = this.files.findIndex((f) => f.name === 'Weekly.org');
    this.cur = w >= 0 ? w : 0;
  }

  setText(text: string, idx = this.cur) {
    const f = this.files[idx];
    if (!f || f.text === text) return;
    const next = build(f.name, f.path, text);
    this.files = this.files.map((x, i) => (i === idx ? next : x));
    this.scheduleSave(idx);
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
    this.cur = fileIdx;
    this.mode = 'notes';
    this.cursor = { line, col: 0 };
    this.reveal = { line, n: Date.now() };
  }

  private scheduleSave(idx: number) {
    if (!isTauri) return;
    this.saveState = 'saving';
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      const f = this.files[idx];
      if (!f) return;
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_org_file', { path: f.path, text: f.text });
      this.saveState = 'saved';
    }, 500);
  }
}

export const store = new Store();
