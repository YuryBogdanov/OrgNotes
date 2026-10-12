<script lang="ts">
  import { tick } from 'svelte';
  import Calendar from './Calendar.svelte';
  import PlacePicker from './PlacePicker.svelte';
  import CalReview from './CalReview.svelte';
  import { store } from './store.svelte';
  import { busyDays, longDate, shiftDate } from './calendar';
  import { listEnter, listIndent } from './textList';
  import type { Field, FieldCtrl, PlaceValue, Values } from './settingsSchema';

  // The wide fields of a plugin's form (ТЗ 27 §2.4): lines with lists, a day, a file and its heading, a field the
  // plugin draws. Under their label, across the sheet.
  let { f, id, values, set }: { f: Field; id: string; values: Values; set: (key: string, v: unknown) => void } = $props();

  // ---- lines ------------------------------------------------------------------------------------------------------
  const grow = (ta: HTMLTextAreaElement) => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 2 + 'px';
  };
  function listKey(e: KeyboardEvent) {
    const ta = e.currentTarget as HTMLTextAreaElement;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const r = e.key === 'Enter' && !e.shiftKey && !e.isComposing ? listEnter(ta.value, ta.selectionStart) : e.key === 'Tab' ? (listIndent(ta.value, ta.selectionStart, e.shiftKey ? -1 : 1) ?? { value: ta.value, caret: ta.selectionStart }) : null;
    if (!r) return;
    e.preventDefault();
    e.stopPropagation(); // not the sheet's ↩
    set(f.key, r.value);
    void tick().then(() => {
      ta.selectionStart = ta.selectionEnd = r.caret;
      grow(ta);
    });
  }

  // ---- a day: «yyyy-mm-dd» ------------------------------------------------------------------------------------------
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : null);
  const chosen = $derived(day(values[f.key]));
  let open = $state(false); // the chip's calendar
  let view = $state(new Date());
  $effect(() => {
    if (chosen) view = chosen;
  });
  const busy = $derived(f.type === 'date' ? busyDays(store.files) : new Map());
  // «Вставится: DEADLINE: <…>» when the plugin says what it writes (the goal form)
  const spec = $derived(f.type === 'date' && f.stamp ? { kind: f.stamp.kind, initial: new Date(), current: null, names: f.stamp.names, pick: () => {} } : { kind: 'DATE' as const, initial: new Date(), current: null, names: [], pick: () => {} });

  // ---- a place --------------------------------------------------------------------------------------------------
  const place = $derived((values[f.key] ?? null) as PlaceValue | null);
  const NEW = '\u0000new';
  const created = $derived(f.type === 'place' && place?.path && f.create ? f.create(place.path) : null);

  // the choice of a place moved by the sheet's keys (a plugin's own sheet, ТЗ 27)
  let picker: PlacePicker | undefined = $state();
  export function move(d: 1 | -1) {
    picker?.move(d);
  }
  export function focusList(which: 'file' | 'head') {
    picker?.focusList(which);
  }

  // ---- the plugin's own ----------------------------------------------------------------------------------------
  let own = $state<HTMLElement>();
  const listeners = new Set<(v: Values) => void>();
  $effect(() => {
    const v = values;
    for (const l of listeners) l(v);
  });
  $effect(() => {
    const node = own;
    if (!node || f.type !== 'custom') return;
    const field = f;
    const ctrl: FieldCtrl = {
      value: () => values[field.key],
      values: () => values,
      set: (x) => set(field.key, x),
      onChange: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
    let done: (() => void) | void;
    try {
      done = field.render(node, ctrl);
    } catch (err) {
      node.textContent = 'Поле не нарисовалось: ' + (err instanceof Error ? err.message : String(err));
    }
    return () => {
      try {
        done?.();
      } catch {
        /* gone anyway */
      }
      node.replaceChildren();
    };
  });
</script>

{#if f.type === 'textarea'}
  <textarea class="ta" aria-labelledby={id} rows="2" placeholder={f.placeholder} value={(values[f.key] as string) ?? ''}
    oninput={(e) => { set(f.key, e.currentTarget.value); grow(e.currentTarget); }} onkeydown={listKey} use:grow></textarea>
{:else if f.type === 'date'}
  {#if f.look === 'chip'}
    <span class="chips">
      <button class="chip" aria-labelledby={id} aria-expanded={open} onclick={() => (open = !open)}>{chosen ? longDate(chosen) : 'Без даты'}</button>
      {#if chosen && f.clear}<button class="chip x" onclick={() => set(f.key, null)}>{f.clear}</button>{/if}
    </span>
  {/if}
  {#if f.look === 'inline' || open}
    <div class="calbox" role="group" aria-labelledby={id}>
      <Calendar {spec} sel={chosen ?? new Date()} {view} bad={false} {busy}
        onselect={(d) => set(f.key, iso(d))} onpick={(d) => { set(f.key, iso(d)); open = false; }} onturn={(n) => (view = shiftDate(view, 'month', n))} />
    </div>
  {/if}
{:else if f.type === 'place'}
  <div class="place" role="group" aria-labelledby={id}>
    <PlacePicker bind:this={picker} variant="columns" levels={f.levels} file={place?.path ?? null} heading={place?.create ? NEW : (place?.heading ?? null)}
      fileCap={f.fileCap} headCap={f.headCap}
      fileNote={f.note ? (rel) => ({ dim: false, ...f.note!(rel) }) : undefined}
      headNote={f.headNote ? (file, i) => f.headNote!(file.name, file.headings[i].title) : undefined}
      extra={created ? { id: NEW, label: created } : null}
      onfile={(rel) => set(f.key, { path: rel, heading: null })}
      onhead={(h) => set(f.key, h === NEW ? { path: place!.path, heading: null, create: true } : { path: place!.path, heading: h })} />
  </div>
{:else if f.type === 'custom'}
  <div class="own" bind:this={own}></div>
{:else if f.type === 'month'}
  {@const m = (values[f.key] ?? null) as { path: string; line: number; date: string | null; open: boolean } | null}
  {@const abs = m ? (store.files.find((x) => x.name === m.path)?.path ?? m.path) : ''}
  {#if m}
    <CalReview task={{ path: abs, line: m.line, date: day(m.date) }} open={m.open} keyId={f.keyId} ontoggle={() => set(f.key, { ...m, open: !m.open })} />
  {/if}
{/if}

<style>
  .ta { box-sizing: border-box; width: 100%; min-height: 54px; resize: none; overflow: hidden; padding: 6px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font: inherit; font-size: 13px; line-height: 1.45; outline: none; -webkit-user-select: text; user-select: text; }
  .ta:focus { border-color: var(--acc); box-shadow: 0 0 0 1px var(--acc); }
  .calbox { border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: var(--bg); }
  .chips { display: flex; gap: 6px; }
  .chip { height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 13px; background: var(--bg); color: var(--fg); font-size: 12.5px; align-self: flex-start; }
  .chip.x { color: var(--fg2); }
  .place { border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: var(--bg); }
  .place :global(.c-cols) { border-bottom: 0; }
  .own { min-width: 0; }
</style>
