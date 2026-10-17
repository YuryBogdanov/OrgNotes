<script lang="ts">
  import { moved } from '../pointer';
  import { tagsState as ts } from '../tagsState.svelte';
  import { tagOk, tagRows } from '../tags';
  import Popover from './ui/Popover.svelte';

  // «Теги заголовка» in the new interface (ТЗ 44 §3.3, ТЗ 38 §6), ⌃C Q: a 320 pt popover under the heading's line — its
  // tags as IBM Plex Mono 12 chips on `chip` with «×», then the field; the folder's tags offered in rows of 30 pt with
  // «N заголовков», the last one «Создать тег :…:»; the foot. ↩ adds, ⌫ in an empty field takes the last one away,
  // ⎋ or a click aside — done. Each change goes into the heading's line at once (one step of ⌘Z in the editor).
  let { tags, x, y, onchange, onclose }: { tags: string[]; x: number; y: number; onchange: (tags: string[]) => void; onclose: () => void } = $props();
  let q = $state('');
  let cur = $state(0);
  const have = $derived(new Set(tags.map((t) => t.toLowerCase())));
  const rows = $derived(tagRows(ts.list, tags, q));
  $effect(() => {
    if (cur >= rows.length) cur = Math.max(0, rows.length - 1);
  });
  const focus = (el: HTMLInputElement) => queueMicrotask(() => el.focus());
  function add(t: string) {
    if (!t || !tagOk(t) || have.has(t.toLowerCase())) return;
    onchange([...tags, t]);
    q = '';
    cur = 0;
  }
  function keydown(e: KeyboardEvent) {
    e.stopPropagation(); // the window's keys stay out while the field is open
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cur = Math.max(0, Math.min(rows.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[cur]) add(rows[cur].tag);
      else if (!q.trim()) onclose();
    } else if (e.key === 'Backspace' && !q && tags.length) {
      e.preventDefault();
      onchange(tags.slice(0, -1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    } else if (e.key === 'Tab') e.preventDefault();
  }
  const dot = (t: string) => {
    const c = ts.colorOf(t);
    return c ? `var(--p-${c})` : 'var(--ink3)';
  };
  const word = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'заголовок' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'заголовка' : 'заголовков'}`;
  const keep = (e: MouseEvent) => e.preventDefault();
</script>

<Popover {x} {y} width={320} label="Теги заголовка" {onclose}>
  <div class="tp">
    <div class="field">
      {#each tags as t (t)}
        <span class="chip">{t}<button aria-label="Убрать тег {t}" onmousedown={keep} onclick={() => onchange(tags.filter((x) => x !== t))}>×</button></span>
      {/each}
      <input bind:value={q} placeholder={tags.length ? '' : 'тег'} aria-label="Добавить тег" spellcheck="false" autocomplete="off" onkeydown={keydown} oninput={() => (cur = 0)} use:focus />
    </div>
    {#if rows.length}
      <div class="list" role="listbox" aria-label="Теги папки">
        {#each rows as r, i (r.tag + r.create)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="row" role="option" tabindex="-1" aria-selected={i === cur} class:on={i === cur} onmousedown={keep} onclick={() => add(r.tag)} onmousemove={(e) => moved(e) && (cur = i)}>
            {#if r.create}
              <span class="new">Создать тег <code>:{r.tag}:</code></span>
            {:else}
              <i style:background={dot(r.tag)}></i><span class="nm">{r.tag}</span><span class="n">{word(r.n)}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    <div class="foot">↩ добавить · ⌫ убрать последний · ⎋ готово · ⌃C Q</div>
  </div>
</Popover>

<style>
  .tp { width: 308px; display: flex; flex-direction: column; }
  .field { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 5px 5px 9px; border-bottom: 1px solid var(--rule); }
  .chip { display: inline-flex; align-items: center; gap: 2px; height: 22px; padding: 0 3px 0 7px; border-radius: 5px; background: var(--chip); color: var(--ink2); font: 12px var(--mono); }
  .chip button { width: 16px; height: 16px; padding: 0; border: 0; border-radius: 3px; background: none; color: var(--ink3); font-size: 13px; line-height: 1; }
  .chip button:hover { background: var(--chip2); color: var(--ink); }
  .field input { flex: 1; min-width: 60px; height: 22px; padding: 0 4px; border: 0; outline: none; background: none; color: var(--ink); caret-color: var(--lamp); font: 12.5px var(--mono); -webkit-user-select: text; user-select: text; }
  .list { padding-top: 5px; max-height: 240px; overflow: auto; }
  .row { display: flex; align-items: center; gap: 9px; height: 30px; padding: 0 10px; border-radius: 6px; cursor: default; }
  .row.on { background: var(--lamp); color: var(--onlamp); }
  .row i { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 2px; }
  .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font: 12.5px var(--mono); }
  .n { font-size: 11.5px; color: var(--ink3); }
  .row.on .n { color: var(--onlamp); }
  .new { color: var(--ink2); }
  .new code { font-family: var(--mono); color: var(--lampink); }
  .row.on .new, .row.on .new code { color: var(--onlamp); }
  .foot { margin-top: 5px; padding: 7px 10px 2px; border-top: 1px solid var(--rule); font-size: 11px; color: var(--ink3); }
</style>
