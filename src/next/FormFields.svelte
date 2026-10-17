<script lang="ts">
  import { tick } from 'svelte';
  import { store } from '../store.svelte';
  import { longDate } from '../calendar';
  import { listEnter, listIndent } from '../textList';
  import { hintOf, optOf, optValue, optionsOf, type Field, type FieldCtrl, type PlaceValue, type Schema, type Values } from '../settingsSchema';
  import Compat from './Compat.svelte';
  import PlaceColumns from './PlaceColumns.svelte';
  import PlacePalette from './PlacePalette.svelte';

  // A plugin's form fields in the new interface (ТЗ 44 §4): each under its label (11 pt semibold `ink3`), 30 pt on
  // `field`. A text with the plugin's suggestions in a popover under it; a day as a field with «◷» that opens the
  // palette's calendar; a switch as a check; a choice as segments or a menu; a file from the palette's files; a file and
  // its heading in two columns; the plugin's own field in the compatibility layer. `wrong` — the form's reason, under
  // the first field in `todo`.
  let { schema, wrong = '' }: { schema: Schema; wrong?: string } = $props();
  const v = $derived(schema.values());
  const set = (key: string, value: unknown) => void schema.set({ [key]: value });
  const id = (f: Field) => `${schema.id}-${f.key}`;
  const first = $derived(schema.groups.flatMap((g) => g.fields)[0]?.key);

  // ---- a text's suggestions -------------------------------------------------------------------------------------
  let open = $state<string | null>(null); // the field whose popover is up
  let cur = $state(0);
  type Sug = { value: string; hint?: string; typed?: boolean };
  function sugs(f: Extract<Field, { type: 'text' }>): Sug[] {
    const q = String(v[f.key] ?? '');
    const t = q.trim().toLowerCase();
    const found = (f.suggest?.(q, v) ?? []).slice(0, 6);
    return [...(t && !found.some((x) => x.value.toLowerCase() === t) ? [{ value: q.trim(), hint: 'новое', typed: true }] : []), ...found.filter((x) => x.value.toLowerCase() !== t || !t)];
  }
  function textKey(e: KeyboardEvent, f: Extract<Field, { type: 'text' }>) {
    if (!f.suggest || open !== f.key) return;
    const list = sugs(f);
    if (!list.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // the popover first, not the sheet
      open = null;
    } else if (e.key === 'Enter' && !e.metaKey && !list[cur]?.typed) {
      // a suggestion taken: the value, not the form sent
      e.preventDefault();
      e.stopPropagation();
      set(f.key, list[cur].value);
      open = null;
    }
  }

  // ---- lines -----------------------------------------------------------------------------------------------------
  const grow = (ta: HTMLTextAreaElement) => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 2 + 'px';
  };
  function listKey(e: KeyboardEvent, key: string) {
    const ta = e.currentTarget as HTMLTextAreaElement;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const r = e.key === 'Enter' && !e.shiftKey && !e.isComposing ? listEnter(ta.value, ta.selectionStart) : e.key === 'Tab' ? (listIndent(ta.value, ta.selectionStart, e.shiftKey ? -1 : 1) ?? { value: ta.value, caret: ta.selectionStart }) : null;
    if (!r) return;
    e.preventDefault();
    e.stopPropagation(); // not the form's ↩
    set(key, r.value);
    void tick().then(() => {
      ta.selectionStart = ta.selectionEnd = r.caret;
      grow(ta);
    });
  }

  // ---- a day: «yyyy-mm-dd», chosen in the palette's calendar ---------------------------------------------------
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? new Date(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)) : null);
  function pickDay(f: Extract<Field, { type: 'date' }>, back: HTMLElement) {
    const d = day(v[f.key]);
    store.openCalendar({
      kind: f.stamp?.kind ?? 'DATE', initial: d ?? new Date(), current: d, names: f.stamp?.names ?? [], plate: { kind: 'text', text: f.label },
      pick: (x) => {
        set(f.key, iso(x));
        void tick().then(() => back.focus());
      },
      ...(d && f.clear ? { clear: () => set(f.key, null) } : {}),
    });
  }

  // ---- a file ----------------------------------------------------------------------------------------------------
  let picking = $state<Extract<Field, { type: 'file' }> | null>(null);

  // ---- the plugin's own ------------------------------------------------------------------------------------------
  const listeners = new Set<(v: Values) => void>();
  $effect(() => {
    const x = v;
    for (const l of listeners) l(x);
  });
  function own(node: HTMLElement, field: Extract<Field, { type: 'custom' }>) {
    const ctrl: FieldCtrl = {
      value: () => schema.values()[field.key],
      values: () => schema.values(),
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
    return {
      destroy() {
        try {
          done?.();
        } catch {
          /* gone anyway */
        }
        node.replaceChildren();
      },
    };
  }
  const NEW = '\u0000new';
</script>

{#each schema.groups as g, gi (gi)}
  {#if g.caption}<div class="gcap">{g.caption}</div>{/if}
  {#each g.fields as f (f.key)}
    {@const hint = hintOf(f, v)}
    {@const why = f.key === first ? wrong : ''}
    {#if f.type === 'switch'}
      <label class="check">
        <input type="checkbox" checked={!!v[f.key]} onchange={() => set(f.key, !v[f.key])} />
        <span class="box" aria-hidden="true">✓</span>{f.label}{#if hint}<span class="side">{hint}</span>{/if}
      </label>
      {#if why}<span class="why" role="alert">{why}</span>{/if}
    {:else if f.type === 'month'}
      <!-- a widget's only (ТЗ 28): nothing in a form -->
    {:else}
      <div class="fld">
        <span class="lbl" id={id(f)}>{f.label}</span>
        {#if f.type === 'text'}
          {@const list = open === f.key ? sugs(f) : []}
          <span class="sugw">
            <input class="f" class:bad={!!why} aria-labelledby={id(f)} value={(v[f.key] as string) ?? ''} placeholder={f.placeholder} spellcheck="false" autocomplete="off"
              aria-autocomplete={f.suggest ? 'list' : undefined} aria-expanded={f.suggest ? list.length > 0 : undefined}
              oninput={(e) => { set(f.key, e.currentTarget.value); if (f.suggest) ((open = f.key), (cur = 0)); }}
              onchange={(e) => { if (f.clean) set(f.key, f.clean(e.currentTarget.value)); }}
              onfocus={() => { if (f.suggest) ((open = f.key), (cur = 0)); }} onblur={() => (open = null)} onkeydown={(e) => textKey(e, f)} />
            {#if list.length}
              <div class="sug" role="listbox" aria-label="Подсказки">
                {#each list as x, i (x.value + (x.typed ? ':new' : ''))}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div class="opt" role="option" tabindex="-1" aria-selected={i === cur} class:on={i === cur} onmousedown={(e) => e.preventDefault()} onmousemove={() => (cur = i)}
                    onclick={() => { set(f.key, x.value); open = null; }}>
                    <span class="ov">{x.value}</span>{#if x.hint}<span class="oh">{x.hint}</span>{/if}
                  </div>
                {/each}
              </div>
            {/if}
          </span>
          {#if hint}<span class="hint">{hint}</span>{/if}
        {:else if f.type === 'textarea'}
          <textarea class="f ta" class:bad={!!why} aria-labelledby={id(f)} rows="2" placeholder={f.placeholder} value={(v[f.key] as string) ?? ''}
            oninput={(e) => { set(f.key, e.currentTarget.value); grow(e.currentTarget); }} onkeydown={(e) => listKey(e, f.key)} use:grow></textarea>
          {#if hint}<span class="hint">{hint}</span>{/if}
        {:else if f.type === 'date'}
          {@const d = day(v[f.key])}
          <span class="row">
            <button class="f dv" aria-labelledby={id(f)} aria-haspopup="dialog" onclick={(e) => pickDay(f, e.currentTarget)}><span class="clock" aria-hidden="true">◷</span>{d ? longDate(d) : 'Без даты'}</button>
            {#if d && f.clear}<button class="x" onclick={() => set(f.key, null)}>{f.clear}</button>{/if}
            {#if hint}<span class="side">{hint}</span>{/if}
          </span>
        {:else if f.type === 'choice'}
          {@const opts = optionsOf(f, v)}
          {#if f.look === 'segments'}
            <span class="seg" role="radiogroup" aria-labelledby={id(f)}>
              {#each opts as o, i (i)}
                <button role="radio" aria-checked={v[f.key] === o.value} class:on={v[f.key] === o.value} disabled={o.disabled} onclick={() => set(f.key, o.value)}>{o.label}</button>
              {/each}
            </span>
          {:else}
            <select class="f" aria-labelledby={id(f)} disabled={f.disabled?.(v) ?? false} value={optValue(v[f.key])} onchange={(e) => set(f.key, optOf(opts, e.currentTarget.value))}>
              {#each opts as o, i (i)}<option value={optValue(o.value)} disabled={o.disabled}>{o.label}</option>{/each}
            </select>
          {/if}
          {#if hint}<span class="hint">{hint}</span>{/if}
        {:else if f.type === 'pair'}
          {@const both = f.options(v)}
          <span class="row" role="group" aria-labelledby={id(f)}>
            {#each [f.key, f.key2] as k, n (k)}
              {#if n}<span class="side">–</span>{/if}
              <select class="f" aria-label={f.labels[n]} value={optValue(v[k])} onchange={(e) => set(k, optOf(both[n], e.currentTarget.value))}>
                {#each both[n] as o, i (i)}<option value={optValue(o.value)} disabled={o.disabled}>{o.label}</option>{/each}
              </select>
            {/each}
          </span>
          {#if hint}<span class="hint">{hint}</span>{/if}
        {:else if f.type === 'file'}
          <span class="row">
            <button class="f dv" aria-labelledby={id(f)} data-testid={id(f)} onclick={() => (picking = f)}>{f.show((v[f.key] as string | null) ?? null)}</button>
            {#if v[f.key] && f.clear}<button class="x" aria-label="{f.label}: {f.clear}" onclick={() => set(f.key, null)}>×</button>{/if}
          </span>
          {#if hint}<span class="hint">{hint}</span>{/if}
        {:else if f.type === 'place'}
          {@const place = (v[f.key] ?? null) as PlaceValue | null}
          {@const created = place?.path && f.create ? f.create(place.path) : null}
          <div role="group" aria-labelledby={id(f)}>
            <PlaceColumns levels={f.levels} file={place?.path ?? null} heading={place?.create ? NEW : (place?.heading ?? null)} fileCap={f.fileCap} headCap={f.headCap}
              fileNote={f.note} headNote={f.headNote ? (file, i) => f.headNote!(file.name, file.headings[i].title) : undefined}
              extra={created ? { id: NEW, label: created } : null}
              onfile={(rel) => set(f.key, { path: rel, heading: null })}
              onhead={(h) => set(f.key, h === NEW ? { path: place!.path, heading: null, create: true } : { path: place!.path, heading: h })} />
          </div>
          {#if hint}<span class="hint">{hint}</span>{/if}
        {:else if f.type === 'custom'}
          <Compat><div class="own" role="group" aria-labelledby={id(f)} use:own={f}></div></Compat>
          {#if hint}<span class="hint">{hint}</span>{/if}
        {/if}
        {#if why}<span class="why" role="alert">{why}</span>{/if}
      </div>
    {/if}
  {/each}
  {#if g.help}<p class="help">{g.help}</p>{/if}
{/each}
{#each picking ? [picking] : [] as f (f.key)}
  <PlacePalette kind="file" title={f.label} token={f.label} placeholder="Найти файл" recent={store.refileRecentFiles('')} onclose={() => (picking = null)}
    onpick={(x) => {
      const rel = store.files.find((y) => y.path === x.path)?.name;
      if (!rel) return 'Файл не найден';
      set(f.key, rel);
      picking = null;
    }} />
{/each}

<style>
  .gcap { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3); margin-top: 4px; }
  .fld { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .lbl { font-size: 11px; font-weight: 600; color: var(--ink3); }
  .f { height: 30px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 7px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); caret-color: var(--lamp); font: 13px var(--ui); outline: none; -webkit-user-select: text; user-select: text; }
  .f:focus, .f:focus-visible { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .f.bad { box-shadow: inset 0 0 0 1.5px var(--todo); }
  select.f { padding-right: 6px; }
  .ta { height: auto; min-height: 54px; padding: 6px 10px; resize: none; overflow: hidden; line-height: 1.45; }
  .dv { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .clock { color: var(--lampink); }
  .row { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .side { font-size: 12px; color: var(--ink3); white-space: nowrap; }
  .hint { font-size: 11.5px; color: var(--ink3); }
  .why { font-size: 11.5px; color: var(--todo); }
  .x { height: 30px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink2); font: 12.5px var(--ui); white-space: nowrap; }
  .sugw { position: relative; display: flex; flex-direction: column; }
  .sug { position: absolute; z-index: 2; left: 0; right: 0; top: 34px; padding: 4px; border-radius: 8px; background: var(--card); border: 1px solid var(--rule); box-shadow: var(--popshadow); }
  .opt { display: flex; align-items: center; height: 28px; padding: 0 8px; border-radius: 5px; color: var(--ink); cursor: default; }
  .opt.on { background: var(--lamp); color: var(--onlamp); }
  .ov { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .oh { font-size: 11.5px; color: var(--ink3); }
  .opt.on .oh { color: inherit; opacity: 0.8; }
  .check { display: flex; align-items: center; gap: 8px; color: var(--ink); cursor: default; }
  .check input { position: absolute; opacity: 0; pointer-events: none; }
  .box { flex: 0 0 15px; width: 15px; height: 15px; box-sizing: border-box; border: 1.5px solid var(--ink3); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: transparent; font-size: 10px; font-weight: 800; }
  .check input:checked + .box { background: var(--done); border-color: var(--done); color: var(--card); }
  .check input:focus-visible + .box { box-shadow: 0 0 0 2px var(--lampline); }
  .seg { display: flex; align-self: flex-start; gap: 2px; padding: 2px; border-radius: 7px; background: var(--chip); }
  .seg button { height: 24px; padding: 0 12px; border: 0; border-radius: 5px; background: transparent; color: var(--ink2); font: 12.5px var(--ui); white-space: nowrap; }
  .seg button.on { background: var(--segon); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); }
  .seg button:disabled { opacity: 0.4; }
  .own { min-width: 0; }
  .help { margin: 0; font-size: 12px; line-height: 1.5; color: var(--ink3); }
</style>
