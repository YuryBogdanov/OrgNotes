<script lang="ts">
  import { store } from '../store.svelte';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';

  // The files' tree's sheets in the new interface (ТЗ 44 §4): «Переместить в Корзину?» (a folder — how many notes in
  // it) and «Переместить» to a folder of the notes (the entry's own folder marked, not its own subtree). As Dialogs of
  // the old one; renaming is a field in the tree.
  const d = $derived(store.dialog);
  const name = $derived(d ? d.rel.split('/').pop()!.replace(/\.org$/, '') : '');
  const inside = $derived(d && d.isDir ? store.files.filter((f) => f.name.startsWith(d.rel + '/')).length : 0);
  const targets = $derived.by(() => {
    if (!d || d.type !== 'move') return [] as { rel: string; label: string; depth: number; here: boolean }[];
    const parent = d.rel.includes('/') ? d.rel.slice(0, d.rel.lastIndexOf('/')) : '';
    return ['', ...[...store.folders].sort((a, b) => a.localeCompare(b, 'ru'))]
      .filter((r) => !(d.isDir && (r === d.rel || r.startsWith(d.rel + '/'))))
      .map((r) => ({ rel: r, label: r === '' ? (store.dir?.split('/').pop() ?? 'Корень') : r.split('/').pop()!, depth: r === '' ? 0 : r.split('/').length, here: r === parent }));
  });
  const close = () => (store.dialog = null);
</script>

{#if d?.type === 'delete'}
  <Sheet title="Переместить «{name}» в Корзину?" label="Удаление" role="alertdialog" oncancel={close}>
    <p>{d.isDir ? `Папка и все заметки в ней (${inside}) будут перемещены в Корзину. Их можно будет восстановить из Корзины.` : 'Файл будет перемещён в Корзину. Его можно будет восстановить из Корзины.'}</p>
    {#snippet foot()}
      <span style="flex:1"></span>
      <Button key="esc" onclick={close}>Отмена</Button>
      <Button kind="danger" autofocus onclick={() => store.deleteEntry(d.rel)}>Переместить в Корзину</Button>
    {/snippet}
  </Sheet>
{:else if d}
  <Sheet title="Переместить «{name}»" label="Перемещение" oncancel={close}>
    <div class="list" role="listbox" aria-label="Папка назначения">
      {#each targets as t (t.rel)}
        <button class="opt" role="option" aria-selected="false" disabled={t.here} style:padding-left="{10 + t.depth * 16}px" onclick={() => { const rel = d.rel; close(); store.moveEntry(rel, t.rel); }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.5 1.6H13c.7 0 1.2.5 1.2 1.2V12c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2z" /></svg>
          <span>{t.label}</span>{#if t.here}<span class="hint">текущая</span>{/if}
        </button>
      {/each}
    </div>
    {#snippet foot()}
      <span style="flex:1"></span>
      <Button key="esc" autofocus onclick={close}>Отмена</Button>
    {/snippet}
  </Sheet>
{/if}

<style>
  p { margin: 0; }
  .list { max-height: 300px; overflow: auto; display: flex; flex-direction: column; gap: 1px; }
  .opt { height: 30px; display: flex; align-items: center; gap: 8px; padding-right: 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: 13px var(--ui); text-align: left; }
  .opt svg { flex: 0 0 auto; color: var(--ink3); }
  .opt:hover:not(:disabled) { background: var(--lamp); color: var(--onlamp); }
  .opt:hover:not(:disabled) svg { color: var(--onlamp); }
  .opt:disabled { opacity: 0.5; }
  .hint { margin-left: auto; font-size: 11.5px; color: var(--ink3); }
</style>
