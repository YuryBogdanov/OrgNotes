<script lang="ts">
  import { store, type Unsaved } from '../store.svelte';
  import { closeWords } from '../closeSheet';
  import { tabNames } from './tabNames';
  import { sheetKeys } from './sheetKeys';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';

  // «Сохранить изменения?» in the new interface (ТЗ 44 §4, ТЗ 10): the words of ТЗ 10; several tabs — rows of 30 pt
  // with a line above, the icon, the name as the tabs give it (§11), «изменён» / «новая заметка». «Не сохранять ⌘D»
  // left, «Отмена esc» and the main one right; the main one has the focus — nothing is lost by ↩.
  type Answer = 'save' | 'discard' | 'cancel';
  let { items = [], error, onanswer }: { items?: Unsaved[]; error?: { title: string; text: string }; onanswer: (a: Answer) => void } = $props();
  const names = $derived.by(() => {
    const files = items.filter((it) => it.kind === 'file');
    const ns = tabNames(files.map((it) => store.fileOf(it.tab)?.name ?? it.name));
    return new Map(files.map((it, i) => [it.tab.id, ns[i].hint ? `${ns[i].name} — ${ns[i].hint}` : ns[i].name]));
  });
  const nameOf = (it: Unsaved) => names.get(it.tab.id) ?? it.name;
  const words = $derived(closeWords(items.map((it) => ({ kind: it.kind, name: nameOf(it) })), error));
  let box: HTMLElement | undefined = $state();
  const key = sheetKeys(
    () => box,
    (e) => {
      if (e.key === 'Escape' || (e.metaKey && e.key === '.')) return (onanswer(error ? 'save' : 'cancel'), true);
      if (e.metaKey && e.code === 'KeyD' && !error) return (onanswer('discard'), true);
      return false;
    },
  );
</script>

<svelte:window onkeydowncapture={key} />
<Sheet title={words.title} label={words.title} role="alertdialog" oncancel={() => onanswer(error ? 'save' : 'cancel')}>
  <div class="in" bind:this={box}>
    <p>{words.text}</p>
    {#if items.length > 1}
      <ul class="list" aria-label="Несохранённые вкладки">
        {#each items as it (it.tab.id)}
          <li>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray={it.kind === 'note' ? '2 1.8' : undefined} aria-hidden="true"><path d="M3.5 2h6l3 3v9h-9z" /></svg>
            <span class="nm" class:note={it.kind === 'note'}>{nameOf(it)}</span>
            <span class="st">{it.kind === 'note' ? 'новая заметка' : 'изменён'}</span>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="foot">
      {#if !error}
        <Button kind="danger" key="⌘D" onclick={() => onanswer('discard')}>Не сохранять</Button>
        <span class="grow"></span>
        <Button key="esc" onclick={() => onanswer('cancel')}>Отмена</Button>
      {:else}
        <span class="grow"></span>
      {/if}
      <Button kind="main" key="↩" autofocus onclick={() => onanswer('save')}>{words.primary}</Button>
    </div>
  </div>
</Sheet>

<style>
  .in { display: flex; flex-direction: column; gap: 12px; }
  p { margin: 0; overflow-wrap: anywhere; }
  .list { list-style: none; margin: 0; padding: 0; max-height: calc(6 * 30px); overflow-y: auto; }
  .list li { height: 30px; display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--rule); color: var(--ink); }
  .list svg { flex: 0 0 auto; color: var(--ink3); }
  .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm.note { font-style: italic; }
  .st { flex: 0 0 auto; font-size: 12px; color: var(--ink3); }
  .foot { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .grow { flex: 1; }
</style>
