<script lang="ts">
  import { store } from '../store.svelte';
  import { otherViews } from './viewSwitch';

  // The view switch of a file (fix-49): at the file area's top right (14 pt down, 18 in), over what it shows — the
  // text, then the plugins' views (the board, a mindmap…) as icons, the one shown on `segon` in `lampink`; the title
  // tells the view and its key. Drawn by the host, the same over the text and over a plugin's view; none when the
  // file has no other view. The keys and «Показать как ›» stay.
  const tab = $derived(store.tab);
  const views = $derived(otherViews(tab));
  const shown = $derived(tab?.kind === 'file' ? store.viewOf(tab) : '');
  const key = (id: string | undefined) => (id ? store.keyHint(id) : '');
  /** The text («Исходник»): back from a view (a tab on one heading — its text at that heading). */
  function asText() {
    const t = store.tab;
    if (!t || !shown) return;
    if (t.scope) {
      t.reveal = { line: t.scope.line, n: Date.now(), focus: true };
      t.scope = undefined;
    }
    store.showAs(t, '');
  }
  const LINES = 'M3 4.5h12M3 8.5h12M3 12.5h8';
</script>

{#if views.length}
  <div class="vs" role="radiogroup" aria-label="Вид файла">
    <button role="radio" aria-checked={!shown} class:on={!shown} aria-label="Исходник" title="Исходник{views.length === 1 && key(views[0].key) ? ` · ${key(views[0].key)}` : ''}" onclick={asText}>
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d={LINES} /></svg>
    </button>
    {#each views as v (v.id)}
      <button role="radio" aria-checked={shown === v.id} class:on={shown === v.id} aria-label={v.title} title="{v.title}{key(v.key) ? ` ${key(v.key)}` : ''}"
        onclick={() => store.tab && store.showAs(store.tab, v.id)}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={v.icon} /></svg>
      </button>
    {/each}
  </div>
{/if}

<style>
  /* the popover of ТЗ 44: `card`, a `rule`, the shadow 0 6 18 10 %, radius 9, 3 inside; icons only, 32 × 26 */
  .vs { position: absolute; top: 14px; right: 18px; z-index: 6; display: flex; gap: 2px; padding: 3px; background: var(--card); border: 1px solid var(--rule); border-radius: 9px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1); }
  button { width: 32px; height: 26px; display: flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ink3); }
  button:hover:not(.on) { color: var(--ink2); background: var(--chip); }
  button.on { background: var(--segon); color: var(--lampink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
  button:focus-visible { outline: 2px solid var(--lampline); outline-offset: 1px; }
</style>
