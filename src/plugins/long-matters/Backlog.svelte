<script lang="ts">
  import { onMount } from 'svelte';
  import { long } from './state.svelte';
  import { readSettings } from './long';

  // «Настройки → Долгие дела → Статусы бэклога» (fix #315): the open states of every set of «Статусы», by set, as
  // chips; the ones chosen are the backlog — matters in them are not watched. None chosen by default. A state chosen
  // that no set has any more stays, marked «нет в статусах».
  let { ctrl }: { ctrl: { value(): unknown; set(v: unknown): void; onChange(fn: () => void): () => void } } = $props();
  const read = () => readSettings({ backlog: ctrl.value() ?? undefined }).backlog;
  let chosen = $state<string[]>(read());
  onMount(() => ctrl.onChange(() => (chosen = read())));
  const known = $derived(new Set(long.statusSets.flatMap((s) => s.open)));
  const gone = $derived(chosen.filter((x) => !known.has(x)));
  function toggle(s: string) {
    chosen = chosen.includes(s) ? chosen.filter((x) => x !== s) : [...chosen, s];
    ctrl.set(chosen);
  }
</script>

<div class="lm-bl">
  {#each long.statusSets as set (set.name)}
    <div class="set">
      <span class="nm">{set.name}</span>
      <span class="chips">
        {#each set.open as s (s)}
          <button type="button" class="chip" class:on={chosen.includes(s)} aria-pressed={chosen.includes(s)} onclick={() => toggle(s)}>{s}</button>
        {/each}
      </span>
    </div>
  {:else}
    <p class="none">Статусы папки ещё читаются…</p>
  {/each}
  {#if gone.length}
    <div class="set">
      <span class="nm">нет в статусах</span>
      <span class="chips">{#each gone as s (s)}<button type="button" class="chip on gone" aria-pressed="true" onclick={() => toggle(s)}>{s}</button>{/each}</span>
    </div>
  {/if}
</div>

<style>
  .lm-bl { display: flex; flex-direction: column; gap: 8px; }
  .set { display: flex; align-items: baseline; gap: 10px; }
  .nm { flex: 0 0 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: var(--ink3, var(--fg3)); }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip { height: 22px; padding: 0 8px; border: 0; border-radius: 5px; background: var(--chip2, var(--field)); color: var(--ink2, var(--fg2)); font: 600 11px var(--ui); letter-spacing: 0.02em; }
  .chip.on { background: var(--lampsoft, var(--sel)); color: var(--lampink, var(--acc)); box-shadow: inset 0 0 0 1px var(--lampline, var(--acc)); }
  .chip.gone { text-decoration: line-through; }
  .chip:focus-visible { outline: 2px solid var(--lampline, var(--acc)); outline-offset: 1px; }
  .none { margin: 0; font-size: 12px; color: var(--ink3, var(--fg3)); }
</style>
