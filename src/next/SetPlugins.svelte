<script lang="ts">
  import { onMount } from 'svelte';
  import { plugins } from '../api/host.svelte';
  import { API_VERSION } from '../api/index';
  import { APP_VERSION, type Entry } from '../api/declare';
  import { sourceLabel } from '../api/sources';
  import { iconOf, type Manifest } from '../api/manifest';
  import { pluginUpdates as up } from '../pluginUpdates.svelte';
  import { catalog, count, type CatalogEntry, type CatState } from '../pluginCatalog.svelte';
  import { store } from '../store.svelte';
  import { setLayer } from '../settingsNav.svelte';
  import type { MenuItem } from '../menuItems';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Button from './ui/Button.svelte';
  import Menu from './ui/Menu.svelte';
  import PluginInstallSheet from './PluginInstallSheet.svelte';
  import PluginLinkSheet from './PluginLinkSheet.svelte';
  import PluginRemoveSheet from './PluginRemoveSheet.svelte';

  // «Настройки → Плагины» of the new interface (ТЗ 54 §3, ТЗ 37): over the groups «Найти в каталоге» and «Установить
  // по ссылке…»; «Установлены · N» — rows of 54: the icon in a square of 30, the name and the version, the
  // description and where it came from, «Обновить · v», «⋯» and «включён»; «Каталог · <repo>» — what is not installed,
  // «★ N», «Установить», the progress as a bar of 3 at the row's foot. The rights and the removal are sheets of ТЗ 44.
  const PLUG = 'M7 3v4M13 3v4M5 7h10v3a5 5 0 0 1-10 0zM10 15v2.5';
  let query = $state('');
  const q = $derived(query.trim().toLowerCase());
  const fits = (...xs: (string | undefined)[]) => !q || xs.some((x) => x?.toLowerCase().includes(q));
  const installed = $derived(plugins.entries.filter((e) => fits(e.manifest?.name, e.manifest?.description, e.manifest?.author, e.dir)));
  const idOf = (e: Entry) => e.manifest?.id ?? e.dir;
  const have = $derived(new Set(plugins.entries.map(idOf)));
  const offered = $derived(catalog.list.filter((c) => !have.has(c.id) && fits(c.name, c.description, c.author, c.id)));
  onMount(() => {
    void up.check();
    void catalog.load();
  });
  const sectionOf = (e: Entry) => (e.enabled ? e.manifest?.contributes.settings.find((x) => x.section)?.section : undefined);
  const subOf = (e: Entry) => [e.manifest?.description, e.builtin ? 'встроенный' : sourceLabel(e.source)].filter(Boolean).join(' · ');

  // ---- «⋯» of a plugin ----
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let installing = $state<{ e: CatalogEntry; m: Manifest } | null>(null);
  let linking = $state(false);
  let open = $state<string | null>(null); // a failed one's stack
  $effect(() => setLayer('plugins', !!(menu || installing || linking || up.removing)));
  $effect(() => () => setLayer('plugins', false));
  function more(ev: MouseEvent, e: Entry) {
    const id = idOf(e);
    const sec = sectionOf(e);
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    menu = {
      x: r.right - 220, y: r.bottom + 4,
      items: [
        ...(sec ? [{ label: 'Настройки плагина', action: () => store.showSection(sec) }] : []),
        ...(e.source && (e.source.kind === 'catalog' || e.source.kind === 'git') ? [{ label: 'Проверить обновления', action: () => void up.checkPlugin(id) }] : []),
        ...(e.builtin ? [] : [{ label: 'Показать в Finder', action: () => void up.reveal(e) }]),
        ...(m(e)?.contributes.commands.length ? [{ label: 'Сочетания плагина', action: () => store.showSection('Клавиши') }] : []),
        ...(e.builtin ? [] : ['sep' as const, { label: 'Удалить плагин…', danger: true, action: () => (up.removing = e) }]),
      ],
    };
  }
  const m = (e: Entry) => e.manifest;
  /** The button of a catalog's plugin: install (its rights first in the sheet). */
  async function act(c: CatalogEntry, st: CatState) {
    const man = await catalog.manifestOf(c);
    if (man && st.kind === 'install') installing = { e: c, m: man };
  }
  async function folder() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_plugins_folder');
    } catch {
      /* in a browser there is no folder */
    }
  }
  let reloading = $state(false);
  async function reload() {
    reloading = true;
    try {
      await plugins.reload();
    } finally {
      reloading = false;
    }
  }
</script>

{#snippet icon(path: string | undefined)}
  <span class="ib"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={path ?? PLUG} /></svg></span>
{/snippet}

<div class="tools">
  <label class="search">
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></svg>
    <input bind:value={query} placeholder="Найти в каталоге" aria-label="Найти в каталоге" spellcheck="false" autocomplete="off" />
  </label>
  <Button onclick={() => (linking = true)}>Установить по ссылке…</Button>
</div>

<Group caption="Установлены" note={String(installed.length)}>
  {#each installed as e (e.dir)}
    {@const man = e.manifest}
    {@const id = idOf(e)}
    {@const u = up.updates.get(id)}
    {@const busy = up.busy.get(id)}
    {@const failed = plugins.failed.get(id)}
    <div class="pl" role="group" aria-label={man?.name ?? e.dir}>
      {@render icon(man ? iconOf(man) : undefined)}
      <div class="tx">
        <div class="nm"><b>{man?.name ?? e.dir}</b>{#if man}<span class="ver">{man.version}</span>{/if}</div>
        <div class="sub">{subOf(e)}</div>
        {#each e.problems as p (p)}<div class="why" role="note">{p}</div>{/each}
        {#if up.errors.get(id)}<div class="warn" role="note">Обновления не проверены: {up.errors.get(id)}</div>{/if}
        {#each man?.warnings ?? [] as w (w)}<div class="warn">{w}</div>{/each}
        {#if plugins.untrusted.get(id)}<div class="warn" role="note">{plugins.untrusted.get(id)}</div>{/if}
        {#if failed && e.enabled}
          <div class="why" role="alert">Выключен после ошибки: {failed} <button class="lnk" aria-expanded={open === id} onclick={() => (open = open === id ? null : id)}>{open === id ? 'Скрыть' : 'Подробнее'}</button></div>
          {#if open === id}<pre class="stack">{plugins.stack.get(id)}</pre>{/if}
        {/if}
      </div>
      {#if u}<Button small kind="main" disabled={!!busy} onclick={() => void up.update(id)}>{busy === 'update' ? 'Обновляем…' : `Обновить · ${u.version}`}</Button>{/if}
      <button class="dots" title="Ещё" aria-label="Ещё: {man?.name ?? e.dir}" aria-haspopup="menu" disabled={!!busy} onclick={(ev) => more(ev, e)}>{busy === 'check' ? '…' : '⋯'}</button>
      <Toggle checked={e.enabled} label="Плагин {man?.name ?? e.dir}" disabled={!man || (!e.enabled && e.problems.length > 0)} onchange={() => void plugins.setEnabled(id, !e.enabled)} />
    </div>
  {:else}
    <Row label="Ничего не найдено" />
  {/each}
</Group>

<Group caption="Каталог" note={catalog.repo}>
  {#if catalog.loading && !catalog.list.length}
    <Row label="Загружаем список плагинов…" />
  {:else if catalog.error && !catalog.list.length}
    <Row label="Каталог не загрузился" hint={catalog.error}><Button small onclick={() => void catalog.load(true)}>Повторить</Button></Row>
  {:else}
    {#each offered as c (c.id)}
      {@const st = catalog.stateOf(c)}
      {@const cm = catalog.manifests.get(c.id)}
      <div class="pl" role="group" aria-label={c.name}>
        {@render icon(c.icon ?? (cm ? iconOf(cm) : undefined))}
        <div class="tx">
          <div class="nm"><b>{c.name}</b><span class="ver">{[cm?.version, `★ ${count(c.downloads)}`].filter(Boolean).join(' · ')}</span></div>
          <div class="sub">{[c.description, c.author].filter(Boolean).join(' · ')}</div>
        </div>
        {#if st.kind === 'progress'}
          <span class="prog">{st.enabling ? 'Включаем…' : st.total ? `${Math.round((st.done / st.total) * 100)} %` : 'Скачиваем…'}</span>
          <Button small onclick={() => catalog.cancel(c.id)}>Отменить</Button>
          <i class="bar" style="width:{st.total ? (st.done / st.total) * 100 : 8}%" aria-hidden="true"></i>
        {:else if st.kind === 'old'}
          <span class="why">{st.why}</span>
        {:else if st.kind === 'install'}
          <Button small onclick={() => void act(c, st)}>Установить</Button>
        {:else if st.kind === 'unknown'}
          <span class="sub">…</span>
        {/if}
      </div>
    {:else}
      <Row label={q ? 'В каталоге ничего не найдено' : 'Всё из каталога уже установлено'} />
    {/each}
    {#if catalog.offline}<Row label="Нет связи — список прошлой загрузки" hint={catalog.offline}><Button small onclick={() => void catalog.load(true)}>Повторить</Button></Row>{/if}
  {/if}
</Group>

<Group caption="Папка плагинов" note="API {API_VERSION} · приложение {APP_VERSION}">
  <Row label="Плагины из папки" hint="Папка плагина — manifest.json и main.js; права защищают от ошибок, но не от намеренно вредного кода">
    <Button small onclick={folder}>Открыть папку</Button>
    <Button small disabled={reloading} onclick={reload}>Перезагрузить</Button>
  </Row>
</Group>

{#if menu}<Menu x={menu.x} y={menu.y} width={220} items={menu.items} label="Плагин" onclose={() => (menu = null)} />{/if}
{#if linking}<PluginLinkSheet onclose={() => (linking = false)} />{/if}
{#if installing}<PluginInstallSheet e={installing.e} m={installing.m} onclose={() => (installing = null)} />{/if}
<PluginRemoveSheet />

<style>
  .tools { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .search { flex: 1; height: 32px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 10px; border-radius: 8px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink3); }
  .search:focus-within { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .search input { flex: 1; min-width: 0; padding: 0; border: 0; outline: none; background: none; color: var(--ink); font: 13px var(--ui); caret-color: var(--lamp); -webkit-user-select: text; user-select: text; }
  .pl { position: relative; display: flex; align-items: center; gap: 12px; min-height: 54px; box-sizing: border-box; padding: 8px 16px; }
  .pl + .pl, .pl + :global(.row), :global(.row) + .pl { border-top: 1px solid var(--rule); }
  .ib { flex: 0 0 30px; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--plug) 14%, transparent); color: var(--plug); }
  .tx { flex: 1; min-width: 0; }
  .nm { display: flex; align-items: baseline; gap: 8px; }
  .nm b { font-size: 13.5px; font-weight: 600; }
  .ver { font-size: 12px; color: var(--ink3); }
  .sub { font-size: 12px; color: var(--ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .why { font-size: 12px; color: var(--todo); }
  .warn { font-size: 12px; color: var(--wait); }
  .lnk { padding: 0; border: 0; background: none; color: var(--lampink); font: 12px var(--ui); }
  .stack { margin: 6px 0 0; max-height: 160px; overflow: auto; padding: 8px; border-radius: 6px; background: var(--chip); font: 11px/1.45 var(--mono); white-space: pre-wrap; }
  .dots { flex: 0 0 28px; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ink2); font-size: 16px; line-height: 1; }
  .dots:hover { background: var(--chip); }
  .dots:focus-visible { outline: 2px solid var(--lampline); outline-offset: 1px; }
  .prog { font-size: 12px; color: var(--ink3); font-variant-numeric: tabular-nums; }
  .bar { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--lamp); transition: width 0.2s; }
</style>
