// «Статусы» of the settings (ТЗ 22 §3), what both shells' sections share: a draft of the config's sets and states,
// written a moment after each change while it has no problems; editing a keyword (Return confirms, Esc cancels; a
// word in use asks before it is renamed in the files), the quick keys, adding, deleting, the colour picker, the order
// by dragging or ⌥↑↓. Each sheet draws it its own way (StatusesSettings.svelte, next/SetStatuses.svelte).

import { store } from './store.svelte';
import { toneFor, type Workflow } from './org';
import { toneOf, toneStyle } from './colors';
import { Reorder } from './reorder.svelte';
import { setLayer } from './settingsNav.svelte';
import {
  addState, checkKey, normalizeKey, addWorkflow, canRemoveState, canRemoveWorkflow, checkKeyword, dropState, dropWorkflow, effectiveKeys,
  fromConfig, initialOf, moveState, normalizeKeyword, removeState, removeWorkflow, toJson, validate, type DraftState,
} from './workflowEditor';

type Rename = { s: DraftState; from: string; to: string; count: number };

export class StatusEditor {
  draft = $state(fromConfig(store.config));
  selectedId = $state('');
  wf = $derived(this.draft.workflows.find((w) => w.id === this.selectedId) ?? this.draft.workflows[0]);
  problems = $derived(validate(this.draft));
  private json = $derived(toJson(store.configText, this.draft));
  // nothing is written until the user actually changes something
  private baseline = toJson(store.configText, this.draft);

  /** The statuses as a Workflow, so the capsules have the colours they have everywhere in the app. */
  asWorkflow = $derived<Workflow>({
    open: this.draft.workflows.flatMap((w) => w.states.filter((s) => !s.done && !s.pending).map((s) => s.keyword)),
    done: this.draft.workflows.flatMap((w) => w.states.filter((s) => s.done && !s.pending).map((s) => s.keyword)),
    sequences: this.draft.workflows.map((w) => ({
      name: w.name,
      states: w.states.filter((s) => !s.pending).map((s) => ({ name: s.keyword, done: s.done, color: s.color || undefined })),
    })),
  });
  toneOfState = (s: DraftState) => toneOf(s.color) ?? toneFor(s.keyword || 'X', this.asWorkflow);
  chipStyle = (s: DraftState) => toneStyle(this.toneOfState(s));

  keys = $derived(this.wf ? effectiveKeys(this.wf) : new Map<string, string>());
  openStates = $derived(this.wf ? this.wf.states.filter((s) => !s.done) : []);
  doneStates = $derived(this.wf ? this.wf.states.filter((s) => s.done) : []);
  initial = $derived(this.wf ? initialOf(this.wf) : undefined);
  used = (kw: string) => (kw ? store.keywordUsage(kw) : 0);

  // ---- editing a keyword: a buffer per row ----
  edits = $state<Record<string, string>>({});
  errors = $state<Record<string, string>>({});
  private focusId = $state<string | null>(null);
  private focusTick = $state(0);
  private inputs: Record<string, HTMLInputElement | undefined> = {};
  rename = $state<Rename | null>(null);
  confirmDelete = $state<{ s: DraftState; count: number } | null>(null);
  confirmWf = $state(false);
  picker = $state<{ id: string; anchor: HTMLElement } | null>(null);
  keyEdits = $state<Record<string, string>>({});

  constructor() {
    this.selectedId = this.draft.workflows[0]?.id ?? '';
  }
  /** The section's effects: the writes, the focus of a new row, the layers ⎋ closes first. Called in its init. */
  effects() {
    $effect(() => {
      const j = this.json;
      if (this.problems.length || j === this.baseline) return;
      const t = setTimeout(async () => {
        this.baseline = j;
        // from the newest file: the main window may have written agendas meanwhile
        await store.updateConfig((raw) => toJson(raw, this.draft));
      }, 250);
      return () => clearTimeout(t);
    });
    $effect(() => {
      void this.focusTick; // each press of «+» focuses the empty row again
      const id = this.focusId;
      if (!id) return;
      queueMicrotask(() => {
        const el = this.inputs[id];
        el?.focus();
        el?.scrollIntoView({ block: 'nearest' });
      });
    });
    $effect(() => {
      void this.selectedId;
      this.confirmWf = false;
      this.picker = null;
    });
    $effect(() => setLayer('statuses', !!(this.picker || this.rename || this.confirmDelete)));
    $effect(() => () => setLayer('statuses', false));
  }
  /** An action: a row's keyword field, so it can be focused from code. */
  track = (el: HTMLInputElement, id: string) => {
    this.inputs[id] = el;
    return {
      destroy: () => {
        if (this.inputs[id] === el) delete this.inputs[id];
      },
    };
  };

  valueOf = (s: DraftState) => this.edits[s.id] ?? s.keyword;
  typing = (s: DraftState, raw: string) => {
    const v = normalizeKeyword(raw);
    this.edits[s.id] = raw.length && /\s$/.test(raw) ? v + '-' : v; // a trailing space becomes the dash at once
    const e = v ? checkKeyword(this.draft, v, s.id) : null;
    if (e) this.errors[s.id] = e;
    else delete this.errors[s.id];
  };
  private clearEdit(id: string) {
    delete this.edits[id];
    delete this.errors[id];
  }

  // ---- the quick keys: the automatic letter shown until one is typed; empty — automatic again ----
  keyShown = (s: DraftState) => this.keyEdits[s.id] ?? (s.key || this.keys.get(s.id) || '');
  typingKey = (s: DraftState, raw: string) => {
    const v = normalizeKey(raw);
    this.keyEdits[s.id] = v;
    const e = this.wf ? checkKey(this.wf, v, s.id) : null;
    if (e) this.errors['k' + s.id] = e;
    else delete this.errors['k' + s.id];
  };
  private clearKeyEdit(id: string) {
    delete this.keyEdits[id];
    delete this.errors['k' + id];
  }
  private commitKey(s: DraftState) {
    const v = this.keyEdits[s.id];
    if (v === undefined) return true;
    if (this.errors['k' + s.id]) return false;
    const current = s.key || this.keys.get(s.id) || '';
    if (v === '') s.key = ''; // back to automatic
    else if (v !== current) s.key = v; // typing the letter that is already shown changes nothing
    this.clearKeyEdit(s.id);
    return true;
  }
  keyKeydown = (e: KeyboardEvent, s: DraftState) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.commitKey(s)) (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.clearKeyEdit(s.id);
      (e.currentTarget as HTMLInputElement).blur();
    }
  };
  keyBlur = (s: DraftState) => {
    if (this.errors['k' + s.id]) this.clearKeyEdit(s.id);
    else this.commitKey(s);
  };

  // ---- the keyword: commit, cancel, rename in the files ----
  private cancel(s: DraftState) {
    this.clearEdit(s.id);
    if (s.pending) {
      if (this.wf) removeState(this.wf, s.id);
      return;
    }
    this.inputs[s.id]?.blur();
  }
  private commit(s: DraftState) {
    const v = this.valueOf(s);
    if (!v && s.pending) {
      this.cancel(s);
      return false;
    }
    if (v === s.keyword && !s.pending) {
      this.clearEdit(s.id);
      return true;
    }
    const err = checkKeyword(this.draft, v, s.id);
    if (err) {
      this.errors[s.id] = err;
      return false;
    }
    if (!s.pending && this.used(s.keyword) > 0) {
      this.rename = { s, from: s.keyword, to: v, count: this.used(s.keyword) };
      return true; // the dialog decides
    }
    this.applyKeyword(s, v);
    return true;
  }
  private applyKeyword(s: DraftState, v: string) {
    s.keyword = v;
    s.pending = false;
    this.clearEdit(s.id);
  }
  keydown = (e: KeyboardEvent, s: DraftState) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.commit(s) && !this.errors[s.id]) this.inputs[s.id]?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cancel(s);
    }
  };
  blur = (s: DraftState) => {
    if (this.rename || this.errors[s.id]) {
      if (!s.pending) this.clearEdit(s.id); // an invalid edit is dropped, the old word stays
      else if (!this.valueOf(s)) this.cancel(s);
      return;
    }
    if (this.edits[s.id] !== undefined || s.pending) this.commit(s);
  };
  focused = (s: DraftState) => (this.focusId = s.id);
  chooseRename = (mode: 'files' | 'settings' | 'cancel') => {
    const r = this.rename;
    this.rename = null;
    if (!r) return;
    if (mode === 'cancel') {
      this.clearEdit(r.s.id);
      return;
    }
    if (mode === 'files') store.renameKeywordInFiles(r.from, r.to);
    this.applyKeyword(r.s, r.to);
  };

  plus = (done = false) => {
    if (!this.wf) return;
    const s = addState(this.draft, this.wf, done);
    this.focusId = s.id;
    this.focusTick++;
  };
  addSet = () => (this.selectedId = addWorkflow(this.draft).id);

  // ---- deleting ----
  askDelete = (s: DraftState) => {
    const wf = this.wf;
    if (!wf || !canRemoveState(wf, s.id)) return;
    const n = s.pending ? 0 : this.used(s.keyword);
    if (n > 0) this.confirmDelete = { s, count: n };
    else removeState(wf, s.id);
  };
  doDelete = () => {
    const c = this.confirmDelete;
    this.confirmDelete = null;
    if (c && this.wf) removeState(this.wf, c.s.id);
  };
  canRemove = (s: DraftState) => !!this.wf && canRemoveState(this.wf, s.id);
  get canRemoveSet() {
    return canRemoveWorkflow(this.draft);
  }
  wfUsed = $derived(this.wf ? this.wf.states.reduce((n, s) => n + (s.pending ? 0 : this.used(s.keyword)), 0) : 0);
  deleteWorkflow = () => {
    const wf = this.wf;
    if (!wf || !canRemoveWorkflow(this.draft)) return;
    if (this.wfUsed > 0 && !this.confirmWf) {
      this.confirmWf = true;
      return;
    }
    this.confirmWf = false;
    const idx = this.draft.workflows.findIndex((w) => w.id === wf.id);
    removeWorkflow(this.draft, wf.id);
    this.selectedId = this.draft.workflows[Math.max(0, idx - 1)]?.id ?? '';
  };

  // ---- the colour picker ----
  pickerState = $derived(this.picker && this.wf ? this.wf.states.find((s) => s.id === this.picker!.id) : undefined);
  togglePicker = (e: MouseEvent | KeyboardEvent, s: DraftState) => {
    const anchor = e.currentTarget as HTMLElement;
    this.picker = this.picker?.id === s.id ? null : { id: s.id, anchor };
  };

  // ---- the order: a set by its grip onto another (before it) or the end; a state onto a state, the line between
  // the open and the done ones, or the end ----
  wfDrag = new Reorder((id, target) => dropWorkflow(this.draft, id, target === 'end' ? null : target));
  rowDrag = new Reorder((id, target) => void (this.wf && dropState(this.wf, id, target === 'end' ? null : target)));
  /** ⌥↑ / ⌥↓ on a row. */
  rowKey = (e: KeyboardEvent, s: DraftState) => {
    if (!e.altKey || !this.wf) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveState(this.wf, s.id, e.key === 'ArrowUp' ? -1 : 1);
      queueMicrotask(() => document.querySelector<HTMLElement>(`[data-row="${s.id}"]`)?.focus());
    }
  };
  bannerCount = $derived(this.problems.length + Object.keys(this.errors).length);
}
