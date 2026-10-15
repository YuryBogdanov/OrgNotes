// The Inbox (`inbox` in config.json: the file and how it works; tech sprint 2.4, from the store) and the quick entry
// into it. The store owns one and gives it its files and the transaction that writes them.

import { DEFAULT_INBOX, append, entry, prepend, readInbox, withInbox, type InboxConfig } from './inbox';
import { notify } from './notify.svelte';
import { sequenceFor, startOf } from './org';
import type { Step, Tx } from './journal';
import type { NoteFile } from './store.svelte';

/** What the store gives: its files, the writes, a file made in the root, whether a sheet is up. */
export interface InboxHost {
  files(): NoteFile[];
  updateConfig(make: (raw: string | null) => string): Promise<boolean>;
  transaction(label: string, build: (tx: Tx) => void): Promise<Step | null>;
  /** A file made in the root and read; null, or why it could not be (one that is there already is fine). */
  create(name: string): Promise<string | null>;
  sheetOpen(): boolean;
}

export class InboxStore {
  private host: InboxHost;
  constructor(host: InboxHost) {
    this.host = host;
  }
  /** The Inbox as config.json sets it (read with the config). */
  cfg = $state.raw<InboxConfig>(DEFAULT_INBOX);
  get file(): NoteFile | undefined {
    const f = this.cfg.file;
    return f ? this.host.files().find((x) => x.name === f) : undefined;
  }
  async setInbox(c: Partial<InboxConfig>) {
    const next = { ...this.cfg, ...c };
    await this.host.updateConfig((raw) => withInbox(raw, { ...readInbox(this.cfgIn(raw)), ...c }));
    this.cfg = next;
  }
  private cfgIn(raw: string | null) {
    try {
      return raw ? JSON.parse(raw)?.inbox : undefined;
    } catch {
      return undefined;
    }
  }
  /** «Создать inbox.org в рабочей папке»: an empty file in the root, set as the Inbox at once (an existing one is
   *  simply taken). */
  async createInboxFile() {
    if (!this.host.files().some((f) => f.name === 'inbox.org')) {
      const err = await this.host.create('inbox.org');
      if (err) return notify.say('Не удалось создать inbox.org: ' + err);
    }
    await this.setInbox({ file: 'inbox.org' });
  }
  /** Quick entry: a task at the top or the end of the Inbox file (as set), on disk at once. */
  async addToInbox(title: string, details: string): Promise<'ok' | 'nofile' | 'empty' | 'error'> {
    if (!title.trim()) return 'empty';
    const f = this.file;
    if (!f) return 'nofile';
    const status = this.cfg.status && f.wf.open.includes(this.cfg.status) ? this.cfg.status : startOf(sequenceFor(f.wf, null));
    const task = entry(title, details, status, this.cfg.created ? new Date() : null);
    const add = this.cfg.add === 'end' ? append : prepend;
    return (await this.host.transaction('Новая задача в Inbox', (tx) => tx.update(f.path, (t) => add(t, task)))) ? 'ok' : 'error';
  }
  /** The quick entry inside the window (⇧⌘I with the window in front, «+» in the Inbox panel). */
  capture = $state<{ n: number } | null>(null);
  /** «Выбрать файл…» for the Inbox: the palette of files. */
  pickInbox = $state(0);
  openCapture() {
    if (this.host.sheetOpen() && !this.capture) return;
    this.capture = { n: Date.now() };
  }
}
