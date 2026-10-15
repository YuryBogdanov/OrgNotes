<script lang="ts">
  import { moved } from './pointer';
  import { onMount } from 'svelte';
  import { tagsState as ts } from './tagsState.svelte';
  import { bareTag, tagOk } from './tags';
  import { portal } from './portal';

  // «Теги заголовка» (ТЗ 38 §6), ⌃C Q in the editor: its tags as capsules with ×, a field; the folder's tags by
  // substring, the most used first, with how many headings; «Создать тег :x:». ↩ adds, ⌫ in an empty field takes the
  // last one away, ⎋ or a click aside — done. Each change goes into the heading's line at once (the editor makes them
  // one step of ⌘Z).
  let { tags, x, y, onchange, onclose }: { tags: string[]; x: number; y: number; onchange: (tags: string[]) => void; onclose: () => void } = $props();
  let q = $state('');
  let cur = $state(0);
  let input: HTMLInputElement | undefined = $state();
  let box: HTMLDivElement | undefined = $state();
  const key = (t: string) => t.toLowerCase();
  const have = $derived(new Set(tags.map(key)));
  const name = $derived(bareTag(q));
  const found = $derived.by(() => {
    const s = key(name);
    return ts.list.filter((t) => !have.has(key(t.tag)) && (!s || key(t.tag).includes(s))).slice(0, 7);
  });
  const create = $derived(!!name && tagOk(name) && !have.has(key(name)) && !ts.list.some((t) => key(t.tag) === key(name)));
  const rows = $derived([...found.map((t) => ({ tag: t.tag, n: t.n, create: false })), ...(create ? [{ tag: name, n: 0, create: true }] : [])]);
  $effect(() => {
    if (cur >= rows.length) cur = Math.max(0, rows.length - 1);
  });
  onMount(() => {
    input?.focus();
    // kept on the screen
    const r = box?.getBoundingClientRect();
    if (box && r && r.right > innerWidth - 8) box.style.left = `${Math.max(8, innerWidth - 8 - r.width)}px`;
    if (box && r && r.bottom > innerHeight - 8) box.style.top = `${Math.max(8, y - r.height - 28)}px`;
    const away = (e: MouseEvent) => {
      if (!box?.contains(e.target as Node)) onclose();
    };
    setTimeout(() => document.addEventListener('mousedown', away, true));
    return () => document.removeEventListener('mousedown', away, true);
  });
  function add(t: string) {
    if (!t || !tagOk(t) || have.has(key(t))) return;
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
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }
  const dot = (t: string) => {
    const c = ts.colorOf(t);
    return c ? `var(--p-${c})` : 'var(--tagdot)';
  };
  const word = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'заголовок' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'заголовка' : 'заголовков'}`;
</script>

<div class="tpop" use:portal bind:this={box} role="dialog" aria-label="Теги заголовка" style:left="{x}px" style:top="{y}px">
  <div class="field">
    {#each tags as t (t)}
      <span class="chip">:{t}:<button aria-label="Убрать тег {t}" onmousedown={(e) => e.preventDefault()} onclick={() => onchange(tags.filter((x) => x !== t))}>×</button></span>
    {/each}
    <input bind:this={input} bind:value={q} placeholder={tags.length ? '' : 'тег'} aria-label="Добавить тег" spellcheck="false" onkeydown={keydown} oninput={() => (cur = 0)} />
  </div>
  {#if rows.length}
    <div class="list" role="listbox" aria-label="Теги папки">
      {#each rows as r, i (r.tag + r.create)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="row" role="option" aria-selected={i === cur} class:on={i === cur} onmousedown={(e) => e.preventDefault()} onclick={() => add(r.tag)} onmousemove={(e) => moved(e) && (cur = i)}>
          {#if r.create}
            <span class="new">Создать тег <code>:{r.tag}:</code></span>
          {:else}
            <i style:background={dot(r.tag)}></i>
            <span class="nm">:{r.tag}:</span>
            <span class="n">{word(r.n)}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  <div class="foot">↩ добавить · ⌫ убрать последний · ⎋ готово · ⌃C Q</div>
</div>

<style>
  .tpop { position: fixed; z-index: 70; width: 320px; box-sizing: border-box; display: flex; flex-direction: column; background: var(--pop, var(--bg)); color: var(--fg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22); font: 13px var(--ui, -apple-system, system-ui, sans-serif); overflow: hidden; }
  .field { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 8px; border-bottom: 1px solid var(--line); }
  .chip { display: inline-flex; align-items: center; gap: 2px; height: 22px; padding: 0 3px 0 7px; border-radius: 5px; background: var(--tagbg); color: var(--tagfg); font: 12px var(--mono); }
  .chip button { width: 16px; height: 16px; padding: 0; border: 0; border-radius: 3px; background: none; color: var(--fg3); font-size: 13px; line-height: 1; }
  .chip button:hover { background: color-mix(in srgb, var(--fg) 12%, transparent); }
  .field input { flex: 1; min-width: 60px; height: 22px; border: 0; outline: none; background: none; color: var(--fg); font: 12.5px var(--mono); }
  .list { padding: 4px; max-height: 240px; overflow: auto; }
  .row { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px; border-radius: 6px; cursor: default; }
  .row.on { background: var(--sel); }
  .row i { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 50%; }
  .nm { flex: 1; font: 12.5px var(--mono); }
  .n { font-size: 11.5px; color: var(--fg3); }
  .new { color: var(--fg2); }
  .new code { font-family: var(--mono); color: var(--acc); }
  .foot { padding: 6px 10px; border-top: 1px solid var(--line); font-size: 11px; color: var(--fg3); }
</style>
