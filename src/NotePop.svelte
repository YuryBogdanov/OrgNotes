<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from './store.svelte';
  import { notesOf } from './logbook';
  import { portal } from './portal';
  import type { NoteReq } from './noteReq.svelte';

  // «Добавить заметку…» (ТЗ 40 §3): a field «Новый статус», the heading's three last notes with their dates, «Запишется
  // в :LOGBOOK: с датой». ↩ writes the note (as Org's C-c C-z), ⇧↩ a new line, ⎋ or a click aside — closed.
  let { req, onclose }: { req: NoteReq; onclose: () => void } = $props();
  let text = $state('');
  let field: HTMLTextAreaElement | undefined = $state();
  let box: HTMLDivElement | undefined = $state();
  let busy = false;
  const file = $derived(store.files.find((f) => f.name === req.path || f.path === req.path));
  const heading = $derived(file?.headings.find((h) => h.line === req.line));
  const notes = $derived(file && heading ? notesOf(file.text.split('\n'), heading).slice(0, 3) : []);
  $effect(() => {
    if (!heading) onclose(); // the heading is gone (an edit on the disk)
  });
  onMount(() => {
    field?.focus();
    // kept on the screen
    const r = box?.getBoundingClientRect();
    if (box && r && r.right > innerWidth - 8) box.style.left = `${Math.max(8, innerWidth - 8 - r.width)}px`;
    if (box && r && r.bottom > innerHeight - 8) box.style.top = `${Math.max(8, req.y - r.height - 28)}px`;
    const away = (e: MouseEvent) => {
      if (!box?.contains(e.target as Node)) onclose();
    };
    setTimeout(() => document.addEventListener('mousedown', away, true));
    return () => document.removeEventListener('mousedown', away, true);
  });
  async function save() {
    const h = heading;
    if (!text.trim() || !h || !file || busy) return onclose();
    busy = true;
    const ref = { path: file.path, line: h.line, title: h.title };
    const note = text;
    onclose();
    await store.transaction('Заметка', (tx) => tx.addNote(ref, note));
  }
  function keydown(e: KeyboardEvent) {
    e.stopPropagation(); // the window's keys stay out while the field is open
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }
  // the field grows with its lines
  $effect(() => {
    void text;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight + 2, 140)}px`; // + the border: no scroll bar for one line
  });
  const MONTHS = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
  const pad = (n: number) => String(n).padStart(2, '0');
  function when(d: Date) {
    const now = new Date();
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86_400_000);
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (diff === 0) return `сегодня, ${time}`;
    if (diff === 1) return `вчера, ${time}`;
    return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
  }
  const bare = (t: string) => t.replace(/\[\[(?:[^\]]*\]\[)?([^\]]*)\]\]/g, '$1');
</script>

<div class="npop" use:portal bind:this={box} role="dialog" aria-label="Добавить заметку" style:left="{req.x}px" style:top="{req.y}px">
  {#if heading}<div class="title" title={bare(heading.title)}>{bare(heading.title)}</div>{/if}
  <div class="field">
    <textarea bind:this={field} bind:value={text} rows="1" placeholder="Новый статус" aria-label="Новый статус" onkeydown={keydown}></textarea>
  </div>
  <div class="list" aria-label="Последние заметки">
    {#each notes as n, i (i)}
      <div class="note"><span class="at">{when(n.at)}</span><span class="tx">{n.text || '—'}</span></div>
    {:else}
      <div class="none">Заметок пока нет</div>
    {/each}
  </div>
  <div class="foot"><span>Запишется в <code>:LOGBOOK:</code> с датой</span><span class="keys">↩ записать · ⇧↩ строка</span></div>
</div>

<style>
  .npop { position: fixed; z-index: 70; width: 380px; box-sizing: border-box; display: flex; flex-direction: column; background: var(--pop, var(--bg)); color: var(--fg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22); font: 13px var(--ui, -apple-system, system-ui, sans-serif); overflow: hidden; }
  .title { padding: 8px 10px 0; font-size: 11.5px; color: var(--fg3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .field { padding: 6px 8px 8px; border-bottom: 1px solid var(--line); }
  .field textarea { display: block; width: 100%; box-sizing: border-box; min-height: 28px; padding: 5px 8px; resize: none; border: 1px solid var(--line); border-radius: 6px; outline: none; background: var(--bg); color: var(--fg); font: 13px/1.4 var(--ui, -apple-system, system-ui, sans-serif); }
  .field textarea:focus { border-color: var(--acc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 22%, transparent); }
  .list { display: flex; flex-direction: column; gap: 2px; padding: 6px 4px; }
  .note { display: flex; gap: 10px; padding: 3px 6px; line-height: 1.4; }
  .at { flex: 0 0 88px; font-size: 11.5px; color: var(--fg3); font-variant-numeric: tabular-nums; padding-top: 1px; }
  .tx { flex: 1; min-width: 0; color: var(--fg2); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .none { padding: 3px 6px; color: var(--fg3); }
  .foot { display: flex; justify-content: space-between; gap: 8px; white-space: nowrap; padding: 6px 10px; border-top: 1px solid var(--line); font-size: 11px; color: var(--fg3); }
  .foot code { font: 11px var(--mono); }
  .keys { white-space: nowrap; }
</style>
