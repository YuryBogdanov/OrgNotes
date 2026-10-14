<script lang="ts">
  import { tagsState as ts } from './tagsState.svelte';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';

  // The navigator's «Теги» (ТЗ 38 §1): the folder's tags — a search, by count or A–Я, each with its colour and how many
  // headings have it set; a click shows its headings, ⌘-click adds it to the filter shown (И), ⌥-click in a new tab.
  let query = $state('');
  const all = $derived(ts.list);
  const shown = $derived.by(() => {
    const q = query.trim().replace(/:/g, '').toLowerCase();
    return q ? all.filter((t) => t.tag.toLowerCase().includes(q)) : all;
  });
  const on = $derived(new Set(ts.shown.map((t) => t.toLowerCase())));
  let cur = $state(0);
  let listEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (cur >= shown.length) cur = Math.max(0, shown.length - 1);
  });

  function pick(tag: string, e: { metaKey: boolean; altKey: boolean }) {
    if (e.metaKey) ts.add(tag);
    else ts.open([tag], e.altKey);
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cur = Math.max(0, Math.min(shown.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
      listEl?.querySelectorAll<HTMLElement>('[role=option]')[cur]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && shown[cur]) {
      e.preventDefault();
      pick(shown[cur].tag, e);
    }
  }
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  function more(e: MouseEvent, tag: string, i: number) {
    e.preventDefault();
    cur = i;
    menu = {
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Показать заголовки', shortcut: '↩', action: () => ts.open([tag]) },
        { label: 'Добавить к фильтру', shortcut: '⌘-клик', action: () => ts.add(tag) },
        { label: 'Открыть в новой вкладке', shortcut: '⌥↩', action: () => ts.open([tag], true) },
      ],
    };
  }
  const dot = (tag: string) => {
    const c = ts.colorOf(tag);
    return c ? `var(--p-${c})` : 'var(--tagdot)';
  };
</script>

<div class="tp">
  <div class="top">
    <label class="find">
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
      <input bind:value={query} placeholder="Найти тег" aria-label="Найти тег" spellcheck="false" onkeydown={key} />
    </label>
    <div class="head">
      <span>ТЕГИ · {all.length}</span>
      <div class="seg" role="radiogroup" aria-label="Порядок тегов">
        <button role="radio" aria-checked={ts.sort === 'count'} class:on={ts.sort === 'count'} onclick={() => ts.setSort('count')}>по частоте</button>
        <button role="radio" aria-checked={ts.sort === 'name'} class:on={ts.sort === 'name'} onclick={() => ts.setSort('name')}>А–Я</button>
      </div>
    </div>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="list" role="listbox" aria-label="Теги" tabindex="0" bind:this={listEl} onkeydown={key}>
    {#each shown as t, i (t.tag)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="tag" role="option" aria-selected={on.has(t.tag.toLowerCase())} class:on={on.has(t.tag.toLowerCase())} class:cur={i === cur}
        onclick={(e) => ((cur = i), pick(t.tag, e))} oncontextmenu={(e) => more(e, t.tag, i)}>
        <i style:background={dot(t.tag)}></i>
        <span class="nm">:{t.tag}:</span>
        <span class="n">{t.n}</span>
      </div>
    {:else}
      <p class="none">{query.trim() ? 'Нет такого тега' : 'В заметках пока нет тегов'}</p>
    {/each}
  </div>
  <p class="hint">Клик — заголовки с тегом. ⌘-клик — добавить тег к фильтру (все сразу).</p>
</div>
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}

<style>
  .tp { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .top { padding: 10px 10px 4px; display: flex; flex-direction: column; gap: 8px; }
  .find { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px; border-radius: 6px; background: var(--field); color: var(--fg3); }
  .find input { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--fg); font-size: 12.5px; }
  .head { display: flex; align-items: center; gap: 8px; padding: 0 2px; }
  .head > span { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--fg3); }
  .seg { margin-left: auto; display: flex; padding: 1px; gap: 1px; background: var(--field); border-radius: 6px; }
  .seg button { height: 20px; padding: 0 7px; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 11px; }
  .seg button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); }
  .list { flex: 1; min-height: 0; overflow: auto; padding: 2px 8px; outline: none; }
  .tag { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px; border-radius: 6px; cursor: default; }
  .tag:hover { background: var(--field); }
  .list:focus-visible .tag.cur { box-shadow: inset 0 0 0 1.5px var(--acc); }
  .tag.on { background: var(--sel); }
  .tag i { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; }
  .nm { flex: 1; min-width: 0; font: 12.5px var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { font-size: 11.5px; color: var(--fg3); font-variant-numeric: tabular-nums; }
  .tag.on .nm, .tag.on .n { color: var(--acc); font-weight: 600; }
  .none { margin: 8px; font-size: 12px; color: var(--fg3); }
  .hint { margin: 0; padding: 8px 12px 10px; font-size: 11px; line-height: 1.45; color: var(--fg3); border-top: 1px solid var(--line); }
</style>
