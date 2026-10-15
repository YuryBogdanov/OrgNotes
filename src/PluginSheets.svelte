<script lang="ts">
  import { tick } from 'svelte';
  import { plugins, rightsText, type FormReq, type PlaceReq } from './api/host.svelte';
  import { store } from './store.svelte';
  import PlacePicker from './PlacePicker.svelte';
  import SchemaSettings from './SchemaSettings.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import { WIDE, type Field, type Group, type Schema, type Values } from './settingsSchema';

  // The core's sheets a plugin asks for (ТЗ 26 §5.2): a form with the fields of the settings by schema, and the
  // choice of a place. Each answers the plugin's promise: the values / the place, or null when cancelled.

  // ---- the form -------------------------------------------------------------------------------------------------
  let values = $state<Values>({});
  let problem = $state('');
  let sheet: HTMLDivElement | undefined = $state();
  let formOf: FormReq | null = null;
  const schema = $derived.by((): Schema | null => {
    const r = plugins.form;
    if (!r) return null;
    const groups: Group[] = r.spec.groups.map((g) => ({
      caption: g.caption ?? '', help: g.help,
      fields: g.fields.map((f) => ({ ...f, where: 'local', ...(f.type === 'file' ? { show: (rel: string | null) => rel ?? 'Не выбран' } : {}), ...(f.type === 'pair' ? { options: () => f.options } : {}) }) as Field),
    }));
    return {
      id: 'pf', label: r.spec.title, groups, values: () => values,
      set: (patch) => {
        values = { ...values, ...patch };
        // the plugin may set more on a change (a file chosen gives the name)
        for (const k of Object.keys(patch)) {
          const more = r.spec.onChange ? plugins.guard(r.plugin, () => r.spec.onChange!(k, values), undefined) : undefined;
          if (more && typeof more === 'object') values = { ...values, ...more };
        }
        for (const l of formListeners) l(values);
      },
    };
  });
  $effect(() => {
    const r = plugins.form;
    if (r === formOf) return;
    formOf = r;
    if (!r) return;
    const v: Values = {};
    for (const g of r.spec.groups) for (const f of g.fields) for (const k of f.type === 'pair' ? [f.key, f.key2] : [f.key]) v[k] = r.spec.initial?.[k] ?? (f.type === 'switch' ? false : f.type === 'text' ? '' : null);
    values = v;
    problem = '';
    void tick().then(() => (sheet?.querySelector('input, select, button.switch') as HTMLElement | null)?.focus());
  });
  // the plugin's place in the sheet's title
  const formListeners = new Set<(v: Values) => void>();
  let extra = $state<HTMLElement>();
  $effect(() => {
    const node = extra;
    const r = plugins.form;
    if (!node || !r?.spec.headerExtra) return;
    const ctrl = {
      values: () => values,
      set: (k: string, x: unknown) => schema?.set({ [k]: x }),
      onChange: (fn: (v: Values) => void) => {
        formListeners.add(fn);
        return () => void formListeners.delete(fn);
      },
    };
    const d = plugins.guard(r.plugin, () => r.spec.headerExtra!(node, ctrl), undefined);
    return () => {
      plugins.guard(r.plugin, () => d?.(), undefined);
      node.replaceChildren();
    };
  });

  // ---- a sheet of the plugin's -------------------------------------------------------------------------------------
  let sheetBody = $state<HTMLElement>();
  $effect(() => {
    const node = sheetBody;
    const r = plugins.sheetReq;
    if (!node || !r) return;
    const d = plugins.guard(r.plugin, () => r.spec.render(node, { close: (b?: string) => r.resolve(b ?? null) }), undefined);
    void tick().then(() => {
      // ⎋ and ↩ reach the sheet: its primary button takes the focus (as a macOS sheet), else the sheet itself
      if (!r.spec.bare && !node.contains(document.activeElement)) ((node.parentElement?.querySelector('footer .pri') ?? node.parentElement) as HTMLElement | null)?.focus();
    });
    return () => {
      plugins.guard(r.plugin, () => d?.(), undefined);
      node.replaceChildren();
    };
  });
  // on the window: the focus may come back to the editor after the palette that opened the sheet
  function sheetKey(e: KeyboardEvent) {
    const r = plugins.sheetReq;
    if (!r || r.spec.bare || plugins.form || plugins.trustReq) return; // a bare sheet keeps its own keys
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      r.resolve(null);
    } else if (e.key === 'Enter' && (e.metaKey || !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement))) {
      const p = r.spec.buttons?.find((b) => b.primary);
      if (p) {
        e.preventDefault();
        r.resolve(p.id);
      }
    }
  }

  function answer(v: Values | null) {
    const r = plugins.form;
    if (!r) return;
    plugins.form = null;
    r.resolve(v);
  }
  function submit() {
    const r = plugins.form;
    if (!r) return;
    const why = r.spec.validate ? plugins.guard(r.plugin, () => r.spec.validate!(values), null) : null;
    if (why) problem = why;
    else answer(JSON.parse(JSON.stringify(values)));
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      answer(null);
    } else if (e.key === 'Enter' && (e.metaKey || (e.target as HTMLElement).tagName === 'INPUT')) {
      e.preventDefault();
      (e.target as HTMLElement).blur?.(); // a text field gives its value first
      void tick().then(submit);
    }
  }

  // ---- the place ------------------------------------------------------------------------------------------------
  function picked(p: PlaceReq, x: { path: string; heading: { line: number; title: string } | null }) {
    const rel = store.files.find((f) => f.path === x.path)?.name;
    if (!rel) return 'Файл не найден';
    plugins.place = null;
    p.resolve(x.heading ? { path: rel, line: x.heading.line, title: x.heading.title } : { path: rel });
  }
  function closed(p: PlaceReq) {
    if (plugins.place !== p) return;
    plugins.place = null;
    p.resolve(null);
  }
</script>

<svelte:window onkeydowncapture={sheetKey} />

{#if plugins.form && schema}
  {@const r = plugins.form}
  <div class="scrim" aria-hidden="true"></div>
  <div class="pform" class:wide={r.spec.groups.some((g) => g.fields.some((f) => WIDE.has(f.type)))} role="dialog" aria-modal="true" aria-label={r.spec.title} tabindex="-1" bind:this={sheet} onkeydown={key}>
    <header><b>{r.spec.title}</b>{#if r.spec.headerExtra}<span class="hx" bind:this={extra}></span>{/if}<span class="who">{plugins.name(r.plugin)}</span></header>
    <div class="body"><SchemaSettings {schema} embedded where={false} /></div>
    <footer>
      {#if problem}<span class="bad" role="alert">{problem}</span>{:else}<span class="kh">↩ — {r.spec.submit.toLowerCase()} · ⎋ — отмена</span>{/if}
      <button onclick={() => answer(null)}>Отмена</button>
      <button class="pri" onclick={submit}>{r.spec.submit}</button>
    </footer>
  </div>
{/if}
{#each plugins.sheetReq ? [plugins.sheetReq] : [] as r (r)}
  <div class="scrim" aria-hidden="true"></div>
  {#if r.spec.bare}
    <!-- the plugin draws the whole sheet (its dialog, header, footer, keys) -->
    <div class="bare" bind:this={sheetBody}></div>
  {:else}
  <div class="pform psheet" role="dialog" aria-modal="true" aria-label={r.spec.title} tabindex="-1">
    <header><b>{r.spec.title}</b><span class="who">{plugins.name(r.plugin)}</span></header>
    <div class="body" bind:this={sheetBody}></div>
    {#if r.spec.buttons?.length || r.spec.note}
      <footer>
        <span class="kh">{r.spec.note ?? ''}</span>
        {#each [...(r.spec.buttons ?? [])].reverse() as b (b.id)}<button class:pri={b.primary} onclick={() => r.resolve(b.id)}>{b.label}</button>{/each}
      </footer>
    {/if}
  </div>
  {/if}
{/each}
{#if plugins.menuReq}
  <ContextMenu x={plugins.menuReq.x} y={plugins.menuReq.y} items={plugins.menuReq.items} onclose={() => (plugins.menuReq = null)} />
{/if}
{#each plugins.trustReq ? [plugins.trustReq] : [] as t (t)}
  {@const m = t.entry.manifest!}
  <div class="scrim" aria-hidden="true"></div>
  <div class="pform trust" role="alertdialog" aria-modal="true" aria-label={t.update ? `Обновить плагин «${m.name}»` : `Включить плагин «${m.name}»`} tabindex="-1"
    onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); t.resolve(false); } }}>
    <header><b>{t.update ? `Обновить «${m.name}» до ${t.update}?` : `Включить плагин «${m.name}»?`}</b></header>
    <div class="body">
      {#if t.update}
        <p>Новой версии нужны другие права. Плагин получит доступ: {m.permissions.length ? rightsText(m) : 'только к своим настройкам'}.</p>
      {:else}
        <p>Плагин «{m.name}»{m.author ? ` (${m.author})` : ''} получит доступ: {m.permissions.length ? rightsText(m) : 'только к своим настройкам'}.</p>
      {/if}
      <p class="fine">Плагин работает внутри приложения: права защищают от ошибок, но не от намеренно вредного кода. Включайте плагины только из источников, которым доверяете.</p>
    </div>
    <footer>
      <span class="kh"></span>
      <button onclick={() => t.resolve(false)}>Отмена</button>
      <!-- svelte-ignore a11y_autofocus -->
      <button class="pri" autofocus onclick={() => t.resolve(true)}>{t.update ? 'Обновить' : 'Включить'}</button>
    </footer>
  </div>
{/each}
{#each plugins.place ? [plugins.place] : [] as p (p)}
  <PlacePicker kind={p.kind} title={p.title} token={p.title} placeholder="Найти файл" levels={p.levels} recent={store.refileRecentFiles('')}
    onpick={(x) => picked(p, x)} onclose={() => closed(p)} />
{/each}

<style>
  .scrim { position: fixed; inset: 0; z-index: 80; background: rgba(0, 0, 0, 0.42); }
  .pform { position: fixed; z-index: 81; left: 50%; top: 64px; max-height: calc(100% - 128px); transform: translateX(-50%); width: min(620px, calc(100% - 48px)); display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5); overflow: hidden; outline: none; }
  header { flex: 0 0 52px; display: flex; align-items: center; gap: 10px; padding: 0 20px; background: var(--bar); border-bottom: 1px solid var(--line); }
  header b { font-size: 15px; }
  .pform.wide { width: min(800px, calc(100% - 48px)); }
  .hx { margin-left: auto; display: flex; align-items: center; }
  .hx + .who { margin-left: 10px; }
  .who { margin-left: auto; font-size: 11.5px; color: var(--fg3); }
  .body { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; }
  footer { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--line); background: var(--side); }
  .kh { font-size: 11.5px; color: var(--fg3); margin-right: auto; }
  .bad { font-size: 12px; color: var(--todo); margin-right: auto; }
  footer button { height: 30px; padding: 0 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); }
  footer .pri { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .trust { z-index: 81; }
  .bare { position: fixed; inset: 0; z-index: 81; pointer-events: none; }
  .bare > :global(*) { pointer-events: auto; }
  .trust .body p { margin: 0; font-size: 13px; line-height: 1.5; }
  .trust .fine { color: var(--fg2); font-size: 12px; }
</style>
