<script lang="ts">
  import { store } from './store.svelte';

  const d = $derived(store.dialog);
  const name = $derived(d ? d.rel.split('/').pop()!.replace(/\.org$/, '') : '');
  const inside = $derived(d && d.isDir ? store.files.filter((f) => f.name.startsWith(d.rel + '/')).length : 0);

  // destinations for "move": root + every folder, minus the entry itself and its own subtree
  const targets = $derived.by(() => {
    if (!d || d.type !== 'move') return [] as { rel: string; label: string; depth: number; disabled: boolean }[];
    const parent = d.rel.includes('/') ? d.rel.slice(0, d.rel.lastIndexOf('/')) : '';
    const all = ['', ...[...store.folders].sort((a, b) => a.localeCompare(b, 'ru'))];
    return all
      .filter((r) => !(d.isDir && (r === d.rel || r.startsWith(d.rel + '/'))))
      .map((r) => ({
        rel: r,
        label: r === '' ? (store.dir?.split('/').pop() ?? 'Корень') : r.split('/').pop()!,
        depth: r === '' ? 0 : r.split('/').length,
        disabled: r === parent,
      }));
  });

  function key(e: KeyboardEvent) {
    if (d && e.key === 'Escape') store.dialog = null;
  }
</script>

<svelte:window onkeydown={key} />

{#if d}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" onmousedown={() => (store.dialog = null)}>
    <div class="dlg" role="dialog" aria-modal="true" aria-label={d.type === 'delete' ? 'Удаление' : 'Перемещение'} onmousedown={(e) => e.stopPropagation()}>
      {#if d.type === 'delete'}
        <h2>Переместить «{name}» в Корзину?</h2>
        <p>
          {#if d.isDir}
            Папка и все заметки в ней ({inside}) будут перемещены в Корзину. Их можно будет восстановить из Корзины.
          {:else}
            Файл будет перемещён в Корзину. Его можно будет восстановить из Корзины.
          {/if}
        </p>
        <div class="btns">
          <button onclick={() => (store.dialog = null)}>Отмена</button>
          <button class="danger" onclick={() => store.deleteEntry(d.rel)}>Переместить в Корзину</button>
        </div>
      {:else}
        <h2>Переместить «{name}»</h2>
        <div class="list" role="listbox" aria-label="Папка назначения">
          {#each targets as t}
            <button class="opt" role="option" aria-selected="false" disabled={t.disabled} style="padding-left:{10 + t.depth * 16}px"
              onclick={() => { const rel = d.rel; store.dialog = null; store.moveEntry(rel, t.rel); }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-linejoin="round"><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" /></svg>
              {t.label}
              {#if t.disabled}<span class="hint">текущая</span>{/if}
            </button>
          {/each}
        </div>
        <div class="btns"><button onclick={() => (store.dialog = null)}>Отмена</button></div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 80; display: flex; align-items: flex-start; justify-content: center; padding-top: 14vh; background: rgba(0, 0, 0, 0.25); }
  .dlg { width: 380px; max-width: calc(100vw - 32px); padding: 18px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35); }
  h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  p { margin: 0 0 14px; color: var(--fg2); line-height: 1.45; }
  .list { max-height: 280px; overflow: auto; margin: 6px 0 14px; padding: 4px; border: 1px solid var(--line); border-radius: 8px; }
  .opt { display: flex; align-items: center; gap: 8px; width: 100%; height: 28px; border: 0; background: transparent; text-align: left; border-radius: 6px; padding-right: 8px; }
  .opt:hover:not(:disabled) { background: var(--sel); }
  .opt:disabled { opacity: 0.5; }
  .hint { margin-left: auto; font-size: 11px; color: var(--fg3); }
  .btns { display: flex; justify-content: flex-end; gap: 8px; }
  .btns button { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--field); }
  .btns .danger { background: var(--danger); color: var(--on-danger); font-weight: 600; }
</style>
