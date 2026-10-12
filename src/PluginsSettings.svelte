<script lang="ts">
  import { plugins } from './api/host.svelte';
  import { API_VERSION } from './api/index';
  import { APP_VERSION, type Entry } from './api/declare';

  // «Настройки → Плагины» (ТЗ 26 §7, roadmap 1.2): the built-in plugins and the installed ones, each on or off at
  // once; why one cannot be turned on; what a plugin is allowed; the folder of the plugins and «Перезагрузить».
  const PERM: Record<string, string> = {
    'index.read': 'Чтение заметок', 'files.read': 'Чтение файлов', 'files.edit': 'Правка заметок',
    clipboard: 'Буфер обмена', net: 'Сеть', process: 'Процессы',
  };
  const builtin = $derived(plugins.entries.filter((e) => e.builtin));
  const installed = $derived(plugins.entries.filter((e) => !e.builtin));
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
  <div class="pl" role="group" aria-label={m?.name ?? e.dir}>
    <div class="top">
      <span class="nm">
        <b>{m?.name ?? e.dir}</b>
        {#if m}<span class="ver">{m.version}</span>{/if}
        {#if e.builtin}<span class="tag">встроенный</span>{/if}
      </span>
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
  <section class="general" aria-label="Плагины">
    <div class="cap">ВСТРОЕННЫЕ</div>
    <div class="list">{#each builtin as e (e.dir)}{@render row(e)}{/each}</div>
    <div class="cap">УСТАНОВЛЕННЫЕ</div>
    {#if installed.length}
      <div class="list">{#each installed as e (e.dir)}{@render row(e)}{/each}</div>
    {:else}
      <p class="help">Плагинов пока нет. Положите папку плагина — <code>manifest.json</code> и <code>main.js</code> — в папку плагинов и нажмите «Перезагрузить плагины». Новый плагин появляется выключенным.</p>
    {/if}
    <div class="acts">
      <button class="change" onclick={folder}>Открыть папку плагинов</button>
      <button class="change" disabled={busy} onclick={reload}>Перезагрузить плагины</button>
      <span class="ver2">API {API_VERSION} · приложение {APP_VERSION}</span>
    </div>
    <p class="help">Плагин работает внутри приложения: права защищают от ошибок, но не от намеренно вредного кода. Включайте плагины только из источников, которым доверяете. Какие плагины включены — хранится на этом Mac.</p>
  </section>
</div>

<style>
  .body { flex: 1; min-height: 0; display: flex; }
  section { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 24px; display: flex; flex-direction: column; gap: 14px; }
  section > * { flex-shrink: 0; }
  .general { max-width: 760px; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--fg2); padding: 0 6px; }
  .help { font-size: 12px; line-height: 1.5; color: var(--fg2); padding: 4px 6px; margin: 0; }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .pl { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: var(--side); border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .nm { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
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
  .ver2 { margin-left: auto; font: 11.5px var(--mono); color: var(--fg3); }
  code { font-family: var(--mono); }
  .switch { flex: 0 0 auto; position: relative; width: 32px; height: 18px; padding: 0; border: 0; border-radius: 9px; background: var(--field); box-shadow: inset 0 0 0 1px var(--line); transition: background 0.15s; }
  .switch span { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 7px; background: var(--onpacc); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
  .switch[aria-checked='true'] { background: var(--acc); box-shadow: none; }
  .switch[aria-checked='true'] span { transform: translateX(14px); }
  .switch:disabled { opacity: 0.45; }
</style>
