<script lang="ts">
  import { plugins, RIGHTS } from './api/host.svelte';
  import { sourceLabel } from './api/sources';
  import { store } from './store.svelte';
  import { iconOf } from './api/manifest';

  // The head of a plugin's own settings section (mockup «Настройки — плагин»): back to «Плагины», what the plugin is,
  // on or off, what it may do; its shortcuts in «Клавиши».
  let { id }: { id: string } = $props();
  const e = $derived(plugins.entry(id));
  const m = $derived(e?.manifest);
</script>

{#if e && m}
  <div class="ph" role="group" aria-label="Плагин «{m.name}»">
    <button class="back" onclick={() => store.showSection('Плагины')}>‹ Плагины</button>
    <div class="row">
      <span class="ib"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={iconOf(m) ?? 'M7 3v4M13 3v4M5 7h10v3a5 5 0 0 1-10 0zM10 15v2.5'} /></svg></span>
      <div class="tx">
        <div class="nm"><b>{m.name}</b><span>{[m.version, e.builtin ? 'Panopticon' : m.author || sourceLabel(e.source)].filter(Boolean).join(' · ')}</span></div>
        {#if m.description}<div class="ds">{m.description}</div>{/if}
      </div>
      <button class="switch" role="switch" aria-checked={e.enabled} aria-label="Плагин {m.name}" disabled={!e.enabled && e.problems.length > 0} onclick={() => void plugins.setEnabled(id, !e.enabled)}><span></span></button>
    </div>
    <div class="meta">
      <span>Права: {m.permissions.length ? m.permissions.map((p) => (p === 'net' && m.net.length ? `${RIGHTS.net}: ${m.net.join(', ')}` : (RIGHTS[p] ?? p))).join(', ') : 'только свои настройки'}</span>
      {#if m.contributes.commands.length}<button class="lnk" onclick={() => store.showSection('Клавиши')}>Сочетания плагина ›</button>{/if}
    </div>
  </div>
{/if}

<style>
  .ph { display: flex; flex-direction: column; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
  .back, .lnk { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--acc); font-size: 12.5px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .ib { flex: 0 0 40px; width: 40px; height: 40px; box-sizing: border-box; border-radius: 9px; background: var(--side); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; color: var(--fg); }
  .tx { flex: 1; min-width: 0; }
  .nm { display: flex; align-items: baseline; gap: 8px; }
  .nm b { font-size: 17px; }
  .nm span { font-size: 12px; color: var(--fg3); }
  .ds { font-size: 12.5px; color: var(--fg2); margin-top: 2px; }
  .meta { display: flex; align-items: baseline; gap: 12px; font-size: 12px; color: var(--fg2); }
  .meta .lnk { margin-left: auto; font-size: 12px; }
  .switch { flex: 0 0 auto; position: relative; width: 32px; height: 18px; padding: 0; border: 0; border-radius: 9px; background: var(--field); box-shadow: inset 0 0 0 1px var(--line); transition: background 0.15s; }
  .switch span { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 7px; background: var(--onpacc, #fff); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
  .switch[aria-checked='true'] { background: var(--acc); box-shadow: none; }
  .switch[aria-checked='true'] span { transform: translateX(14px); }
  .switch:disabled { opacity: 0.45; }
</style>
