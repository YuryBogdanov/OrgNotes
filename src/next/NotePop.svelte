<script lang="ts">
  import { store } from '../store.svelte';
  import { notesOf } from '../logbook';
  import { toneFor } from '../org';
  import { toneStyle } from '../colors';
  import type { NoteReq } from '../noteReq.svelte';
  import Popover from './ui/Popover.svelte';

  // «Добавить заметку…» in the new interface (ТЗ 48 §2, ТЗ 40 §3), ⌃C ⌃Z: the popover of ТЗ 44, 440 pt, under the
  // heading's line (over it when there is no room below). «Заметка» and the heading — its status as a capsule, its
  // title `ink2`; the field in Cormorant 17 (the note is the file's text), `field`, `lampline` in focus, 1–5 lines;
  // the heading's two last notes (none — no block); the foot. ↩ writes and closes (an empty field — nothing), ⇧↩ a
  // line, ⎋ or a click aside — closed.
  let { req, onclose }: { req: NoteReq; onclose: () => void } = $props();
  let text = $state('');
  let field: HTMLTextAreaElement | undefined = $state();
  let el = $state<HTMLDivElement>();
  let busy = false;
  const file = $derived(store.files.find((f) => f.name === req.path || f.path === req.path));
  const heading = $derived(file?.headings.find((h) => h.line === req.line));
  const notes = $derived(file && heading ? notesOf(file.text.split('\n'), heading).slice(0, 2) : []);
  $effect(() => {
    if (!heading) onclose(); // the heading is gone (an edit on the disk)
  });
  // under the line; over it when the window has no room below
  // svelte-ignore state_referenced_locally
  let y = $state(req.y);
  $effect(() => {
    const node = el;
    if (!node) return;
    queueMicrotask(() => {
      const h = node.offsetHeight;
      if (req.y + h > innerHeight - 8) y = Math.max(8, req.y - h - 30);
      field?.focus();
    });
  });
  async function save() {
    const h = heading;
    if (!text.trim() || !h || !file || busy) return;
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
  // the field grows with its lines, to five
  $effect(() => {
    void text;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight + 2, 5 * 24 + 14)}px`;
  });
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const when = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
  const bare = (t: string) => t.replace(/\[\[(?:[^\]]*\]\[)?([^\]]*)\]\]/g, '$1');
  const cap = $derived(file && heading?.keyword ? toneStyle(toneFor(heading.keyword, file.wf)) : '');
</script>

<Popover x={req.x} {y} width={440} label="Добавить заметку" {onclose} bind:el>
  <div class="np">
    <div class="hd">
      <b>Заметка</b>
      {#if heading}
        {#if heading.keyword}<span class="capsule" style={cap}>{heading.keyword}</span>{/if}
        <span class="ti" title={bare(heading.title)}>{bare(heading.title)}</span>
      {/if}
    </div>
    <textarea bind:this={field} bind:value={text} rows="1" placeholder="Новый статус" aria-label="Новый статус" onkeydown={keydown}></textarea>
    {#if notes.length}
      <div class="list" aria-label="Последние заметки">
        {#each notes as n, i (i)}
          <div class="note"><span class="at">{when(n.at)}</span><span class="tx">{n.text || '—'}</span></div>
        {/each}
      </div>
    {/if}
    <div class="foot"><span>Запишется в :LOGBOOK: с датой</span><span>↩ записать · ⇧↩ строка · ⎋</span></div>
  </div>
</Popover>

<style>
  .np { width: 428px; max-width: 100%; display: flex; flex-direction: column; gap: 8px; padding: 6px 6px 4px; box-sizing: border-box; }
  .hd { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .hd b { flex: 0 0 auto; font-size: 13.5px; font-weight: 600; }
  .ti { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: var(--ink2); }
  .capsule { flex: 0 0 auto; display: inline-block; padding: 0 6px; border-radius: 4px; font: 700 10.5px/18px var(--ui); letter-spacing: 0.02em; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  textarea { display: block; width: 100%; box-sizing: border-box; min-height: 38px; padding: 6px 10px; resize: none; overflow-y: auto; border: 1px solid transparent; border-radius: 8px; outline: none; background: var(--field); color: var(--ink); font: 17px/24px var(--text); }
  textarea:focus { border-color: var(--lampline); }
  textarea::placeholder { color: var(--ink3); }
  .list { display: flex; flex-direction: column; gap: 4px; }
  .note { display: flex; align-items: baseline; gap: 10px; line-height: 1.4; }
  .at { flex: 0 0 52px; font: 10.5px var(--mono); color: var(--ink3); }
  .tx { flex: 1; min-width: 0; font-size: 12px; color: var(--ink2); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  .foot { display: flex; justify-content: space-between; gap: 8px; padding-top: 6px; border-top: 1px solid var(--rule); font-size: 11px; color: var(--ink3); white-space: nowrap; }
</style>
