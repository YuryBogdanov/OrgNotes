<script lang="ts">
  import { plugins, rightsText } from '../api/host.svelte';
  import { iconOf } from '../api/manifest';
  import { store } from '../store.svelte';
  import { PluginFormCtl, mountPluginSheet, placeClosed, placePicked, pluginSheetKey } from '../pluginFormCtl.svelte';
  import Compat from './Compat.svelte';
  import FormFields from './FormFields.svelte';
  import PlacePalette from './PlacePalette.svelte';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';
  import Menu from './ui/Menu.svelte';

  // The core's sheets a plugin asks for, in the new interface (ТЗ 44 §4, ТЗ 26 §5.2): a form (`ui.form`, 460 pt, 640
  // with the columns of a place), the plugin's own sheet (`ui.sheet`; what it draws is in the compatibility layer), its
  // menu (`ui.menu`), «Включить плагин?» and the choice of a place (`ui.place`, the new palette). Over the title the
  // plugin's name with its icon in `plug`. The workings are pluginFormCtl.svelte.ts, shared with the old sheets.
  const form = new PluginFormCtl();
  let fbox: HTMLDivElement | undefined = $state();
  let extra = $state<HTMLElement>();
  form.effects(() => extra, () => fbox?.querySelector<HTMLElement>('input, textarea, select, button'));
  const schema = $derived(form.schema);
  const PLUG = 'M7 3v4M13 3v4M5 7h10v3a5 5 0 0 1-10 0zM10 15v2.5';
  const iconFor = (id: string) => {
    const m = plugins.entry(id)?.manifest;
    return (m && iconOf(m)) ?? PLUG;
  };

  // ---- the plugin's own sheet -----------------------------------------------------------------------------------
  let sheetBody = $state<HTMLElement>();
  let sheetFoot = $state<HTMLElement>();
  $effect(() => {
    const node = sheetBody;
    const r = plugins.sheetReq;
    if (!node || !r) return;
    return mountPluginSheet(node, r, () => sheetFoot?.querySelector<HTMLElement>('button.main') ?? node.closest<HTMLElement>('[role="dialog"]'));
  });
  function picked(x: { path: string; heading: { line: number; title: string } | null }) {
    return placePicked(x, store.files.find((f) => f.path === x.path)?.name);
  }
</script>

<svelte:window onkeydowncapture={pluginSheetKey} />

{#snippet who(id: string)}
  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={iconFor(id)} /></svg>{plugins.name(id)}
{/snippet}

{#if plugins.form && schema}
  {@const r = plugins.form}
  {@const wide = r.spec.groups.some((g) => g.fields.some((f) => f.type === 'place'))}
  <Sheet label={r.spec.title} width={wide ? 640 : 460} oncancel={() => form.answer(null)}>
    {#snippet eyebrow()}{@render who(r.plugin)}{/snippet}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="form" bind:this={fbox} onkeydown={(e) => form.key(e)}>
      <div class="head"><h2>{r.spec.title}</h2>{#if r.spec.headerExtra}<Compat><span class="hx" bind:this={extra}></span></Compat>{/if}</div>
      <FormFields {schema} wrong={form.problem} />
    </div>
    {#snippet foot()}
      <span class="fill"></span>
      <Button key="esc" onclick={() => form.answer(null)}>Отмена</Button>
      <Button kind="main" key="↩" onclick={() => form.submit()}>{r.spec.submit}</Button>
    {/snippet}
  </Sheet>
{/if}

{#each plugins.sheetReq ? [plugins.sheetReq] : [] as r (r)}
  {#if r.spec.bare}
    <!-- the plugin draws the whole sheet (its dialog, header, footer, keys) -->
    <div class="dim" aria-hidden="true"></div>
    <Compat><div class="bare" bind:this={sheetBody}></div></Compat>
  {:else}
    <Sheet title={r.spec.title} width={620} oncancel={() => r.resolve(null)}>
      {#snippet eyebrow()}{@render who(r.plugin)}{/snippet}
      <Compat><div class="own" bind:this={sheetBody}></div></Compat>
      {#snippet foot()}
        {#if r.spec.buttons?.length || r.spec.note}
          <div class="pfoot" bind:this={sheetFoot}>
            <span class="note">{r.spec.note ?? ''}</span>
            {#each [...(r.spec.buttons ?? [])].reverse() as b (b.id)}
              <Button kind={b.primary ? 'main' : 'plain'} key={b.primary ? '↩' : undefined} onclick={() => r.resolve(b.id)}>{b.label}</Button>
            {/each}
          </div>
        {/if}
      {/snippet}
    </Sheet>
  {/if}
{/each}

{#if plugins.menuReq}
  {@const m = plugins.menuReq}
  <Menu x={m.x} y={m.y} items={m.items} label={plugins.name(m.plugin)} onclose={() => (plugins.menuReq = null)} />
{/if}

{#each plugins.trustReq ? [plugins.trustReq] : [] as t (t)}
  {@const m = t.entry.manifest!}
  <Sheet role="alertdialog" label={t.update ? `Обновить плагин «${m.name}»` : `Включить плагин «${m.name}»`} title={t.update ? `Обновить «${m.name}» до ${t.update}?` : `Включить плагин «${m.name}»?`} oncancel={() => t.resolve(false)}>
    {#if t.update}
      <p>Новой версии нужны другие права. Плагин получит доступ: {m.permissions.length ? rightsText(m) : 'только к своим настройкам'}.</p>
    {:else}
      <p>Плагин «{m.name}»{m.author ? ` (${m.author})` : ''} получит доступ: {m.permissions.length ? rightsText(m) : 'только к своим настройкам'}.</p>
    {/if}
    <p class="fine">Плагин работает внутри приложения: права защищают от ошибок, но не от намеренно вредного кода. Включайте плагины только из источников, которым доверяете.</p>
    {#snippet foot()}
      <span class="fill"></span>
      <Button key="esc" onclick={() => t.resolve(false)}>Отмена</Button>
      <Button kind="main" key="↩" autofocus onclick={() => t.resolve(true)}>{t.update ? 'Обновить' : 'Включить'}</Button>
    {/snippet}
  </Sheet>
{/each}

{#each plugins.place ? [plugins.place] : [] as p (p)}
  <PlacePalette kind={p.kind} title={p.title} token={p.title} placeholder="Найти файл" recent={store.refileRecentFiles('')} onpick={picked} onclose={() => placeClosed(p)} />
{/each}

<style>
  .form { display: flex; flex-direction: column; gap: 12px; color: var(--ink); }
  .head { display: flex; align-items: center; gap: 10px; }
  h2 { margin: 0; font: 600 15px/1.3 var(--ui); color: var(--ink); }
  .hx { margin-left: auto; display: flex; align-items: center; }
  .fill { flex: 1; }
  .own { min-width: 0; color: var(--fg); }
  .pfoot { flex: 1; display: flex; align-items: center; gap: 8px; }
  .note { flex: 1; font-size: 11.5px; color: var(--ink3); }
  p { margin: 0; }
  .fine { font-size: 12px; color: var(--ink3); }
  .dim { position: fixed; inset: 0; z-index: 80; background: var(--dim); }
  /* a plugin's own sheet: centred across the window, under the toolbar — one that places itself (`position: absolute`)
     is not moved; one that does not (an older build, as «Неделя» 0.3.0) is not left in the corner */
  .bare { position: fixed; inset: 0; z-index: 81; pointer-events: none; display: flex; flex-direction: column; align-items: center; padding-top: 52px; box-sizing: border-box; }
  .bare > :global(*) { pointer-events: auto; }
</style>
