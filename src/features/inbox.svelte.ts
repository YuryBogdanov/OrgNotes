// The Inbox section of the navigator as a module of its own (roadmap 0.2): the list of unsorted tasks and its actions.
// The quick entry and the setting «файл Inbox» stay in the core (they are standard Org: a task goes to a file).

import { store, type NoteFile } from '../store.svelte';
import { inboxItems, type InboxItem } from '../inbox';
import { firstDone, sequenceFor, type Heading } from '../org';
import { refOf } from '../journal';

class Inbox {
  /** The task going away after «Перенести» (the same short fade as «Готово»). */
  leaving = $state<number | null>(null);
  /** The unsorted tasks of the Inbox file. */
  get list(): InboxItem[] {
    const f = store.inboxFile;
    return f ? inboxItems(f.text, f.headings, f.wf, store.inboxCfg.order) : [];
  }
  private heading(item: InboxItem): { f: NoteFile; h: Heading } | null {
    const f = store.inboxFile;
    const h = f?.headings.find((x) => x.line === item.line && x.title === item.title);
    return f && h ? { f, h } : null;
  }
  async done(item: InboxItem) {
    const r = this.heading(item);
    if (!r) return;
    const kw = firstDone(sequenceFor(r.f.wf, r.h.keyword)) ?? r.f.wf.done[0];
    if (kw) await store.transaction(`Выполнено: ${r.h.title}`, (tx) => tx.setStatus(refOf(r.f, r.h), kw));
  }
  async remove(item: InboxItem) {
    const r = this.heading(item);
    if (r) await store.transaction(`Удалено: ${r.h.title}`, (tx) => tx.remove(refOf(r.f, r.h)));
  }
  async date(item: InboxItem, kind: 'SCHEDULED' | 'DEADLINE', date: Date | null) {
    const r = this.heading(item);
    if (r) await store.transaction(`Дата: ${r.h.title}`, (tx) => tx.setPlanning(refOf(r.f, r.h), kind, date));
  }
  /** «Открыть»: the Inbox file in the editor, at the task. */
  openItem(item: InboxItem) {
    const f = store.inboxFile;
    const i = f ? store.files.indexOf(f) : -1;
    if (i >= 0) store.open(i, item.line);
  }
  /** «Перенести…» of a task: the core's move, the row fading out just before the write. */
  refile(item: InboxItem) {
    const r = this.heading(item);
    if (!r) return;
    store.refileHeading(r.f, r.h, {
      before: async (h) => {
        this.leaving = h.line;
        await new Promise((ok) => setTimeout(ok, 180));
        this.leaving = null;
      },
    });
  }
}

export const inbox = new Inbox();
