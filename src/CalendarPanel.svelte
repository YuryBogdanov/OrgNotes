<script lang="ts">
  import { store } from './store.svelte';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import { LAYERS, undated } from './calIndex';

  // The navigator in the «Календарь» mode (ТЗ 24): the layers shown, the files with dated entries, the open tasks
  // without a date. Both choices are kept on this Mac (the files per notes folder).
  const hidden = $derived(new Set(store.calHiddenNow));
  const files = $derived(store.calFiles);
  const tasks = $derived(undated(store.files.filter((f) => !hidden.has(f.name))));
  const base = (n: string) => n.split('/').pop()!.replace(/\.org$/, '');
  const wfOf = (path: string) => store.files.find((f) => f.path === path)?.wf;
</script>

<nav class="calnav" aria-label="Календарь: слои и файлы">
  <div class="cap">ПОКАЗЫВАТЬ</div>
  {#each LAYERS as l (l.id)}
    <label class="ck">
      <input type="checkbox" checked={store.calLayers.includes(l.id)} onchange={(e) => store.setCalLayer(l.id, e.currentTarget.checked)} />
      <span class="nm">{l.name}</span>
      <span class="dot" style="background:{l.color}" aria-hidden="true"></span>
    </label>
  {/each}
  <div class="cap">ФАЙЛЫ</div>
  {#each files as f (f.path)}
    <label class="ck" title={f.name}>
      <input type="checkbox" checked={!hidden.has(f.name)} onchange={(e) => store.setCalFile(f.name, e.currentTarget.checked)} />
      <span class="nm">{base(f.name)}</span>
    </label>
  {:else}
    <p class="hint">Дат в файлах пока нет.</p>
  {/each}
  <div class="cap">БЕЗ ДАТЫ</div>
  {#each tasks as t (t.path + t.line)}
    <button class="ud" title="{t.title} — {base(t.file)}" onclick={() => store.openCalEntry(t)}>
      <span class="kw tone-chip" style={wfOf(t.path) ? toneStyle(toneFor(t.keyword, wfOf(t.path)!)) : ''}>{t.keyword}</span>
      <span class="t">{t.priority ? `[#${t.priority}] ` : ''}{t.title}</span>
    </button>
  {:else}
    <p class="hint">Все открытые задачи с датой.</p>
  {/each}
</nav>

<style>
  .calnav { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 2px; padding: 12px 12px 16px; }
  .cap { padding: 12px 4px 4px; font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .cap:first-child { padding-top: 0; }
  .ck { display: flex; align-items: center; gap: 9px; height: 26px; padding: 0 4px; font-size: 13px; }
  .ck input { width: 15px; height: 15px; margin: 0; accent-color: var(--acc); }
  .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 4px; }
  .ud { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 4px 8px; margin-top: 4px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); text-align: left; }
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hint { margin: 0; padding: 2px 4px; font-size: 11.5px; color: var(--fg2); }
</style>
