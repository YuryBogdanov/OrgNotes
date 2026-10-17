// «Сохранить как…» for a tab that has no file yet (ТЗ 10), apart from how it looks: the name (the note's first line),
// the folder (the neighbour pane's file's, else the last one used, else the root), a new folder, «Заменить?» for a
// name taken; the keys. The old sheet (SaveAsSheet.svelte) and the new interface's draw the same.

import { store } from './store.svelte';
import { noOrg, noteName } from './names';
import type { Tab } from './layout';

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const dirOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');

export class SaveAsCtl {
  name = $state('');
  dir = $state('');
  newFolder = $state<string | null>(null);
  replace = $state(false);
  busy = $state(false);
  rootName = $derived(store.dir?.split('/').pop() ?? 'Заметки');
  folders = $derived(['', ...[...store.folders].sort((a, b) => a.localeCompare(b, 'ru'))]);
  pathLine = $derived([this.rootName, ...this.dir.split('/').filter(Boolean)].join(' › '));
  fileName = $derived(noOrg(this.name.trim())); // as the app shows it
  /** The component's: the editor focused again as the sheet goes, the name's field again after «Заменить?». */
  onfocusEditor: () => void = () => {};
  onfocusName: () => void = () => {};

  constructor(readonly tab: Tab) {
    // a file gone from disk keeps its name and, if it is still there, its folder
    const orphan = tab.kind === 'file' ? store.orphans[tab.path ?? ''] : undefined;
    this.name = orphan ? noOrg(orphan.name.split('/').pop()!) : noteName(tab.text ?? '').replace(/[/:\\]/g, '-').replace(/^\.+/, '');
    this.dir = this.initialDir(orphan?.name);
  }
  private initialDir(orphan?: string) {
    if (orphan !== undefined) {
      const d = dirOf(orphan);
      return d === '' || store.folders.includes(d) ? d : '';
    }
    const L = store.layout;
    for (let i = 0; i < L.panes.length; i++) {
      if (L.panes[i].tabs.some((t) => t.id === this.tab.id)) continue;
      const f = store.fileOf(L.panes[i].tabs[L.panes[i].active]);
      if (f) return dirOf(f.name);
    }
    const last = lsGet('saveAsDir:' + (store.dir ?? ''));
    return last !== null && (last === '' || store.folders.includes(last)) ? last : '';
  }
  makeFolder = async () => {
    const n = (this.newFolder ?? '').trim();
    this.newFolder = null;
    if (!n) return;
    const rel = await store.createFolder(this.dir, n);
    if (rel !== null) this.dir = rel;
  };
  save = async (overwrite = false) => {
    if (this.busy || !this.name.trim()) return;
    this.busy = true;
    const r = await store.commitSaveAs(this.tab, this.dir, this.name.trim(), overwrite);
    this.busy = false;
    if (r === 'exists') return void (this.replace = true);
    this.replace = false;
    if (r !== 'ok') store.sayDraft(r); // the sheet closes, the tab stays unsaved
    this.done(r === 'ok');
  };
  submit = () => (this.newFolder !== null ? this.makeFolder() : this.save());
  done = (saved: boolean) => {
    store.finishSaveAs(saved);
    requestAnimationFrame(() => this.onfocusEditor());
  };
  closeAsk = () => {
    this.replace = false;
    queueMicrotask(() => this.onfocusName());
  };
  key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (this.replace) this.closeAsk();
    else if (this.newFolder !== null) this.newFolder = null;
    else this.done(false);
  };
}
