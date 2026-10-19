<script lang="ts">
  import { plugins, rightsText } from './api/host.svelte';
  import { PluginFormCtl, mountPluginSheet, placeClosed, placePicked, pluginSheetKey } from './pluginFormCtl.svelte';
  import { store } from './store.svelte';
  import PlacePicker from './PlacePicker.svelte';
  import SchemaSettings from './SchemaSettings.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import { WIDE } from './settingsSchema';

  // The core's sheets a plugin asks for (ТЗ 26 §5.2): a form with the fields of the settings by schema, and the
  // choice of a place. Each answers the plugin's promise: the values / the place, or null when cancelled.

  // ---- the form: its workings are pluginFormCtl.svelte.ts (the new interface draws them too) --------------------
  const form = new PluginFormCtl();
  let sheet: HTMLDivElement | undefined = $state();
  let extra = $state<HTMLElement>();
  form.effects(() => extra, () => sheet?.querySelector('input, select, button.switch') as HTMLElement | null);
  const schema = $derived(form.schema);

  // ---- a sheet of the plugin's -------------------------------------------------------------------------------------
  let sheetBody = $state<HTMLElement>();
  $effect(() => {
    const node = sheetBody;
    const r = plugins.sheetReq;
    if (!node || !r) return;
    return mountPluginSheet(node, r, () => (node.parentElement?.querySelector('footer .pri') ?? node.parentElement) as HTMLElement | null);
  });
  function picked(x: { path: string; heading: { line: number; title: string } | null }) {
    return placePicked(x, store.files.find((f) => f.path === x.path)?.name);
  }
</script>

<svelte:window onkeydowncapture={pluginSheetKey} />

{#if plugins.form && schema}
  {@const r = plugins.form}
  <div class="scrim" aria-hidden="true"></div>
  <div class="pform" class:wide={r.spec.groups.some((g) => g.fields.some((f) => WIDE.has(f.type)))} role="dialog" aria-modal="true" aria-label={r.spec.title} tabindex="-1" bind:this={sheet} onkeydown={(e) => form.key(e)}>
    <header><b>{r.spec.title}</b>{#if r.spec.headerExtra}<span class="hx" bind:this={extra}></span>{/if}<span class="who">{plugins.name(r.plugin)}</span></header>
    <div class="body"><SchemaSettings {schema} embedded where={false} /></div>
    <footer>
      {#if form.problem}<span class="bad" role="alert">{form.problem}</span>{:else}<span class="kh">↩ — {r.spec.submit.toLowerCase()} · ⎋ — отмена</span>{/if}
      <button onclick={() => form.answer(null)}>Отмена</button>
      <button class="pri" onclick={() => form.submit()}>{r.spec.submit}</button>
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
    onpick={picked} onclose={() => placeClosed(p)} />
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
  /* a plugin's own sheet: centred across the window, under the toolbar — one that places itself (`position: absolute`)
     is not moved; one that does not (an older build, as «Неделя» 0.3.0) is not left in the corner */
  .bare { position: fixed; inset: 0; z-index: 81; pointer-events: none; display: flex; flex-direction: column; align-items: center; padding-top: 40px; box-sizing: border-box; }
  .bare > :global(*) { pointer-events: auto; }
  .trust .body p { margin: 0; font-size: 13px; line-height: 1.5; }
  .trust .fine { color: var(--fg2); font-size: 12px; }
</style>
