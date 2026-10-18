// The agenda builder's workings (ТЗ 05; ТЗ 48 §5 — the new interface's tab draws them): the draft's blocks and their
// conditions, the one popover of a choice (a field, an operator, a value — single or multiple —, the sources, the
// grouping, the order), its keys, the forms of «ближайшие N дней» / «в диапазоне», dragging the blocks, saving with the
// checks (a name taken, a value missing). The old interface's sheet (AgendaBuilder.svelte) keeps its own copy of the
// same until the old interface goes.

import { tick } from 'svelte';
import { store } from './store.svelte';
import { Reorder } from './reorder.svelte';
import { MULTI, allTagsOf, dateOfForm, folderTree, isChecked, optionsFor, statusSets, valueKind, type Kind, type Opt } from './builderOptions';
import { isoDay } from './calIndex';
import { incomplete, nameProblem, newBlock, newCond, noValue, type Agenda, type Block, type Cond, type DateVal, type Field } from './agendas';

export class AgendaBuilderCtl {
  constructor(
    readonly draft: Agenda,
    private root: () => HTMLElement | undefined,
  ) {}
  /** The block open (one at a time). */
  open = $state('');
  /** The values missing are marked once «Сохранить» was tried. */
  showErrors = $state(false);
  private q = (sel: string) => this.root()?.querySelector<HTMLElement>(sel) ?? null;

  get others() {
    return store.agendas.filter((a) => a.id !== this.draft.id).map((a) => a.name);
  }
  get problem() {
    return nameProblem(this.draft.name, this.others);
  }
  get today() {
    return new Date(store.today.getFullYear(), store.today.getMonth(), store.today.getDate());
  }
  get sets() {
    return statusSets(store.files, this.draft.sources, store.config);
  }
  allTags = $derived(allTagsOf(store.files));
  tree = $derived(folderTree(store.folders, store.files.map((f) => f.name)));
  exists = (rel: string) => store.folders.includes(rel) || store.files.some((f) => f.name === rel);

  // ---- the popover of a choice ------------------------------------------------------------------------------------
  pop = $state<{ kind: Kind; block: Block; cond?: Cond; anchor: HTMLElement } | null>(null);
  filter = $state('');
  hi = $state(0);
  picked = $state<string[]>([]);
  form = $state<'next' | 'range' | null>(null);
  formN = $state('7');
  formFrom = $state('');
  formTo = $state('');
  popEl: HTMLElement | undefined = undefined;
  opts = $derived(this.pop ? optionsFor(this.pop.kind, this.pop.cond?.field, this.filter, this.picked, { sets: this.sets, tags: this.allTags, tree: this.tree }) : []);
  items = $derived(this.opts.filter((o) => !o.head));
  searchable = $derived(!!this.pop && (this.pop.kind === 'tag' || this.pop.kind === 'path' || this.pop.kind === 'sources' || (this.pop.kind === 'status' && this.sets.length > 1)));
  isMulti = $derived(!!this.pop && MULTI.includes(this.pop.kind));
  checked = (id: string) => (this.pop ? isChecked(this.pop.kind, id, { multi: this.isMulti, picked: this.picked, cond: this.pop.cond, block: this.pop.block }) : false);

  async openPop(kind: Kind, block: Block, anchor: HTMLElement, cond?: Cond) {
    if (this.pop?.anchor === anchor && this.pop.kind === kind) return this.closePop(true);
    if (this.pop) this.closePop(true, false);
    this.filter = '';
    this.form = null;
    this.picked = kind === 'sources' ? [...this.draft.sources] : MULTI.includes(kind) ? [...(cond?.values ?? [])] : [];
    this.pop = { kind, block, cond, anchor };
    await tick();
    const i = this.items.findIndex((o) => this.checked(o.id));
    this.hi = Math.max(0, i);
    this.focusPop();
    this.scrollHi();
  }
  focusPop() {
    (this.popEl?.querySelector<HTMLElement>('input.search') ?? this.popEl)?.focus();
  }
  /** Closed; a multiple choice taken (`commit`) or dropped. The focus back to the control. */
  closePop(commit: boolean, refocus = true) {
    const p = this.pop;
    if (!p) return;
    if (commit && this.isMulti) {
      if (p.kind === 'sources') this.draft.sources = [...this.picked];
      else if (p.cond) p.cond.values = [...this.picked];
    }
    this.pop = null;
    this.form = null;
    if (refocus && p.anchor.isConnected) p.anchor.focus();
  }
  scrollHi() {
    queueMicrotask(() => this.popEl?.querySelector<HTMLElement>('.opt.hi')?.scrollIntoView({ block: 'nearest' }));
  }
  toggle(id: string) {
    this.picked = this.picked.includes(id) ? this.picked.filter((x) => x !== id) : [...this.picked, id];
  }
  async choose(o: Opt) {
    const p = this.pop;
    if (!p) return;
    if (this.isMulti) return this.toggle(o.id);
    const c = p.cond;
    switch (p.kind) {
      case 'add': {
        p.block.conds.push(newCond(o.id as Field));
        this.closePop(false, false);
        await this.askValue(p.block, p.block.conds[p.block.conds.length - 1]);
        return;
      }
      case 'field':
        if (c && c.field !== o.id) {
          const nc = newCond(o.id as Field);
          Object.assign(c, { field: nc.field, op: nc.op, values: undefined, date: undefined, prio: undefined, text: undefined });
          this.closePop(false, false);
          await this.askValue(p.block, c);
          return;
        }
        break;
      case 'op':
        if (c) {
          const before = noValue(c);
          c.op = o.id;
          if (c.op === 'none') c.date = undefined;
          if (c.op === 'none' && c.field === 'priority') c.prio = undefined;
          if (before && !noValue(c) && incomplete(c)) {
            this.closePop(false, false);
            await this.askValue(p.block, c);
            return;
          }
        }
        break;
      case 'group':
        p.block.group = o.id as Block['group'];
        break;
      case 'sort':
        p.block.sort = o.id as Block['sort'];
        break;
      case 'prio':
        if (c) c.prio = o.id;
        break;
      case 'date':
        if (!c) break;
        if (o.id === 'none') {
          c.op = 'none';
          c.date = undefined;
        } else if (o.id === 'next' || o.id === 'range') {
          const t = this.today;
          this.form = o.id;
          this.formN = c.date?.kind === 'next' ? String(c.date.n) : '7';
          this.formFrom = c.date?.kind === 'range' ? c.date.from : isoDay(t);
          this.formTo = c.date?.kind === 'range' ? c.date.to : isoDay(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 6));
          await tick();
          this.popEl?.querySelector<HTMLInputElement>('.form input')?.focus();
          return;
        } else {
          if (c.op === 'none') c.op = 'eq';
          c.date = { kind: o.id } as DateVal;
        }
        break;
    }
    this.closePop(false);
  }
  submitForm() {
    const c = this.pop?.cond;
    if (!c) return;
    const d = this.form && dateOfForm(this.form, this.formN, this.formFrom, this.formTo);
    if (!d) return;
    c.date = d;
    if (c.op === 'none') c.op = 'eq';
    this.closePop(false);
  }
  /** Right after a field is picked: its value asked for at once. */
  async askValue(block: Block, c: Cond) {
    if (noValue(c)) return;
    await tick();
    const el = this.q(`[data-val="${c.id}"]`);
    if (!el) return;
    if (c.field === 'title' || c.field === 'touched') el.focus();
    else await this.openPop(valueKind(c.field), block, el, c);
  }
  popKey(e: KeyboardEvent) {
    const pop = this.pop;
    if (!pop) return;
    e.stopPropagation();
    if (this.form) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.form = null;
        this.focusPop();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.submitForm();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.hi = Math.max(0, Math.min(this.items.length - 1, this.hi + (e.key === 'ArrowDown' ? 1 : -1)));
      this.scrollHi();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.isMulti) {
        const o = this.items[this.hi];
        if (this.filter.trim() && o && !this.picked.includes(o.id)) this.toggle(o.id);
        this.closePop(true);
      } else if (this.items[this.hi]) void this.choose(this.items[this.hi]);
    } else if (e.key === ' ' && this.isMulti && (!this.filter || pop.kind === 'status' || pop.kind === 'tag')) {
      e.preventDefault();
      if (this.items[this.hi]) this.toggle(this.items[this.hi].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.closePop(false);
    } else if (e.key === 'Tab') e.preventDefault();
  }

  // ---- the blocks --------------------------------------------------------------------------------------------------
  async addBlock() {
    const b = newBlock();
    this.draft.blocks.push(b);
    this.open = b.id;
    await tick();
    const el = this.q(`[data-bname="${b.id}"]`) as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }
  removeBlock(b: Block) {
    if (this.draft.blocks.length < 2) return;
    const i = this.draft.blocks.findIndex((x) => x.id === b.id);
    this.draft.blocks.splice(i, 1);
    this.open = this.draft.blocks[Math.min(i, this.draft.blocks.length - 1)].id;
  }
  move(id: string, before: string | null) {
    const from = this.draft.blocks.findIndex((x) => x.id === id);
    if (from < 0 || id === before) return;
    const [b] = this.draft.blocks.splice(from, 1);
    const to = before ? this.draft.blocks.findIndex((x) => x.id === before) : this.draft.blocks.length;
    this.draft.blocks.splice(to < 0 ? this.draft.blocks.length : to, 0, b);
  }
  drag = new Reorder((id, target) => this.move(id, target === 'end' ? null : target), () => (this.open = ''));
  gripKey(e: KeyboardEvent, b: Block) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const i = this.draft.blocks.findIndex((x) => x.id === b.id);
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= this.draft.blocks.length) return;
    this.draft.blocks.splice(i, 1);
    this.draft.blocks.splice(j, 0, b);
    queueMicrotask(() => this.q(`[data-grip="${b.id}"]`)?.focus());
  }

  // ---- saving ------------------------------------------------------------------------------------------------------
  /** «Сохранить» (⌘S): the name and the values checked first — the wrong one gets the focus, nothing is written. */
  async save(name?: HTMLElement): Promise<boolean> {
    if (this.pop) this.closePop(true, false);
    if (this.problem) {
      name?.focus();
      return false;
    }
    const bad = this.draft.blocks.find((b) => b.conds.some(incomplete));
    if (bad) {
      this.showErrors = true;
      this.open = bad.id;
      await tick();
      this.q(`[data-val="${bad.conds.find(incomplete)!.id}"]`)?.focus();
      return false;
    }
    return store.saveAgenda(this.draft, { keep: true });
  }
}
