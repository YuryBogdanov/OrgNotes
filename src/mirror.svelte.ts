// The mini window (ТЗ 31; tech sprint 2.3, from the store): one state of the files in two windows. The main window
// owns the files (it reads, watches and writes them); the mini window mirrors them: it gets them all at its start,
// sends its edits here, and gets every change of another (typed here, from disk) back. The store owns one and gives
// it its files.

import type { NoteFile } from './store.svelte';
import { lsGetJson, lsSet } from './storage';
import { isTauri } from './tauri';

/** The note of the mini window (ТЗ 31): a heading of a file (by its title near its line), or the file whole. */
export interface MiniNote {
  path: string; // the file's name in the notes folder
  line: number;
  title: string;
  whole?: boolean;
}
export interface MiniSnapshot {
  dir: string | null;
  configRaw: string | null;
  note: MiniNote | null;
  files: { name: string; path: string; text: string; disk: string; diskRaw: string; eol: string }[];
}

/** What the store gives: its files and folder, and what it does with what comes from the other window. */
export interface MirrorHost {
  files(): NoteFile[];
  configRaw(): string | null;
  dir(): string | null;
  /** The main window: the mini window's edit. */
  edit(path: string, text: string): void;
  /** The main window: «Открыть в главном окне». */
  openMain(name: string, line: number): void;
  /** The mini window: everything from the main window (its start, a file came or went, the statuses changed). */
  take(s: MiniSnapshot): void;
  /** The mini window: one file changed there. */
  takeFile(p: { path: string; text: string; disk: string; diskRaw: string }): void;
  /** The mini window outside Tauri: nothing to wait for. */
  ready(): void;
}

export class MiniSync {
  private host: MirrorHost;
  constructor(host: MirrorHost) {
    this.host = host;
  }
  /** This store is the mini window's: no disk of its own, its edits go to the main window. */
  mirror = false;
  /** The note of the mini window (shown in it, or for its next show): a heading, or the file whole. */
  miniNote = $state<MiniNote | null>(lsGetJson<MiniNote>('mini:note'));
  /** The main window: the text the mini window has of each file (sent or got from it); null — no mini window yet. */
  private mini: Map<string, string> | null = null;
  /** The main window: the files and the statuses the mini window's snapshot had. */
  private miniPaths = '';
  private miniCfg: string | null = null;
  private async emit(event: string, payload: unknown) {
    if (!isTauri) return;
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo(this.mirror ? 'main' : 'mini', event, payload).catch(() => {});
  }
  private snapshot(): MiniSnapshot {
    const files = this.host.files();
    const configRaw = this.host.configRaw();
    this.mini = new Map(files.map((f) => [f.path, f.text]));
    this.miniPaths = files.map((f) => f.path).join('\n');
    this.miniCfg = configRaw;
    return { dir: this.host.dir(), configRaw, note: this.miniNote, files: files.map((f) => ({ name: f.name, path: f.path, text: f.text, disk: f.disk, diskRaw: f.diskRaw, eol: f.eol })) };
  }
  /** The main window: the mini window started (or asks again) — everything it mirrors; then each change. */
  async serve() {
    const { listen } = await import('@tauri-apps/api/event');
    await listen('mini-hello', () => void this.emit('mini-snapshot', this.snapshot()));
    await listen<{ path: string; text: string }>('mini-edit', (e) => {
      this.mini?.set(e.payload.path, e.payload.text); // it has it: not sent back
      this.host.edit(e.payload.path, e.payload.text);
    });
    await listen<{ path: string; line: number }>('mini-open-main', (e) => this.host.openMain(e.payload.path, e.payload.line));
    $effect.root(() => {
      $effect(() => {
        const files = this.host.files();
        const configRaw = this.host.configRaw();
        const m = this.mini;
        if (!m) return;
        // a file came or went, the statuses changed: all of it again
        if (files.map((f) => f.path).join('\n') !== this.miniPaths || configRaw !== this.miniCfg) return void this.emit('mini-snapshot', this.snapshot());
        for (const f of files)
          if (m.get(f.path) !== f.text) {
            m.set(f.path, f.text);
            void this.emit('mini-file', { path: f.path, text: f.text, disk: f.disk, diskRaw: f.diskRaw });
          }
      });
    });
  }
  /** The mini window: its files from the main window. */
  async load() {
    this.mirror = true;
    if (!isTauri) return this.host.ready();
    const { listen } = await import('@tauri-apps/api/event');
    await listen<MiniSnapshot>('mini-snapshot', (e) => {
      if (e.payload.note && !this.miniNote) this.miniNote = e.payload.note;
      this.host.take(e.payload);
    });
    await listen<{ path: string; text: string; disk: string; diskRaw: string }>('mini-file', (e) => this.host.takeFile(e.payload));
    await listen<MiniNote>('mini-open', (e) => this.setMiniNote(e.payload));
    void this.emit('mini-hello', null);
  }
  /** The mini window: its edit, written by the main window (which says if it could not). */
  sendEdit(path: string, text: string) {
    void this.emit('mini-edit', { path, text });
  }
  /** The note the mini window shows, kept for its next show. */
  setMiniNote(n: MiniNote | null) {
    this.miniNote = n;
    lsSet('mini:note', JSON.stringify(n));
  }
}
