// «Клавиши» of the settings (ТЗ 22 §2), what both shells' sections share: the groups found by a query, recording a
// shortcut (⌃ waits a second for a chord's second press), a shortcut another command has asked about before it moves,
// the defaults given back. Each sheet draws it its own way (KeysSettings.svelte, next/SetKeys.svelte).

import { store, DEFAULT_CAPTURE_KEY } from './store.svelte';
import {
  GROUPS, KEY_COMMANDS, chordNote, commandById, conflictsOf, defaultsOf, isChord, isModified, matchesQuery, modifiedCount, outerNote,
  parsePress, pressOf, refusal, type Conflict, type KeyCommand,
} from './keys';

export class KeyEditor {
  q = $state('');
  /** Recording: which command, which of its shortcuts (null: a new one), the first press of a chord. */
  rec = $state<{ id: string; index: number | null; first?: string } | null>(null);
  /** A shortcut that another command has: asked before it moves. */
  pend = $state<{ id: string; index: number | null; key: string; conflicts: Conflict[] } | null>(null);
  errors = $state<Record<string, string>>({});
  private chordTimer: ReturnType<typeof setTimeout> | undefined;

  keysOf = (id: string) => store.bindings.get(id) ?? [];
  get captureModified() {
    return store.captureKey !== DEFAULT_CAPTURE_KEY;
  }
  modified = (id: string) => (id === 'capture' ? this.captureModified : isModified(store.keyState, id));
  get changed() {
    return modifiedCount(store.keyState) + (this.captureModified ? 1 : 0);
  }
  defaults = (c: KeyCommand) => (c.id === 'capture' ? ['⇧⌘I'] : defaultsOf(c, store.keyState.preset));
  get presetName() {
    return store.keyState.preset === 'emacs' ? 'Как в Emacs' : 'Как в macOS';
  }
  /** The groups with the commands the query finds (by name or by shortcut). */
  get groups() {
    return GROUPS.map((g) => ({ ...g, rows: KEY_COMMANDS.filter((c) => c.group === g.id && matchesQuery(c, this.keysOf(c.id), this.q)) })).filter((g) => g.rows.length);
  }
  /** A row's second line: the chord spelt out, where else it works, the command's note. */
  sub(c: KeyCommand): string {
    const ks = this.keysOf(c.id);
    const chord = ks.find(isChord);
    const parts = [chord ? chordNote(chord) : '', outerNote(store.bindings, c.id), c.note ?? ''];
    if (c.id === 'capture' && !store.captureGlobal) parts.push('Только в окне: «Работает из любой программы» выключено в разделе Inbox');
    return parts.filter(Boolean).join(' · ');
  }

  // ---- recording ----
  start(id: string, index: number | null) {
    this.pend = null;
    delete this.errors[id];
    this.rec = { id, index };
    store.keyRecording = true;
  }
  stop() {
    clearTimeout(this.chordTimer);
    this.rec = null;
    store.keyRecording = false;
  }
  /** The section is gone: no recording left behind. */
  dispose() {
    clearTimeout(this.chordTimer);
    store.keyRecording = false;
  }
  private async put(id: string, index: number | null, key: string) {
    const list = [...this.keysOf(id)];
    if (index === null) list.push(key);
    else list[index] = key;
    const err = await store.setKeys(id, list.filter(Boolean));
    if (err) this.errors[id] = /registered|taken|exist|занят/i.test(err) ? 'Занято другой программой' : err;
    else delete this.errors[id];
  }
  private finish(key: string) {
    const r = this.rec;
    this.stop();
    if (!r) return;
    const own = this.keysOf(r.id);
    if (own.includes(key) && own.indexOf(key) !== r.index) return; // it has it already
    const conflicts = conflictsOf(store.bindings, r.id, key);
    if (conflicts.length) this.pend = { id: r.id, index: r.index, key, conflicts };
    else void this.put(r.id, r.index, key);
  }
  /** A key pressed while recording (the window's, in capture). */
  key(e: KeyboardEvent) {
    const r = this.rec;
    if (!r) return;
    e.preventDefault();
    e.stopPropagation();
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return; // a modifier alone: wait for the key
    const bare = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    if (bare && e.key === 'Escape') return this.stop();
    if (bare && e.key === 'Backspace' && !r.first) {
      this.stop();
      if (r.index !== null) void store.setKeys(r.id, this.keysOf(r.id).filter((_, i) => i !== r.index)).then((err) => err && (this.errors[r.id] = err));
      return;
    }
    const press = pressOf(e);
    if (!press) return;
    if (r.first) return this.finish(r.first + ' ' + press);
    const c = commandById.get(r.id)!;
    const why = refusal(press, c.scope);
    if (why) {
      this.errors[r.id] = why;
      return;
    }
    delete this.errors[r.id];
    // a press with ⌃ may begin a chord: a second press within a second makes one (not for the system's shortcut)
    if (parsePress(press)!.ctrl && c.scope !== 'global') {
      this.rec = { ...r, first: press };
      clearTimeout(this.chordTimer);
      this.chordTimer = setTimeout(() => this.finish(press), 1000);
      return;
    }
    this.finish(press);
  }
  async replace() {
    const p = this.pend;
    this.pend = null;
    if (!p) return;
    for (const c of p.conflicts) await store.setKeys(c.id, this.keysOf(c.id).filter((k) => k !== c.key));
    await this.put(p.id, p.index, p.key);
  }
  async reset(c: KeyCommand) {
    this.pend = null;
    const err = await store.setKeys(c.id, this.defaults(c));
    if (err) this.errors[c.id] = 'Занято другой программой';
    else delete this.errors[c.id];
  }
  /** «⌘E уже назначено команде „Искать выделенное“ (Поиск). Назначить здесь и снять там?» */
  warnText(p: { key: string; conflicts: Conflict[] }) {
    const names = p.conflicts.map((x) => {
      const c = commandById.get(x.id)!;
      const g = GROUPS.find((gr) => gr.id === c.group)!.title;
      const where = g.charAt(0) + g.slice(1).toLowerCase();
      return `«${c.title}» (${where}${x.key !== p.key ? `, ${x.key}` : ''})`;
    });
    const who = names.length > 1 ? `командам ${names.join(', ')}` : `команде ${names[0]}`;
    const same = p.conflicts.every((x) => x.key === p.key);
    return `${p.key} ${same ? 'уже назначено' : 'пересекается с аккордом, назначенным'} ${who}. Назначить здесь и снять там?`;
  }
  /** The hint under a row while it records. */
  recHint(c: KeyCommand) {
    const r = this.rec;
    if (r?.first) return `${r.first}, затем… — нажмите вторую клавишу аккорда`;
    return c.scope === 'global' ? 'Нажмите сочетание · ⎋ отмена · ⌫ убрать сочетание' : 'Нажмите сочетание · можно аккорд, например ⌃C, затем S · ⎋ отмена · ⌫ убрать сочетание';
  }
}

/** «Клавиши» opened on a command (a row of «Мини-окно»): its id, taken by the section when it is shown. */
export const keysFocus = $state<{ id: string | null }>({ id: null });
