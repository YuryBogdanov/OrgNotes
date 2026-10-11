<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from './store.svelte';
  import { resolveWorkflow, toneFor, type Workflow } from './org';
  import { toneOf, toneStyle } from './colors';
  import { displayName } from './names';
  import ColorPicker from './ColorPicker.svelte';
  import {
    FIELDS, GROUPS, OPS, PRIORITIES, SORTS, fieldLabel, incomplete, inSources, nameProblem, newBlock, newCond, noValue, opLabel, query,
    runAgenda, shortDay, statusKey, statusName, summary, tasksCount, valueWords, type Block, type Cond, type DateVal, type Field,
  } from './agendas';

  // «Конструктор агенды»: the whole window — the agenda and its blocks on the left, a live preview on the right.
  // Nothing is written until «Сохранить агенду»; «Отмена» (Esc) leaves without a trace.
  const draft = store.builder!.draft;
  const isNew = !store.builder!.orig;
  let open = $state(draft.blocks[0]?.id ?? ''); // the one expanded block
  let showErrors = $state(false);
  let nameEl: HTMLInputElement | undefined = $state();

  const others = $derived(store.agendas.filter((a) => a.id !== draft.id).map((a) => a.name));
  const problem = $derived(nameProblem(draft.name, others));
  const today = $derived(new Date(store.today.getFullYear(), store.today.getMonth(), store.today.getDate()));
  const preview = $derived(runAgenda(draft, store.files, today, 50));
  const dotStyle = (b: Block) => toneStyle(toneOf(b.color) ?? toneOf('blue')!);

  onMount(() => {
    if (isNew) {
      nameEl?.focus();
      nameEl?.select(); // «Новая агенда», ready to be typed over
    }
  });

  // ---- what the pickers offer --------------------------------------------------------------------------------
  type StatusSet = { name: string; states: { name: string; tone: string }[] };
  const sets = $derived.by<StatusSet[]>(() => {
    const seen = new Map<string, StatusSet>();
    const add = (wf: Workflow) => {
      for (const s of wf.sequences ?? []) {
        if (!seen.has(s.name)) seen.set(s.name, { name: s.name, states: s.states.map((x) => ({ name: x.name, tone: toneStyle(toneFor(x.name, wf)) })) });
      }
    };
    for (const f of store.files) if (inSources(f.name, draft.sources)) add(f.wf);
    if (!seen.size) add(resolveWorkflow('', '', store.config));
    return [...seen.values()];
  });
  const allTags = $derived([...new Set(store.files.flatMap((f) => [...f.filetags, ...f.headings.flatMap((h) => h.tags)]))].sort((a, b) => a.localeCompare(b, 'ru')));
  /** The notes folder as a tree: folders first, then files, each level by name. */
  const tree = $derived.by(() => {
    const dirs = new Set(store.folders);
    const files = store.files.map((f) => f.name);
    const out: { rel: string; dir: boolean; depth: number }[] = [];
    const children = (parent: string) => {
      const inside = (p: string) => (parent ? p.startsWith(parent + '/') && !p.slice(parent.length + 1).includes('/') : !p.includes('/'));
      const ds = [...dirs].filter(inside).sort((a, b) => a.localeCompare(b, 'ru'));
      const fs = files.filter(inside).sort((a, b) => a.localeCompare(b, 'ru'));
      const depth = parent ? parent.split('/').length : 0;
      for (const d of ds) {
        out.push({ rel: d, dir: true, depth });
        children(d);
      }
      for (const f of fs) out.push({ rel: f, dir: false, depth });
    };
    children('');
    return out;
  });
  const exists = (rel: string) => store.folders.includes(rel) || store.files.some((f) => f.name === rel);

  // ---- popovers: one at a time, anchored under the control that opened it --------------------------------------
  type Kind = 'add' | 'field' | 'op' | 'status' | 'date' | 'tag' | 'prio' | 'path' | 'sources' | 'group' | 'sort';
  type Opt = { id: string; label: string; head?: boolean; count?: string; tone?: string; depth?: number; dir?: boolean; hint?: string };
  let pop = $state<{ kind: Kind; block: Block; cond?: Cond; anchor: HTMLElement } | null>(null);
  let popEl: HTMLDivElement | undefined = $state();
  let filter = $state('');
  let hi = $state(0);
  let picked = $state<string[]>([]); // a multiple choice in progress (statuses, tags, paths, sources)
  let form = $state<'next' | 'range' | null>(null); // «ближайшие N дней…», «в диапазоне…»
  let formN = $state('7');
  let formFrom = $state('');
  let formTo = $state('');

  const MULTI: Kind[] = ['status', 'tag', 'path', 'sources'];
  const norm = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е');
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const DATE_OPTS: { id: DateVal['kind'] | 'none'; label: string }[] = [
    { id: 'before', label: 'раньше сегодня' },
    { id: 'today', label: 'сегодня' },
    { id: 'tomorrow', label: 'завтра' },
    { id: 'next', label: 'ближайшие N дней…' },
    { id: 'range', label: 'в диапазоне…' },
    { id: 'none', label: 'не задано' },
  ];

  const opts = $derived.by<Opt[]>(() => {
    if (!pop) return [];
    const q = norm(filter.trim());
    const ok = (s: string) => !q || norm(s).includes(q);
    switch (pop.kind) {
      case 'add':
      case 'field':
        return FIELDS.map((f) => ({ id: f.id, label: f.label }));
      case 'op':
        return OPS[pop.cond!.field].map((o) => ({ id: o.id, label: o.label }));
      case 'group':
        return GROUPS.map((g) => ({ id: g.id, label: g.label }));
      case 'sort':
        return SORTS.map((s) => ({ id: s.id, label: s.label }));
      case 'prio':
        return PRIORITIES.map((p) => ({ id: p, label: p }));
      case 'date':
        return DATE_OPTS.map((d) => ({ id: d.id, label: d.label }));
      case 'status': {
        if (sets.length === 1) return sets[0].states.map((s) => ({ id: statusKey(sets[0].name, s.name), label: s.name, tone: s.tone }));
        const out: Opt[] = [];
        for (const set of sets) {
          const states = set.states.filter((s) => ok(s.name));
          if (!states.length) continue; // an empty group is hidden
          const n = set.states.filter((s) => picked.includes(statusKey(set.name, s.name))).length;
          out.push({ id: 'h:' + set.name, label: set.name.toLocaleUpperCase('ru'), head: true, count: `выбрано ${n} из ${set.states.length}` });
          for (const s of states) out.push({ id: statusKey(set.name, s.name), label: s.name, tone: s.tone });
        }
        return out;
      }
      case 'tag': {
        const out: Opt[] = [...new Set([...allTags, ...picked])].filter(ok).map((t) => ({ id: t, label: t }));
        const typed = filter.trim().replace(/\s+/g, '_');
        if (typed && !out.some((o) => o.id === typed) && !/[:\s]/.test(typed)) out.push({ id: typed, label: `Добавить тег «${typed}»` });
        return out;
      }
      case 'path':
      case 'sources':
        return q
          ? tree.filter((t) => ok(t.rel)).map((t) => ({ id: t.rel, label: displayName(t.rel), dir: t.dir, depth: 0, hint: t.rel.includes('/') ? t.rel.slice(0, t.rel.lastIndexOf('/')) : '' }))
          : tree.map((t) => ({ id: t.rel, label: displayName(t.rel), dir: t.dir, depth: t.depth }));
    }
  });
  const items = $derived(opts.filter((o) => !o.head));
  const searchable = $derived(!!pop && (pop.kind === 'tag' || pop.kind === 'path' || pop.kind === 'sources' || (pop.kind === 'status' && sets.length > 1)));
  const isMulti = $derived(!!pop && MULTI.includes(pop.kind));

  /** Is this option the current one (single choice) or picked (multiple)? */
  function checked(o: Opt): boolean {
    if (!pop) return false;
    if (isMulti) return picked.includes(o.id);
    const c = pop.cond;
    switch (pop.kind) {
      case 'field':
        return c?.field === o.id;
      case 'op':
        return c?.op === o.id;
      case 'group':
        return pop.block.group === o.id;
      case 'sort':
        return pop.block.sort === o.id;
      case 'prio':
        return c?.prio === o.id;
      case 'date':
        return c?.op === 'none' ? o.id === 'none' : c?.date?.kind === o.id;
    }
    return false;
  }

  async function openPop(kind: Kind, block: Block, anchor: HTMLElement, cond?: Cond) {
    if (pop?.anchor === anchor && pop.kind === kind) return closePop(true);
    if (pop) closePop(true, false);
    filter = '';
    form = null;
    picked = kind === 'sources' ? [...draft.sources] : MULTI.includes(kind) ? [...(cond?.values ?? [])] : [];
    pop = { kind, block, cond, anchor };
    await tick();
    const i = items.findIndex((o) => checked(o));
    hi = Math.max(0, i);
    focusPop();
    scrollHi();
  }
  function focusPop() {
    (popEl?.querySelector<HTMLElement>('input.search') ?? popEl)?.focus();
  }
  /** Close; a multiple choice is taken (`commit`) or dropped. The focus goes back to the control. */
  function closePop(commit: boolean, refocus = true) {
    const p = pop;
    if (!p) return;
    if (commit && isMulti) {
      if (p.kind === 'sources') draft.sources = [...picked];
      else if (p.cond) p.cond.values = [...picked];
    }
    pop = null;
    form = null;
    if (refocus && p.anchor.isConnected) p.anchor.focus();
  }
  function scrollHi() {
    queueMicrotask(() => popEl?.querySelector<HTMLElement>('.opt.hi')?.scrollIntoView({ block: 'nearest' }));
  }
  function toggle(id: string) {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
  }
  async function choose(o: Opt) {
    const p = pop;
    if (!p) return;
    if (isMulti) return toggle(o.id); // a click marks it and the list stays open
    const c = p.cond;
    switch (p.kind) {
      case 'add': {
        const nc = newCond(o.id as Field);
        p.block.conds.push(nc);
        closePop(false, false);
        await askValue(p.block, p.block.conds[p.block.conds.length - 1]);
        return;
      }
      case 'field': {
        if (c && c.field !== o.id) {
          const nc = newCond(o.id as Field);
          Object.assign(c, { field: nc.field, op: nc.op, values: undefined, date: undefined, prio: undefined, text: undefined });
          closePop(false, false);
          await askValue(p.block, c);
          return;
        }
        break;
      }
      case 'op':
        if (c) {
          const before = noValue(c);
          c.op = o.id;
          if (c.op === 'none') c.date = undefined;
          if (c.op === 'none' && c.field === 'priority') c.prio = undefined;
          if (before && !noValue(c) && incomplete(c)) {
            closePop(false, false);
            await askValue(p.block, c);
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
          form = o.id;
          formN = c.date?.kind === 'next' ? String(c.date.n) : '7';
          formFrom = c.date?.kind === 'range' ? c.date.from : iso(today);
          formTo = c.date?.kind === 'range' ? c.date.to : iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6));
          await tick();
          popEl?.querySelector<HTMLInputElement>('.form input')?.focus();
          return;
        } else {
          if (c.op === 'none') c.op = 'eq';
          c.date = { kind: o.id } as DateVal;
        }
        break;
    }
    closePop(false);
  }
  function submitForm() {
    const c = pop?.cond;
    if (!c) return;
    if (form === 'next') {
      const n = parseInt(formN, 10);
      if (!(n >= 1)) return;
      c.date = { kind: 'next', n: Math.min(n, 3650) };
    } else if (form === 'range') {
      if (!formFrom || !formTo) return;
      const [from, to] = formFrom <= formTo ? [formFrom, formTo] : [formTo, formFrom];
      c.date = { kind: 'range', from, to };
    }
    if (c.op === 'none') c.op = 'eq';
    closePop(false);
  }
  /** Right after a field is picked: the row is there, and its value is asked for at once. */
  async function askValue(block: Block, c: Cond) {
    if (noValue(c)) return;
    await tick();
    const el = document.querySelector<HTMLElement>(`[data-val="${c.id}"]`);
    if (!el) return;
    if (c.field === 'title') el.focus();
    else await openPop(valueKind(c.field), block, el, c);
  }
  const valueKind = (f: Field): Kind => (f === 'scheduled' || f === 'deadline' ? 'date' : f === 'priority' ? 'prio' : (f as Kind));

  function popKey(e: KeyboardEvent) {
    if (!pop) return;
    if (form) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        form = null;
        focusPop();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submitForm();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hi = Math.max(0, Math.min(items.length - 1, hi + (e.key === 'ArrowDown' ? 1 : -1)));
      scrollHi();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isMulti) {
        // ↩ confirms; with something typed in the search, the highlighted one is taken on the way
        const o = items[hi];
        if (filter.trim() && o && !picked.includes(o.id)) toggle(o.id);
        closePop(true);
      } else if (items[hi]) void choose(items[hi]);
    } else if (e.key === ' ' && isMulti && (!filter || pop.kind === 'status' || pop.kind === 'tag')) {
      // (a file name may have spaces: once something is typed in their search, Space types)
      e.preventDefault();
      if (items[hi]) toggle(items[hi].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePop(false); // Esc drops the changes of this choice
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }
  $effect(() => {
    void filter;
    hi = 0;
  });
  function outside(e: MouseEvent) {
    if (!pop) return;
    const t = e.target as Node;
    if (popEl?.contains(t) || pop.anchor.contains(t)) return;
    closePop(true, false); // a click elsewhere takes the choice
  }

  // ---- blocks ---------------------------------------------------------------------------------------------------
  async function addBlock() {
    const b = newBlock();
    draft.blocks.push(b);
    open = b.id;
    await tick();
    const el = document.querySelector<HTMLInputElement>(`[data-bname="${b.id}"]`);
    el?.focus();
    el?.select();
  }
  function removeBlock(b: Block) {
    if (draft.blocks.length < 2) return;
    const i = draft.blocks.findIndex((x) => x.id === b.id);
    draft.blocks.splice(i, 1);
    open = draft.blocks[Math.min(i, draft.blocks.length - 1)].id;
  }
  function move(id: string, before: string | null) {
    const from = draft.blocks.findIndex((x) => x.id === id);
    if (from < 0 || id === before) return;
    const [b] = draft.blocks.splice(from, 1);
    const to = before ? draft.blocks.findIndex((x) => x.id === before) : draft.blocks.length;
    draft.blocks.splice(to < 0 ? draft.blocks.length : to, 0, b);
  }
  let dragId = $state<string | null>(null);
  let overId = $state<string | null>(null);
  function gripKey(e: KeyboardEvent, b: Block) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const i = draft.blocks.findIndex((x) => x.id === b.id);
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= draft.blocks.length) return;
    draft.blocks.splice(i, 1);
    draft.blocks.splice(j, 0, b);
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-grip="${b.id}"]`)?.focus());
  }
  let picker = $state<{ block: Block; anchor: HTMLElement } | null>(null);

  // ---- sources ----------------------------------------------------------------------------------------------------
  function chipKey(e: KeyboardEvent, rel: string) {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const i = draft.sources.indexOf(rel);
      draft.sources = draft.sources.filter((s) => s !== rel);
      queueMicrotask(() => {
        const chips = document.querySelectorAll<HTMLElement>('.src .chipx');
        (chips[Math.min(i, chips.length - 1)] ?? document.querySelector<HTMLElement>('.src .plus'))?.focus();
      });
    }
  }

  // ---- saving and leaving ------------------------------------------------------------------------------------------
  let confirmCancel = $state(false);
  let stayBtn: HTMLButtonElement | undefined = $state();
  async function save() {
    if (pop) closePop(true, false);
    if (problem) {
      nameEl?.focus();
      return;
    }
    const bad = draft.blocks.find((b) => b.conds.some(incomplete));
    if (bad) {
      // the block opens and its empty value is marked; nothing is saved
      showErrors = true;
      open = bad.id;
      await tick();
      document.querySelector<HTMLElement>(`[data-val="${bad.conds.find(incomplete)!.id}"]`)?.focus();
      return;
    }
    await store.saveAgenda(draft);
  }
  async function cancel() {
    if (pop) return closePop(false);
    if (!store.builderDirty) return store.closeBuilder();
    confirmCancel = true;
    await tick();
    stayBtn?.focus();
  }
  // ⌘S from the menu bar (or the shortcut without one)
  let saves = store.builderSave;
  $effect(() => {
    if (store.builderSave !== saves) {
      saves = store.builderSave;
      void save();
    }
  });
  function key(e: KeyboardEvent) {
    if (confirmCancel) {
      if (e.key === 'Escape') {
        e.preventDefault();
        confirmCancel = false;
      }
      return;
    }
    if (picker) return;
    if (e.key === 'Escape' && !pop) {
      e.preventDefault();
      void cancel();
    }
  }

  async function drag(e: MouseEvent) {
    if (e.button !== 0 || !('__TAURI_INTERNALS__' in window)) return;
    if ((e.target as HTMLElement).closest('button, input')) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    if (e.detail === 2) getCurrentWindow().toggleMaximize();
    else getCurrentWindow().startDragging();
  }
  const chev = 'M2 4.5l4 4 4-4';
</script>

<svelte:window onkeydown={key} onmousedown={outside} />

{#snippet chevron()}
  <svg class="chev" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={chev} /></svg>
{/snippet}
{#snippet grip(b: Block)}
  <span class="grip" role="button" tabindex="0" draggable="true" data-grip={b.id} aria-label="Перетащить блок «{b.name}». Option со стрелками вверх и вниз меняет порядок"
    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" onkeydown={(e) => gripKey(e, b)}
    ondragstart={(e) => { dragId = b.id; open = ''; e.dataTransfer?.setData('text/plain', b.id); }} ondragend={() => (dragId = overId = null)}
    onclick={(e) => e.stopPropagation()}>
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 5h.01M13 5h.01M7 10h.01M13 10h.01M7 15h.01M13 15h.01" /></svg>
  </span>
{/snippet}

<div class="builder" role="dialog" aria-modal="true" aria-label="Конструктор агенды">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="toolbar" data-tauri-drag-region onmousedown={drag}>
    <div class="lights-gap"></div>
    <div class="path" aria-label="Путь">
      <span>Агенда</span><span class="sep" aria-hidden="true">›</span><span class="cur">{draft.name.trim() || 'Новая агенда'}</span><span class="sep" aria-hidden="true">›</span><span>Редактирование</span>
    </div>
    <div class="acts">
      <button class="btn" onclick={cancel}>Отмена</button>
      <button class="btn primary" disabled={!!problem} title={problem ?? 'Сохранить агенду (⌘S)'} aria-keyshortcuts="Meta+S" onclick={save}>Сохранить агенду</button>
    </div>
  </div>

  <div class="cols">
    <div class="ed">
      <div class="grp">
        <div class="cap">АГЕНДА</div>
        <div class="row2">
          <label class="fld">
            <span>Название</span>
            <input class="name" class:bad={!!problem} bind:this={nameEl} bind:value={draft.name} aria-invalid={!!problem} spellcheck="false" autocomplete="off" />
            {#if problem}<span class="err" role="alert">{problem}</span>{/if}
          </label>
          <div class="fld">
            <span id="src-l">Источники</span>
            <div class="src" role="group" aria-labelledby="src-l">
              {#each draft.sources as s (s)}
                <span class="chipx" class:gone={!exists(s)} tabindex="0" role="button" aria-label="{displayName(s)}{exists(s) ? '' : ' (не найден)'}. Backspace — убрать"
                  title={exists(s) ? s : `«${s}» не найден: переименован или удалён. Агенда работает по остальным источникам`} onkeydown={(e) => chipKey(e, s)}>
                  {#if !exists(s)}<svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L2.5 16h15zM10 8v4M10 14.2v.01" /></svg>{/if}
                  {displayName(s)}
                  <button class="cx" tabindex="-1" aria-label="Убрать {displayName(s)}" onclick={() => (draft.sources = draft.sources.filter((x) => x !== s))}>×</button>
                </span>
              {:else}
                <span class="all">все файлы</span>
              {/each}
              <button class="plus" aria-label="Добавить источник" aria-haspopup="listbox" onclick={(e) => openPop('sources', draft.blocks[0], e.currentTarget)}>+</button>
            </div>
          </div>
        </div>
      </div>

      <div class="grp">
        <div class="cap">БЛОКИ — перетаскивайте, чтобы поменять порядок</div>
        {#each draft.blocks as b (b.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="bwrap" class:over={overId === b.id && dragId !== b.id}
            ondragover={(e) => { if (dragId) { e.preventDefault(); overId = b.id; } }}
            ondrop={(e) => { e.preventDefault(); if (dragId) move(dragId, b.id); dragId = overId = null; }}>
            {#if open !== b.id}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="block" data-block={b.id} role="button" tabindex="0" aria-expanded="false" aria-label="Блок «{b.name}»: {summary(b)}"
                onclick={() => (open = b.id)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open = b.id; } }}>
                {@render grip(b)}
                <span class="dot tone-bg" style={dotStyle(b)}></span>
                <div class="bt">
                  <span class="bn">{b.name || 'Без названия'}</span>
                  <span class="sum" class:red={showErrors && b.conds.some(incomplete)}>{summary(b)}</span>
                </div>
                <svg class="chev side" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg>
              </div>
            {:else}
              <div class="block open" data-block={b.id}>
                <div class="bh">
                  {@render grip(b)}
                  <button class="dotbtn" aria-label="Цвет блока" aria-haspopup="dialog" onclick={(e) => (picker = picker ? null : { block: b, anchor: e.currentTarget })}>
                    <span class="dot tone-bg" style={dotStyle(b)}></span>
                  </button>
                  <input class="bname" data-bname={b.id} aria-label="Название блока" bind:value={b.name} spellcheck="false" autocomplete="off" />
                  <button class="ib" aria-label="Удалить блок" disabled={draft.blocks.length < 2} title={draft.blocks.length < 2 ? 'Последний блок удалить нельзя' : 'Удалить блок'} onclick={() => removeBlock(b)}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" /></svg>
                  </button>
                  <button class="ib" aria-label="Свернуть блок" aria-expanded="true" onclick={() => (open = '')}>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform:rotate(90deg)"><path d="M4 2l4 4-4 4" /></svg>
                  </button>
                </div>
                <div class="bb">
                  <div class="phrase"><span>Показывать задачи, у которых</span><span class="all-c" title="В этой версии условия соединяются по «И»">выполняются все условия</span></div>
                  {#each b.conds as c (c.id)}
                    {@const words = valueWords(c)}
                    <div class="cond" role="group" aria-label="Условие: {fieldLabel(c.field)}">
                      <button class="slot f" aria-haspopup="listbox" aria-label="Поле: {fieldLabel(c.field)}" onclick={(e) => openPop('field', b, e.currentTarget, c)}><span>{fieldLabel(c.field)}</span>{@render chevron()}</button>
                      <button class="slot o" aria-haspopup="listbox" aria-label="Оператор: {opLabel(c.field, c.op)}" onclick={(e) => openPop('op', b, e.currentTarget, c)}><span>{opLabel(c.field, c.op)}</span>{@render chevron()}</button>
                      {#if c.field === 'title'}
                        <input class="val text" class:bad={showErrors && incomplete(c)} data-val={c.id} aria-label="Текст в заголовке" placeholder="текст" bind:value={c.text} spellcheck="false" autocomplete="off" />
                      {:else if noValue(c)}
                        <span class="val none"></span>
                      {:else}
                        <button class="val" class:bad={showErrors && incomplete(c)} data-val={c.id} aria-haspopup="listbox"
                          aria-label="Значение: {words.join(', ') || 'не выбрано'}" title={words.length > 2 ? words.join(', ') : ''}
                          onclick={(e) => openPop(valueKind(c.field), b, e.currentTarget, c)}>
                          {#if !words.length}
                            <span class="ph">{showErrors ? 'выберите значение' : 'выбрать…'}</span>
                          {:else}
                            {#each words.length > 2 ? words.slice(0, 1) : words as w}<span class="vchip">{w}</span>{/each}
                            {#if words.length > 2}<span class="vchip more" title={words.join(', ')}>+{words.length - 1}</span>{/if}
                          {/if}
                        </button>
                      {/if}
                      <button class="x" aria-label="Убрать условие" title="Убрать условие" onclick={() => b.conds.splice(b.conds.indexOf(c), 1)}>×</button>
                    </div>
                  {/each}
                  <button class="addc" aria-haspopup="menu" onclick={(e) => openPop('add', b, e.currentTarget)}>+ Условие</button>
                  <div class="hr"></div>
                  <div class="opts">
                    <div class="of">
                      <span id="g-{b.id}">Группировать</span>
                      <button class="slot wide" aria-labelledby="g-{b.id}" aria-haspopup="listbox" onclick={(e) => openPop('group', b, e.currentTarget)}><span>{GROUPS.find((g) => g.id === b.group)?.label}</span>{@render chevron()}</button>
                    </div>
                    <div class="of">
                      <span id="s-{b.id}">Сортировать</span>
                      <button class="slot wide" aria-labelledby="s-{b.id}" aria-haspopup="listbox" onclick={(e) => openPop('sort', b, e.currentTarget)}><span>{SORTS.find((s) => s.id === b.sort)?.label}</span>{@render chevron()}</button>
                    </div>
                    <label class="of lim">
                      <span>Лимит</span>
                      <input class="limit" inputmode="numeric" placeholder="без лимита" value={b.limit ?? ''} autocomplete="off"
                        oninput={(e) => { const v = e.currentTarget.value.replace(/\D/g, '').replace(/^0+/, ''); e.currentTarget.value = v; b.limit = v ? Math.min(+v, 9999) : null; }} />
                    </label>
                  </div>
                  <div class="q">
                    <span class="cap">ЗАПРОС</span>
                    <div class="qtext" aria-label="Запрос">{query(b)}</div>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/each}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="bend" class:over={overId === 'end'} ondragover={(e) => { if (dragId) { e.preventDefault(); overId = 'end'; } }}
          ondrop={(e) => { e.preventDefault(); if (dragId) move(dragId, null); dragId = overId = null; }}></div>
        <button class="addb" onclick={addBlock}>+ Добавить блок</button>
      </div>
    </div>

    <div class="pv" aria-label="Предпросмотр">
      <div class="pvh"><span class="cap">ПРЕДПРОСМОТР</span><span class="upd">обновляется при каждом изменении</span></div>
      {#each preview as r (r.block.id)}
        <div class="ph2" data-preview={r.block.name}>
          <span class="dot tone-bg" style={dotStyle(r.block)}></span>
          <span class="pt">{r.block.name || 'Без названия'}</span>
          <span class="pc">{tasksCount(r.total)}</span>
        </div>
        {#if !r.total}<div class="pnone">нет задач</div>{/if}
        {#each r.groups as g (g.key)}
          {#if g.title}<div class="pg">{g.title}</div>{/if}
          {#each g.tasks as t (t.file + ':' + t.line)}
            {@const f = store.files[t.file]}
            {@const d = t.scheduled ?? t.deadline}
            <div class="prow">
              <span class="kw tone-chip" style={toneStyle(toneFor(t.kw, f.wf))}>{t.kw}</span>
              <div class="pm"><span class="ptt">{t.title}</span><span class="ps">{t.src}</span></div>
              <span class="pd">{d ? shortDay(d) : ''}</span>
            </div>
          {/each}
        {/each}
        {#if r.more}<div class="pnone">и ещё {r.more}</div>{/if}
      {/each}
    </div>
  </div>

  {#if pop}
    {@const r = pop.anchor.getBoundingClientRect()}
    {@const w = pop.kind === 'status' && sets.length > 1 ? 280 : pop.kind === 'path' || pop.kind === 'sources' ? 300 : pop.kind === 'group' || pop.kind === 'sort' ? Math.max(200, r.width) : pop.kind === 'date' ? 230 : 200}
    {@const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}
    {@const below = window.innerHeight - r.bottom > 260 || r.top < window.innerHeight / 2}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="pop" bind:this={popEl} role={pop.kind === 'add' ? 'menu' : 'listbox'} tabindex="-1" aria-multiselectable={isMulti || undefined}
      aria-label={pop.kind === 'add' ? 'Поле условия' : pop.kind === 'sources' ? 'Источники' : 'Значение'} onkeydown={popKey}
      style="left:{left}px;min-width:{w}px;{below ? `top:${r.bottom + 4}px;max-height:${window.innerHeight - r.bottom - 16}px` : `bottom:${window.innerHeight - r.top + 4}px;max-height:${r.top - 16}px`}">
      {#if pop.kind === 'add'}<div class="ph">ПОЛЕ УСЛОВИЯ</div>{/if}
      {#if pop.kind === 'status' && sets.length === 1}<div class="ph">СТАТУС — ОДИН ИЛИ НЕСКОЛЬКО</div>{/if}
      {#if pop.kind === 'date'}<div class="ph">{fieldLabel(pop.cond!.field).toLocaleUpperCase('ru')}</div>{/if}
      {#if pop.kind === 'tag'}<div class="ph">ТЕГ — ОДИН ИЛИ НЕСКОЛЬКО</div>{/if}
      {#if searchable}
        <div class="sbox">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
          <input class="search" bind:value={filter} spellcheck="false" autocomplete="off"
            placeholder={pop.kind === 'status' ? 'Найти статус' : pop.kind === 'tag' ? 'Найти или добавить тег' : 'Найти файл или папку'}
            aria-label={pop.kind === 'status' ? 'Найти статус' : pop.kind === 'tag' ? 'Найти тег' : 'Найти файл или папку'} />
        </div>
      {/if}
      {#if form === 'next'}
        <div class="form">
          <label>Ближайшие <input type="number" min="1" max="3650" bind:value={formN} aria-label="Число дней" /> дней, считая сегодня</label>
          <div class="fb"><button class="btn" onclick={() => (form = null)}>Назад</button><button class="btn primary" onclick={submitForm}>Готово</button></div>
        </div>
      {:else if form === 'range'}
        <div class="form">
          <label>С <input type="date" bind:value={formFrom} aria-label="С даты" /></label>
          <label>по <input type="date" bind:value={formTo} aria-label="По дату" /></label>
          <div class="fb"><button class="btn" onclick={() => (form = null)}>Назад</button><button class="btn primary" onclick={submitForm}>Готово</button></div>
        </div>
      {:else}
        <div class="opts-l">
          {#each opts as o (o.id)}
            {#if o.head}
              <div class="gh"><span>{o.label}</span><span class="cnt">{o.count}</span></div>
            {:else}
              {@const i = items.indexOf(o)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="opt" class:hi={i === hi} role={pop.kind === 'add' ? 'menuitem' : 'option'} aria-selected={checked(o)} data-opt={o.id}
                style="padding-left:{8 + (o.depth ?? 0) * 14}px" onmousemove={() => (hi = i)} onclick={() => choose(o)}>
                <span class="ck">{checked(o) ? '✓' : ''}</span>
                {#if o.tone}<span class="sdot tone-bg" style={o.tone}></span>{/if}
                {#if pop.kind === 'path' || pop.kind === 'sources'}
                  <svg class="fi" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    {#if o.dir}<path d="M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" />{:else}<path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" />{/if}
                  </svg>
                {/if}
                <span class="ol">{o.label}</span>
                {#if o.hint}<span class="oh">{o.hint}</span>{/if}
              </div>
            {/if}
          {:else}
            <div class="empty">{pop.kind === 'tag' ? 'Тегов пока нет — введите новый' : 'Ничего не найдено'}</div>
          {/each}
        </div>
        {#if pop.kind === 'status'}
          <div class="pf">{sets.length > 1 ? 'Условие сработает для заголовка любого набора, у которого есть выбранный статус. ' : ''}Space отмечает, ↩ подтверждает.</div>
        {:else if isMulti}
          <div class="pf">Space отмечает, ↩ подтверждает{filter.trim() ? ' и добавляет выделенный' : ''}, Esc отменяет.</div>
        {:else if pop.kind === 'date'}
          <div class="pf">Даты в условиях «сегодня» считаются от дня открытия агенды.</div>
        {/if}
      {/if}
    </div>
  {/if}

  {#if picker}
    {@const pk = picker}
    <ColorPicker title="Цвет блока" value={pk.block.color} keyword={pk.block.name} fallback={toneOf('blue')!} anchor={pk.anchor}
      onpick={(c) => (pk.block.color = c || 'blue')} onclose={() => (picker = null)} />
  {/if}

  {#if confirmCancel}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="dim" onmousedown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <div class="sheet" role="alertdialog" aria-modal="true" aria-label="Отменить изменения агенды?">
        <h2>Отменить изменения агенды?</h2>
        <p>{isNew ? 'Новая агенда не будет создана.' : `Изменения в агенде «${store.builder?.orig?.name}» не сохранятся.`}</p>
        <div class="sb">
          <button class="btn" onclick={() => store.closeBuilder()}>Отменить</button>
          <button class="btn primary" bind:this={stayBtn} onclick={() => (confirmCancel = false)}>Остаться</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .builder { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; background: var(--bg); color: var(--fg); }
  .toolbar { flex: 0 0 52px; display: flex; align-items: center; gap: 12px; padding: 0 14px; background: var(--bar); border-bottom: 1px solid var(--line); }
  .lights-gap { flex: 0 0 68px; }
  :global(html:not(.tauri)) .builder .lights-gap { flex-basis: 4px; }
  .path { flex: 1 1 360px; max-width: 560px; min-width: 0; height: 28px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--field); border-radius: 7px; color: var(--fg2); font-size: 12.5px; white-space: nowrap; overflow: hidden; }
  .path .cur { color: var(--fg); overflow: hidden; text-overflow: ellipsis; }
  .path .sep { color: var(--fg3); }
  .acts { margin-left: auto; display: flex; gap: 10px; }
  .btn { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--field); color: var(--fg); font-size: 12.5px; white-space: nowrap; }
  .btn.primary { background: var(--acc); color: var(--onacc); font-weight: 600; padding: 0 16px; }
  .btn:disabled { opacity: 0.45; }
  .btn:focus-visible, .slot:focus-visible, .val:focus-visible, .addc:focus-visible, .addb:focus-visible, .ib:focus-visible, .x:focus-visible, .dotbtn:focus-visible, .plus:focus-visible, .chipx:focus-visible, .grip:focus-visible, .block:focus-visible {
    outline: 2px solid var(--acc); outline-offset: 1px;
  }

  .cols { flex: 1; min-height: 0; display: flex; flex-wrap: wrap; overflow: auto; }
  .ed { flex: 1 1 560px; min-width: 0; background: var(--side); border-right: 1px solid var(--line); overflow: auto; padding: 22px 24px; display: flex; flex-direction: column; gap: 18px; }
  .pv { flex: 1 1 440px; min-width: 0; overflow: auto; padding: 22px 24px; display: flex; flex-direction: column; gap: 6px; }
  @media (max-width: 1040px) { .ed, .pv { flex-basis: 100%; } .cols { overflow: auto; } .ed { border-right: 0; border-bottom: 1px solid var(--line); } }
  .grp { display: flex; flex-direction: column; gap: 10px; }
  .cap { font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .row2 { display: flex; gap: 10px; flex-wrap: wrap; }
  .fld { flex: 1 1 220px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .fld > span:first-child { font-size: 12px; color: var(--fg2); }
  .name { height: 30px; padding: 0 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; font-size: 14px; font-weight: 600; -webkit-user-select: text; user-select: text; }
  .name:focus, .bname:focus, .val.text:focus, .limit:focus, .search:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 25%, transparent); }
  .name.bad { border-color: var(--todo); }
  .err { font-size: 12px; color: var(--todo); }
  .src { min-height: 30px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 3px 6px 3px 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; }
  .all { color: var(--fg2); font-size: 12.5px; }
  .chipx { position: relative; display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 9px; background: var(--tagbg); color: var(--tagfg); font-size: 12px; }
  .chipx.gone { color: var(--fg3); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--fg3) 60%, transparent); }
  .chipx.gone svg { color: var(--wait); }
  .cx { display: none; width: 14px; height: 14px; padding: 0; border: 0; border-radius: 7px; background: color-mix(in srgb, var(--fg) 18%, transparent); color: var(--bg); font-size: 11px; line-height: 14px; margin-right: -4px; }
  .chipx:hover .cx { display: inline-block; }
  .plus { margin-left: auto; width: 24px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--fg3); font-size: 16px; }
  .plus:hover { background: var(--field); color: var(--fg); }

  .bwrap { border-radius: 9px; }
  .bwrap.over { box-shadow: 0 -3px 0 var(--acc); }
  .bend { height: 4px; margin-top: -6px; border-radius: 2px; }
  .bend.over { background: var(--acc); }
  .block { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 6px 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 9px; }
  .block:not(.open):hover { border-color: color-mix(in srgb, var(--acc) 45%, var(--line)); }
  .block.open { display: block; padding: 0; border: 1.5px solid var(--acc); }
  .grip { flex: 0 0 14px; display: flex; color: var(--fg3); cursor: grab; border-radius: 4px; }
  .dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 4px; }
  .bt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .bn { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sum { font-size: 11.5px; color: var(--fg2); font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sum.red { color: var(--todo); }
  .chev { flex: 0 0 auto; color: var(--fg3); }
  .bh { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 6px 8px 6px 12px; border-bottom: 1px solid var(--line); }
  .dotbtn { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; display: flex; align-items: center; justify-content: center; }
  .dotbtn:hover { background: var(--field); }
  .bname { flex: 1; min-width: 0; height: 26px; padding: 0 6px; margin-left: -6px; border: 1px solid transparent; border-radius: 5px; background: transparent; font-weight: 600; font-size: 13px; -webkit-user-select: text; user-select: text; }
  .bname:hover { border-color: var(--line); }
  .ib { width: 26px; height: 26px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; }
  .ib:hover:not(:disabled) { background: var(--field); }
  .ib:disabled { opacity: 0.35; }
  .bb { padding: 14px 12px; display: flex; flex-direction: column; gap: 10px; }
  .phrase { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--fg2); }
  .all-c { height: 22px; display: flex; align-items: center; padding: 0 9px; background: var(--field); border-radius: 5px; color: var(--fg); }
  .cond { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  /* the field and the operator: fixed widths; a long word wraps, it is never cut silently or run under the chevron */
  .slot { min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 4px 10px; border: 0; background: var(--field); border-radius: 6px; font-size: 12.5px; text-align: left; line-height: 1.25; color: var(--fg); }
  .slot.f { flex: 0 0 140px; width: 140px; }
  .slot.o { flex: 0 0 116px; width: 116px; }
  .slot.wide { width: 100%; }
  .slot > span { min-width: 0; overflow-wrap: anywhere; }
  .val { flex: 1 1 140px; min-width: 0; min-height: 28px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 3px 8px; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; font-size: 12.5px; text-align: left; color: var(--fg); }
  .val.text { height: 28px; -webkit-user-select: text; user-select: text; }
  .val.none { border-color: transparent; background: transparent; }
  .val.bad { border-color: var(--todo); box-shadow: 0 0 0 3px color-mix(in srgb, var(--todo) 18%, transparent); }
  .ph { color: var(--fg3); }
  .vchip { padding: 1px 8px; border-radius: 9px; background: color-mix(in srgb, var(--acc) 13%, transparent); color: var(--acc); font-weight: 600; white-space: nowrap; }
  .x { flex: 0 0 24px; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--fg3); font-size: 16px; line-height: 1; }
  .x:hover { background: var(--field); color: var(--todo); }
  .addc { align-self: flex-start; height: 26px; padding: 0 12px; border: 1px dashed var(--line); background: transparent; color: var(--acc); border-radius: 6px; font-size: 12.5px; }
  .hr { height: 1px; background: var(--line); margin: 4px 0; }
  .opts { display: flex; gap: 14px; flex-wrap: wrap; }
  .of { display: flex; flex-direction: column; gap: 4px; flex: 1 1 130px; min-width: 0; }
  .of > span:first-child { font-size: 12px; color: var(--fg2); }
  .of.lim { flex: 0 1 110px; }
  .limit { height: 28px; padding: 0 10px; border: 1px solid transparent; background: var(--field); border-radius: 6px; font-size: 12.5px; width: 100%; -webkit-user-select: text; user-select: text; }
  .limit::placeholder { color: var(--fg2); }
  .q { display: flex; flex-direction: column; gap: 4px; }
  .qtext { padding: 8px 10px; background: var(--side); border-radius: 6px; font-size: 12px; font-family: var(--mono); color: var(--fg2); line-height: 1.5; overflow-wrap: anywhere; -webkit-user-select: text; user-select: text; cursor: text; }
  .addb { height: 36px; border: 1px dashed var(--line); background: transparent; color: var(--acc); border-radius: 9px; font-size: 13px; font-weight: 500; }

  .pvh { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .upd { font-size: 12px; color: var(--fg3); }
  .ph2 { display: flex; align-items: center; gap: 8px; padding: 14px 0 6px; }
  .pt { font-weight: 700; }
  .pc { font-size: 12px; color: var(--fg2); }
  .pg { padding: 4px 0 2px 16px; font-size: 12px; font-weight: 600; color: var(--fg2); }
  .pnone { padding: 2px 0 4px 16px; font-size: 12.5px; color: var(--fg2); }
  .prow { display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 4px 10px; margin-bottom: 4px; border-radius: 7px; background: var(--side); }
  .kw { flex: 0 0 52px; text-align: center; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pm { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ptt { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ps { font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pd { flex: 0 0 auto; font-size: 11.5px; color: var(--fg2); }

  .pop { position: fixed; z-index: 100; max-width: min(360px, calc(100vw - 16px)); box-sizing: border-box; padding: 5px; background: var(--bg); border: 1px solid var(--line); border-radius: 9px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25); display: flex; flex-direction: column; gap: 1px; font-size: 13px; overflow: hidden; }
  .pop:focus { outline: none; }
  .pop .ph { padding: 4px 8px 6px; font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .opts-l { overflow: auto; min-height: 0; display: flex; flex-direction: column; gap: 1px; }
  .sbox { flex: 0 0 28px; display: flex; align-items: center; gap: 7px; padding: 0 8px; margin-bottom: 2px; border-radius: 6px; background: var(--field); color: var(--fg2); }
  .search { flex: 1; min-width: 0; height: 26px; border: 0; background: transparent; font-size: 13px; color: var(--fg); -webkit-user-select: text; user-select: text; }
  .search:focus { box-shadow: none; }
  .gh { display: flex; align-items: center; padding: 8px 8px 3px; font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .gh span:first-child { flex: 1; }
  .cnt { font-weight: 400; color: var(--acc); letter-spacing: 0; }
  .opt { flex: 0 0 26px; display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 8px; border-radius: 6px; white-space: nowrap; }
  .opt.hi { background: var(--acc); color: var(--onacc); }
  .opt.hi .fi, .opt.hi .oh { color: inherit; }
  .ck { flex: 0 0 14px; font-size: 11px; text-align: center; }
  .sdot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 4px; }
  .opt.hi .sdot { box-shadow: 0 0 0 1.5px var(--onacc); } /* a blue status stays visible on the blue highlight */
  .fi { flex: 0 0 auto; color: var(--fg2); }
  .ol { overflow: hidden; text-overflow: ellipsis; }
  .oh { margin-left: auto; padding-left: 10px; font-size: 11.5px; color: var(--fg3); overflow: hidden; text-overflow: ellipsis; }
  .empty { padding: 6px 8px; color: var(--fg2); }
  .pf { margin: 5px 3px 2px; padding-top: 6px; border-top: 1px solid var(--line); font-size: 11px; color: var(--fg3); line-height: 1.5; white-space: normal; max-width: 320px; }
  .form { display: flex; flex-direction: column; gap: 10px; padding: 8px; }
  .form label { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
  .form input { height: 26px; padding: 0 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); font-size: 12.5px; -webkit-user-select: text; user-select: text; }
  .form input[type='number'] { width: 64px; }
  .fb { display: flex; justify-content: flex-end; gap: 8px; }

  .dim { position: fixed; left: 0; right: 0; top: 52px; bottom: 0; z-index: 110; background: rgba(0, 0, 0, 0.2); display: flex; justify-content: center; align-items: flex-start; }
  .sheet { width: 420px; max-width: calc(100% - 32px); padding: 18px; border-radius: 0 0 12px 12px; background: var(--bg); border: 1px solid var(--line); border-top: 0; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35); }
  .sheet h2 { margin: 0 0 6px; font-size: 13px; font-weight: 700; }
  .sheet p { margin: 0 0 14px; font-size: 12px; color: var(--fg2); line-height: 1.45; }
  .sb { display: flex; justify-content: flex-end; gap: 8px; }
</style>
