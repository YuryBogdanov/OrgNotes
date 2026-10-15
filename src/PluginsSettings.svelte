<script lang="ts">
  import Switch from './Switch.svelte';
  import { plugins } from './api/host.svelte';
  import { API_VERSION } from './api/index';
  import { APP_VERSION, type Entry } from './api/declare';
  import { sourceLabel } from './api/sources';
  import { pluginUpdates as up } from './pluginUpdates.svelte';
  import { store } from './store.svelte';
  import { catalog, type CatalogEntry, type CatState } from './pluginCatalog.svelte';
  import Catalog from './Catalog.svelte';
  import CatalogItem from './CatalogItem.svelte';
  import InstallSheet from './InstallSheet.svelte';
  import UrlSheet from './UrlSheet.svelte';
  import { iconOf, type Manifest } from './api/manifest';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import { onMount } from 'svelte';
  import { portal } from './portal';

  // «Настройки → Плагины» (ТЗ 26 §7, roadmap 1.2): the built-in plugins and the installed ones, each on or off at
  // once; why one cannot be turned on; what a plugin is allowed; the folder of the plugins and «Перезагрузить».
  // ТЗ 37: where an installed one came from, its update, «…» — its code, a check, «Удалить…»; a search.
  const PERM: Record<string, string> = {
    'index.read': 'Чтение заметок', 'files.read': 'Чтение файлов', 'files.edit': 'Правка заметок',
    clipboard: 'Буфер обмена', net: 'Сеть', process: 'Процессы',
  };
  let query = $state('');
  const fits = (e: Entry) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const m = e.manifest;
    return [m?.name, m?.description, m?.author, e.dir].some((x) => x?.toLowerCase().includes(q));
  };
  const builtin = $derived(plugins.entries.filter((e) => e.builtin && fits(e)));
  const installed = $derived(plugins.entries.filter((e) => !e.builtin && fits(e)));
  const anyInstalled = $derived(plugins.entries.some((e) => !e.builtin));
  onMount(() => {
    void up.check();
  });
  // ТЗ 37: the catalog and a plugin's page inside this section («Плагины › Каталог» in the sheet's title)
  let page = $state<'list' | 'catalog' | CatalogEntry>('list');
  $effect(() => {
    store.settingsCrumb = page === 'list' ? null : page === 'catalog' ? 'Каталог' : `Каталог › ${page.name}`;
  });
  let installing = $state<{ e: CatalogEntry; m: Manifest } | null>(null);
  let linking = $state(false);
  /** The button of a plugin in the catalog: install (rights first), or update (other rights asked first). */
  async function act(e: CatalogEntry, st: CatState) {
    const m = await catalog.manifestOf(e);
    if (!m) return;
    if (st.kind === 'install') installing = { e, m };
    else if (st.kind === 'update') {
      const have = plugins.entry(e.id);
      if (have?.enabled && !plugins.sameRights(m) && !(await plugins.askRights(m, m.version))) return;
      void catalog.install(e, !!have?.enabled);
    }
  }
  // «⋯» of an installed plugin (fix of ТЗ 37 §1): its settings, a check, its page in the catalog, its folder, «Удалить
  // плагин…» (asks first)
  let menu = $state<{ x: number; y: number; items: MenuItem[]; dir: string } | null>(null);
  function more(ev: MouseEvent, e: Entry) {
    const id = idOf(e);
    const m = e.manifest;
    const sec = e.enabled ? m?.contributes.settings.find((x) => x.section)?.section : undefined;
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    menu = {
      dir: e.dir,
      x: r.right - 250,
      y: r.bottom + 4,
      items: [
        ...(sec ? [{ label: 'Настройки плагина', action: () => store.showSection(sec) }] : []),
        ...(e.source && (e.source.kind === 'catalog' || e.source.kind === 'git') ? [{ label: 'Проверить обновления', action: () => void up.checkPlugin(id) }] : []),
        ...(e.source?.kind === 'catalog' ? [{ label: 'Страница в каталоге', action: () => void openInCatalog(id) }] : []),
        { label: 'Показать в Finder', action: () => void up.reveal(e) },
        'sep' as const,
        { label: 'Удалить плагин…', danger: true, action: () => (up.removing = e) },
      ],
    };
  }
  /** «Страница в каталоге»: the catalog read first if it is not yet. */
  async function openInCatalog(id: string) {
    if (!catalog.list.length) await catalog.load();
    const c = catalog.list.find((x) => x.id === id);
    page = c ?? 'catalog';
  }
  let open = $state<string | null>(null); // «Подробнее» of a failed one
  let busy = $state(false);
  const idOf = (e: Entry) => e.manifest?.id ?? e.dir;
  async function reload() {
    busy = true;
    try {
      await plugins.reload();
    } finally {
      busy = false;
    }
  }
  async function folder() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_plugins_folder');
    } catch {
      /* in a browser there is no folder */
    }
  }
</script>

{#snippet row(e: Entry)}
  {@const m = e.manifest}
  {@const id = idOf(e)}
  {@const failed = plugins.failed.get(id)}
  {@const u = up.updates.get(id)}
  {@const busy = up.busy.get(id)}
  <div class="pl" role="group" aria-label={m?.name ?? e.dir}>
    <div class="top">
      <span class="nm">
        {#if m && iconOf(m)}<svg class="ic" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={iconOf(m)} /></svg>{/if}
        <b>{m?.name ?? e.dir}</b>
        {#if m}<span class="ver">{m.version}</span>{/if}
        {#if e.builtin}<span class="tag">встроенный</span>{:else}<span class="src" title={e.source?.kind === 'git' ? e.source.url : ''}>{sourceLabel(e.source)}</span>{/if}
      </span>
      {#if u}
        <button class="upd" disabled={!!busy} onclick={() => void up.update(id)}>{busy === 'update' ? 'Обновляем…' : `Обновить · ${u.version}`}</button>
      {/if}
      {#if e.enabled && m?.contributes.settings.some((x) => x.section)}
        {@const sec = m.contributes.settings.find((x) => x.section)!.section!}
        <button class="gear" title="Настройки плагина" aria-label="Настройки плагина {m.name}" onclick={() => store.showSection(sec)}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></svg>
        </button>
      {/if}
      {#if !e.builtin}
        <button class="dots" class:on={menu?.dir === e.dir} title="Ещё" aria-label="Ещё: {m?.name ?? e.dir}" aria-haspopup="menu" disabled={!!busy} onclick={(ev) => more(ev, e)}>{busy === 'check' ? '…' : '⋯'}</button>
      {/if}
      <Switch checked={e.enabled} label="Плагин {m?.name ?? e.dir}" disabled={!m || (!e.enabled && e.problems.length > 0)} onchange={() => void plugins.setEnabled(id, !e.enabled)} />
    </div>
    {#if m?.description}<p class="desc">{m.description}</p>{/if}
    {#if m && (m.author || m.permissions.length)}
      <div class="meta">
        {#if m.author}<span>{m.author}</span>{/if}
        {#each m.permissions as p (p)}<span class="perm">{PERM[p] ?? p}{p === 'net' && m.net.length ? ': ' + m.net.join(', ') : ''}</span>{/each}
      </div>
    {/if}
    {#each e.problems as p (p)}<p class="why" role="note">{p}</p>{/each}
    {#if up.errors.get(id)}<p class="warn" role="note">Обновления не проверены: {up.errors.get(id)}</p>{/if}
    {#each m?.warnings ?? [] as w (w)}<p class="warn">{w}</p>{/each}
    {#if plugins.untrusted.get(id)}<p class="warn" role="note">{plugins.untrusted.get(id)}</p>{/if}
    {#if failed && e.enabled}
      <p class="why" role="alert">Выключен после ошибки: {failed}
        <button class="more" aria-expanded={open === id} onclick={() => (open = open === id ? null : id)}>{open === id ? 'Скрыть' : 'Подробнее'}</button></p>
      {#if open === id}<pre class="stack">{plugins.stack.get(id)}</pre>{/if}
    {/if}
  </div>
{/snippet}

<div class="body">
  {#if page !== 'list'}
  <section class="general" aria-label={page === 'catalog' ? 'Каталог плагинов' : page.name}>
    {#if page === 'catalog'}
      <Catalog back={() => (page = 'list')} open={(e) => (page = e)} {act} link={() => (linking = true)} />
    {:else}
      {#key page.id}<CatalogItem e={page} back={() => (page = 'catalog')} {act} />{/key}
    {/if}
  </section>
  {:else}
  <section class="general" aria-label="Плагины">
    <div class="bar">
      <label class="find">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
        <input bind:value={query} placeholder="Найти плагин" aria-label="Найти плагин" spellcheck="false" />
      </label>
      <button class="btn" onclick={folder}>Открыть папку плагинов</button>
      <button class="btn pri" onclick={() => (page = 'catalog')}>Каталог плагинов…</button>
    </div>
    {#if builtin.length}
      <div class="cap">ВСТРОЕННЫЕ <span>— идут с приложением</span></div>
      <div class="list">{#each builtin as e (e.dir)}{@render row(e)}{/each}</div>
    {/if}
    <div class="cap">УСТАНОВЛЕННЫЕ <span>— из папки плагинов</span>
      {#if anyInstalled}<button class="more" disabled={up.checking} onclick={() => void up.check(true)}>{up.checking ? 'проверяем…' : '↻ Проверить обновления'}</button>{/if}
    </div>
    {#if installed.length}
      <div class="list">{#each installed as e (e.dir)}{@render row(e)}{/each}</div>
    {:else if query.trim() && anyInstalled}
      <p class="help">Ничего не найдено</p>
    {:else}
      <p class="help">Плагинов пока нет — откройте <button class="more inline" onclick={() => (page = 'catalog')}>каталог</button> или положите папку плагина (<code>manifest.json</code> и <code>main.js</code>) в папку плагинов и нажмите «Перезагрузить плагины».</p>
    {/if}
    <div class="acts">
      <button class="btn" disabled={busy} onclick={reload}>Перезагрузить плагины</button>
      <span class="ver2">API {API_VERSION} · приложение {APP_VERSION}</span>
    </div>
    <p class="help">Плагин работает внутри приложения: права защищают от ошибок, но не от намеренно вредного кода. Включайте плагины только из источников, которым доверяете. Какие плагины включены — хранится на этом Mac.</p>
  </section>
  {/if}
</div>
{#if linking}<UrlSheet onclose={() => (linking = false)} />{/if}
{#if installing}<InstallSheet e={installing.e} m={installing.m} onclose={() => (installing = null)} />{/if}
<!-- to <body>: the sheet (a transform) would clip the menu at its edge and shift it -->
{#if menu}<div use:portal><ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} /></div>{/if}

<style>
  .body { flex: 1; min-height: 0; display: flex; }
  section { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 24px; display: flex; flex-direction: column; gap: 14px; }
  section > * { flex-shrink: 0; }
  .general { max-width: 760px; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--fg2); padding: 0 6px; }
  .help { font-size: 12px; line-height: 1.5; color: var(--fg2); padding: 4px 6px; margin: 0; }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .pl { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: var(--side); border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
  .top { display: flex; align-items: center; gap: 10px; }
  .nm { flex: 1; display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .ver { font: 11.5px var(--mono); color: var(--fg3); }
  .tag { font-size: 11px; padding: 0 6px; border-radius: 4px; background: var(--field); color: var(--fg2); }
  .desc { margin: 0; color: var(--fg2); font-size: 12.5px; line-height: 1.45; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11.5px; color: var(--fg2); }
  .perm { padding: 0 6px; border-radius: 4px; border: 1px solid var(--line); }
  .why { margin: 0; font-size: 12px; color: var(--todo); }
  .warn { margin: 0; font-size: 12px; color: var(--wait); }
  .more { margin-left: 6px; padding: 0; border: 0; background: none; color: var(--acc); font-size: 12px; }
  .stack { margin: 0; max-height: 160px; overflow: auto; padding: 8px; border-radius: 6px; background: var(--bg); border: 1px solid var(--line); font: 11px/1.45 var(--mono); white-space: pre-wrap; }
  .acts { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .btn { height: 26px; } /* the plugins' bar: as tall as its search */
  .more.inline { margin: 0; font-size: inherit; }
  .bar { display: flex; align-items: center; gap: 8px; }
  .find { flex: 1; display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border-radius: 6px; background: var(--field); color: var(--fg3); }
  .find input { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--fg); font-size: 12.5px; }
  .cap span { font-weight: 400; letter-spacing: 0; color: var(--fg3); }
  .cap .more { float: right; font-weight: 400; letter-spacing: 0; }
  .ic { flex: 0 0 auto; align-self: center; color: var(--fg2); }
  .src { font-size: 11.5px; color: var(--fg3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .upd { height: 24px; padding: 0 10px; border: 1px solid var(--acc); border-radius: 6px; background: transparent; color: var(--acc); font-size: 12px; white-space: nowrap; }
  .dots { flex: 0 0 28px; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); font-size: 16px; letter-spacing: 1px; line-height: 1; }
  .dots:hover, .dots.on, .gear:hover { background: var(--field); }
  .gear { height: 24px; width: 26px; padding: 0; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); }
  .ver2 { margin-left: auto; font: 11.5px var(--mono); color: var(--fg3); }
  code { font-family: var(--mono); }
</style>
