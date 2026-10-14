<script lang="ts">
  import { plugins } from './api/host.svelte';
  import { API_VERSION } from './api/index';
  import { APP_VERSION, type Entry } from './api/declare';
  import { codeUrl, sourceLabel } from './api/sources';
  import { pluginUpdates as up } from './pluginUpdates.svelte';
  import { openExternal, store } from './store.svelte';
  import { catalog, type CatalogEntry, type CatState } from './pluginCatalog.svelte';
  import Catalog from './Catalog.svelte';
  import CatalogItem from './CatalogItem.svelte';
  import InstallSheet from './InstallSheet.svelte';
  import type { Manifest } from './api/manifest';
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
  // «…» of an installed plugin; «Удалить…» asks first
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let removing = $state<Entry | null>(null);
  function more(ev: MouseEvent, e: Entry) {
    const id = idOf(e);
    const code = codeUrl(e.source);
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    menu = {
      x: r.right - 320, // the sheet clips what goes past its edge
      y: r.bottom + 4,
      items: [
        ...(code ? [{ label: 'Исходный код ↗', detail: code.replace(/^https:\/\//, ''), action: () => void openExternal(code) }] : []),
        ...(e.source && (e.source.kind === 'catalog' || e.source.checkUpdates) ? [{ label: 'Проверить обновления', action: () => void up.checkPlugin(id) }] : []),
        { label: 'Удалить…', danger: true, action: () => (removing = e) },
      ],
    };
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
        {#if m?.icon}<svg class="ic" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={m.icon} /></svg>{/if}
        <b>{m?.name ?? e.dir}</b>
        {#if m}<span class="ver">{m.version}</span>{/if}
        {#if e.builtin}<span class="tag">встроенный</span>{:else}<span class="src" title={e.source?.kind === 'git' ? e.source.url : ''}>{sourceLabel(e.source)}</span>{/if}
      </span>
      {#if u}
        <button class="upd" disabled={!!busy} onclick={() => void up.update(id)}>{busy === 'update' ? 'Обновляем…' : `Обновить · ${u.version}`}</button>
      {/if}
      {#if !e.builtin}
        <button class="dots" aria-label="Ещё: {m?.name ?? e.dir}" disabled={!!busy} onclick={(ev) => more(ev, e)}>{busy === 'check' ? '…' : '•••'}</button>
      {/if}
      <button class="switch" role="switch" aria-checked={e.enabled} aria-label="Плагин {m?.name ?? e.dir}" disabled={!m || (!e.enabled && e.problems.length > 0)}
        onclick={() => void plugins.setEnabled(id, !e.enabled)}><span></span></button>
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
      <Catalog back={() => (page = 'list')} open={(e) => (page = e)} {act} />
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
      <button class="change" onclick={folder}>Открыть папку плагинов</button>
      <button class="change pri" onclick={() => (page = 'catalog')}>Каталог плагинов…</button>
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
      <button class="change" disabled={busy} onclick={reload}>Перезагрузить плагины</button>
      <span class="ver2">API {API_VERSION} · приложение {APP_VERSION}</span>
    </div>
    <p class="help">Плагин работает внутри приложения: права защищают от ошибок, но не от намеренно вредного кода. Включайте плагины только из источников, которым доверяете. Какие плагины включены — хранится на этом Mac.</p>
  </section>
  {/if}
</div>
{#if installing}<InstallSheet e={installing.e} m={installing.m} onclose={() => (installing = null)} />{/if}
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
{#if removing}
  {@const m = removing.manifest}
  <div class="layer" use:portal>
  <div class="scrim" aria-hidden="true"></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Удаление плагина" tabindex="-1"
    onkeydown={(ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); removing = null; } }}>
    <b>Удалить «{m?.name ?? removing.dir}»?</b>
    <p>Папка плагина уйдёт в Корзину. Его данные в заметках и настройки останутся — после новой установки он их найдёт.</p>
    <div class="row">
      <button class="change" onclick={() => (removing = null)}>Отмена</button>
      <!-- svelte-ignore a11y_autofocus -->
      <button class="change danger" autofocus onclick={() => { const id = idOf(removing!); removing = null; void up.remove(id); }}>Удалить</button>
    </div>
  </div>
  </div>
{/if}

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
  .change { height: 26px; padding: 0 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; }
  .change:disabled { opacity: 0.5; }
  .change.pri { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .more.inline { margin: 0; font-size: inherit; }
  .bar { display: flex; align-items: center; gap: 8px; }
  .find { flex: 1; display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border-radius: 6px; background: var(--field); color: var(--fg3); }
  .find input { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--fg); font-size: 12.5px; }
  .cap span { font-weight: 400; letter-spacing: 0; color: var(--fg3); }
  .cap .more { float: right; font-weight: 400; letter-spacing: 0; }
  .ic { flex: 0 0 auto; align-self: center; color: var(--fg2); }
  .src { font-size: 11.5px; color: var(--fg3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .upd { height: 24px; padding: 0 10px; border: 1px solid var(--acc); border-radius: 6px; background: transparent; color: var(--acc); font-size: 12px; white-space: nowrap; }
  .dots { height: 24px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); font-size: 10px; letter-spacing: 1px; }
  .dots:hover { background: var(--field); }
  .layer { color: var(--fg); }
  .scrim { position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, 0.3); }
  .dlg { position: fixed; z-index: 91; left: 50%; top: 30%; transform: translateX(-50%); width: min(400px, calc(100% - 32px)); display: flex; flex-direction: column; gap: 8px; padding: 18px 20px 16px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35); font-size: 13px; outline: none; }
  .dlg p { margin: 0; color: var(--fg2); line-height: 1.45; }
  .dlg .row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  .danger { background: var(--todo); border-color: var(--todo); color: #fff; }
  .ver2 { margin-left: auto; font: 11.5px var(--mono); color: var(--fg3); }
  code { font-family: var(--mono); }
  .switch { flex: 0 0 auto; position: relative; width: 32px; height: 18px; padding: 0; border: 0; border-radius: 9px; background: var(--field); box-shadow: inset 0 0 0 1px var(--line); transition: background 0.15s; }
  .switch span { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 7px; background: var(--onpacc); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
  .switch[aria-checked='true'] { background: var(--acc); box-shadow: none; }
  .switch[aria-checked='true'] span { transform: translateX(14px); }
  .switch:disabled { opacity: 0.45; }
</style>
