<script lang="ts">
  import Switch from './Switch.svelte';
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
      <Switch checked={e.enabled} label="Плагин {m.name}" disabled={!e.enabled && e.problems.length > 0} onchange={() => void plugins.setEnabled(id, !e.enabled)} />
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
</style>
