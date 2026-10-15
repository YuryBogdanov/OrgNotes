<script lang="ts">
  import Segmented from './Segmented.svelte';
  import { plugins, RIGHTS } from './api/host.svelte';
  import { parseManifest, incompatible, type Manifest } from './api/manifest';
  import { API_VERSION } from './api/index';
  import { APP_VERSION } from './api/declare';
  import { store } from './store.svelte';
  import { portal } from './portal';

  // «Установить плагин по ссылке» (ТЗ 37 §8): a git repository of the organisation (https or ssh, the keys of this
  // Mac) — «Проверить» reads its tags and the plugin in the newest one (or the default branch); its rights, whether
  // it fits; installed with its link kept for updates.
  let { onclose }: { onclose: () => void } = $props();

  interface Probe {
    refs: { head: string | null; tags: [string, string][]; branches: [string, string][] };
    ref: string;
    track: 'tag' | 'branch';
    commit: string;
    manifest: string;
  }
  async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
  }

  let url = $state('');
  let checked = $state('');
  let probing = $state(false);
  let error = $state<string | null>(null);
  let probe = $state<Probe | null>(null);
  let updates = $state(true);
  let busy = $state(false);
  const m = $derived.by((): Manifest | null => {
    if (!probe) return null;
    try {
      const r = parseManifest(JSON.parse(probe.manifest));
      return r.ok ? r.manifest : null;
    } catch {
      return null;
    }
  });
  const fits = $derived(m ? incompatible(m, API_VERSION, APP_VERSION) : null);
  const latestTag = $derived(probe?.refs.tags.find(([t]) => !t.includes('-'))?.[0] ?? null);
  const head = $derived(probe?.refs.head ?? null);
  const builtin = $derived(m ? plugins.entries.some((e) => e.builtin && e.manifest?.id === m.id) : false);

  async function check(ref?: string) {
    const u = url.trim();
    if (!u || probing) return;
    probing = true;
    error = null;
    if (!ref) probe = null;
    try {
      probe = await invoke<Probe>('git_probe', { url: u, ref: ref ?? null });
      checked = u;
      if (!m) error = 'manifest.json не разобран: проверьте его поля';
    } catch (err) {
      error = String(err);
      if (!ref) probe = null;
    } finally {
      probing = false;
    }
  }
  async function install() {
    if (!probe || !m || fits || busy || builtin) return;
    busy = true;
    try {
      await invoke('plugin_install_git', { url: checked, ref: probe.ref, track: probe.track, checkUpdates: updates });
      plugins.allow(m);
      await plugins.refreshInstalled();
      const section = m.contributes.settings.find((s) => s.section)?.section;
      store.note(`«${m.name}» установлен и включён · команды — в палитре`, section ? [{ label: 'Настройки плагина', run: () => store.showSection(section as never) }] : undefined, 6000);
      onclose();
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }
  function key(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      onclose();
    }
  }
</script>

<div class="layer" use:portal>
  <div class="scrim" aria-hidden="true"></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dlg" role="dialog" aria-modal="true" aria-label="Установка по ссылке" tabindex="-1" onkeydown={key}>
    <b class="t">Установить плагин по ссылке</b>
    <label class="fld">
      <span class="lb">Ссылка на git-репозиторий</span>
      <span class="in">
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={url} autofocus placeholder="https://git.company.local/team/panopticon-okr.git" spellcheck="false" aria-label="Ссылка на git-репозиторий"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void check(); } }} oninput={() => { if (probe && url.trim() !== checked) probe = null; }} />
        <button class="b" disabled={!url.trim() || probing} onclick={() => void check()}>{probing && !probe ? 'Проверяем…' : 'Проверить'}</button>
      </span>
      {#if error}<span class="err" role="alert">{error}</span>{:else}<span class="hint">HTTPS или SSH. Доступ — через git и ключи на этом Mac, как при обычном git clone.</span>{/if}
    </label>

    {#if probe && m}
      {#if latestTag || head}
        <div class="ver">
          <span class="lb">Версия</span>
          <Segmented label="Версия" size="large" disabled={probing} value={probe.ref} onchange={(r) => void check(r)}
            options={[...(latestTag ? [{ value: latestTag, label: `Последний тег · ${latestTag}` }] : []), ...(head ? [{ value: head, label: `Ветка ${head}` }] : [])]} />
        </div>
      {/if}
      <div class="found" aria-label="Найденный плагин">
        <span class="ib"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={m.icon ?? 'M4 4h12v12H4zM8 4v12M4 8h4'} /></svg></span>
        <div class="fi">
          <div class="fn"><b>{m.name}</b><span>v{m.version} · manifest.json найден</span></div>
          <span class="rights">Права: {#if m.permissions.length}{#each m.permissions as p, i (p)}{i ? ', ' : ''}<span class:net={p === 'net'}>{RIGHTS[p] ?? p}{p === 'net' && m.net.length ? `: ${m.net.join(', ')}` : ''}</span>{/each}{:else}никаких{/if}</span>
          {#if builtin}<span class="bad">id «{m.id}» занят встроенным плагином</span>{:else if fits}<span class="bad">{fits}</span>{:else}<span class="ok">Подходит вашей версии приложения</span>{/if}
        </div>
      </div>
      <label class="chk"><input type="checkbox" bind:checked={updates} /> Проверять обновления в этом репозитории</label>
      <p class="warn">Плагин не из каталога: его код никто, кроме автора, не смотрел. Ставьте плагины только из источников, которым доверяете.</p>
    {/if}
    <div class="row">
      <button class="b" onclick={onclose}>Отмена</button>
      <button class="b pri" disabled={!probe || !m || !!fits || builtin || busy || probing} onclick={() => void install()}>{busy ? 'Устанавливаем…' : 'Установить'}</button>
    </div>
  </div>
</div>

<style>
  .layer { color: var(--fg); font: 13px var(--ui, -apple-system, system-ui, sans-serif); }
  .scrim { position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, 0.3); }
  .dlg { position: fixed; z-index: 91; left: 50%; top: 120px; transform: translateX(-50%); width: min(520px, calc(100% - 32px)); box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; padding: 18px 20px 16px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45); outline: none; }
  .t { font-size: 15px; }
  .fld { display: flex; flex-direction: column; gap: 5px; }
  .lb { font-size: 12px; font-weight: 600; color: var(--fg2); }
  .in { display: flex; gap: 8px; }
  .in input { flex: 1; min-width: 0; height: 30px; box-sizing: border-box; padding: 0 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font: 12.5px var(--mono); outline: none; }
  .in input:focus { border: 2px solid var(--acc); padding: 0 8px; }
  .hint { font-size: 11.5px; color: var(--fg3); }
  .err { font-size: 12px; color: var(--todo); }
  .ver { display: flex; align-items: center; gap: 10px; }
  .found { display: flex; gap: 12px; padding: 12px; border-radius: 10px; background: var(--side); border: 1px solid var(--line); }
  .ib { flex: 0 0 34px; width: 34px; height: 34px; box-sizing: border-box; border-radius: 8px; background: var(--bg); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; }
  .fi { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
  .fn { display: flex; align-items: baseline; gap: 8px; }
  .fn b { font-size: 13.5px; }
  .fn span { font-size: 11.5px; color: var(--fg3); }
  .rights { color: var(--fg2); }
  .net { color: var(--wait); font-weight: 600; }
  .ok { color: var(--done); }
  .bad { color: var(--todo); }
  .chk { display: flex; align-items: center; gap: 8px; }
  .chk input { margin: 0; width: 15px; height: 15px; accent-color: var(--acc); }
  .warn { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--wait); }
  .row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .b { height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font-size: 13px; white-space: nowrap; }
  .b:disabled { opacity: 0.5; }
  .b.pri { border: 0; padding: 0 14px; background: var(--acc); color: var(--onacc); font-weight: 600; }
</style>
