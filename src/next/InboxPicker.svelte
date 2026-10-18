<script lang="ts">
  import { store } from '../store.svelte';
  import { isOrgName } from '../fileTypes.svelte';
  import { isArchive } from '../names';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';
  import Field from './ui/Field.svelte';

  // «Куда складывать входящие?» (ТЗ 48 §4, ТЗ 01 §2): the sheet of ТЗ 44, 460 pt — when the Inbox's file is not
  // chosen or not found. «Найти файл…», the org files in rows of 32 pt (the icon, the path from the folder, the number
  // of headings grey), the one chosen on `lamp`; «+ Создать inbox.org в корне папки» while there is none; «Отмена esc»,
  // «Выбрать ↩». ↑↓ go over the rows.
  let { onclose }: { onclose: () => void } = $props();
  let q = $state('');
  let cur = $state(0);
  const files = $derived(
    store.files
      .filter((f) => isOrgName(f.name) && !isArchive(f.name))
      .filter((f) => !q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => Number(b.name === 'inbox.org') - Number(a.name === 'inbox.org') || a.name.localeCompare(b.name, 'ru')),
  );
  const canCreate = $derived(!store.files.some((f) => f.name === 'inbox.org'));
  $effect(() => {
    void q;
    cur = 0;
  });
  async function pick() {
    const f = files[cur];
    if (!f) return;
    onclose();
    await store.setInbox({ file: f.name });
  }
  async function create() {
    onclose();
    await store.createInboxFile();
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cur = Math.max(0, Math.min(files.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
      queueMicrotask(() => document.querySelector('.ipick .row.on')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void pick();
    }
  }
  const nameOf = (n: string) => n.replace(/\.org$/, '');
</script>

<Sheet title="Куда складывать входящие?" width={460} oncancel={onclose}>
  <div class="ipick">
    <p>Быстрая запись ⇧⌘I и разбор работают с одним файлом. Его можно сменить в настройках Inbox.</p>
    <Field bind:value={q} label="Найти файл" placeholder="Найти файл…" autofocus onkeydown={key} />
    <div class="list" role="listbox" aria-label="Файлы">
      {#each files as f, i (f.path)}
        <button class="row" class:on={i === cur} role="option" aria-selected={i === cur} onclick={() => (cur = i)} ondblclick={() => void pick()}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
          <span class="nm">{nameOf(f.name)}</span><span class="n">{f.headings.length}</span>
        </button>
      {:else}
        <p class="none">Таких файлов нет</p>
      {/each}
    </div>
    {#if canCreate}<button class="create" onclick={() => void create()}>+ Создать inbox.org в корне папки</button>{/if}
  </div>
  {#snippet foot()}
    <span style="flex:1"></span>
    <Button key="esc" onclick={onclose}>Отмена</Button>
    <Button kind="main" key="↩" disabled={!files.length} onclick={() => void pick()}>Выбрать</Button>
  {/snippet}
</Sheet>

<style>
  .ipick { display: flex; flex-direction: column; gap: 10px; }
  p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--ink2); }
  .list { max-height: 260px; overflow: auto; display: flex; flex-direction: column; gap: 1px; scrollbar-width: none; }
  .row { flex: 0 0 32px; display: flex; align-items: center; gap: 9px; padding: 0 10px; border: 0; border-radius: 7px; background: none; color: var(--ink); font: 13px var(--ui); text-align: left; }
  .row svg { flex: 0 0 auto; color: var(--ink3); }
  .row:hover { background: var(--chip); }
  .row.on { background: var(--lamp); color: var(--onlamp); }
  .row.on svg, .row.on .n { color: var(--onlamp); }
  .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n { font-size: 11.5px; color: var(--ink3); font-variant-numeric: tabular-nums; }
  .none { color: var(--ink3); }
  .create { align-self: flex-start; padding: 4px 2px; border: 0; background: none; color: var(--lampink); font: 13px var(--ui); }
</style>
