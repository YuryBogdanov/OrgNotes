<script lang="ts">
  import { tagsState as ts } from '../tagsState.svelte';
  import { PALETTE, toneOf, toneStyle } from '../colors';
  import Compat from './Compat.svelte';
  import { ConfirmDialog, ContextMenu, TagRename, type MenuItem } from './bridges';

  // «Теги» of the new sidebar (ТЗ 43 §2.3, ТЗ 38): «Найти тег», «по частоте / А–Я»; 28 pt rows — the tag's colour, its
  // name in IBM Plex Mono 12.5, how many headings have it. A click shows its headings in the tab «Тег», ⌘-click adds it
  // to the filter shown, ⌥-click — a new tab; ↑↓ ↩ from the field; the menu of a row as in the old navigator.
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
  let renaming = $state<{ tag: string; merge: boolean } | null>(null);
  let removing = $state<string | null>(null);
  const removeInfo = $derived(removing ? ts.preview(removing, null) : null);
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
        'sep',
        { label: 'Переименовать во всех файлах…', action: () => (renaming = { tag, merge: false }) },
        { label: 'Объединить с…', action: () => (renaming = { tag, merge: true }) },
        {
          label: 'Цвет тега', action: () => {}, subWidth: 180,
          sub: [
            ...PALETTE.map((p): MenuItem => ({ label: p.name, checked: ts.colorOf(tag) === p.id, capsule: toneStyle(toneOf(p.id)!), action: () => void ts.setColor(tag, p.id) })),
            'sep',
            { label: 'Без цвета', checked: !ts.colorOf(tag), action: () => void ts.setColor(tag, null) },
          ],
        },
        'sep',
        { label: 'Убрать из всех файлов…', danger: true, action: () => (removing = tag) },
      ],
    };
  }
  const pl = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
  const dot = (tag: string) => {
    const c = ts.colorOf(tag);
    return c ? `var(--p-${c})` : 'var(--ink3)';
  };
</script>

<div class="tp">
  <div class="top">
    <label class="find">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></svg>
      <input bind:value={query} placeholder="Найти тег" aria-label="Найти тег" spellcheck="false" autocomplete="off" onkeydown={key} />
    </label>
    <div class="seg" role="radiogroup" aria-label="Порядок тегов">
      <button role="radio" aria-checked={ts.sort === 'count'} class:on={ts.sort === 'count'} onclick={() => ts.setSort('count')}>по частоте</button>
      <button role="radio" aria-checked={ts.sort === 'name'} class:on={ts.sort === 'name'} onclick={() => ts.setSort('name')}>А–Я</button>
    </div>
  </div>
  <div class="list" role="listbox" aria-label="Теги" tabindex="0" bind:this={listEl} onkeydown={key}>
    {#each shown as t, i (t.tag)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="row" role="option" tabindex="-1" aria-selected={on.has(t.tag.toLowerCase())} class:on={on.has(t.tag.toLowerCase())} class:cur={i === cur}
        onclick={(e) => ((cur = i), pick(t.tag, e))} oncontextmenu={(e) => more(e, t.tag, i)}>
        <i style:background={dot(t.tag)}></i>
        <span class="nm">{t.tag}</span>
        <span class="n">{t.n}</span>
      </div>
    {:else}
      <p class="none">{query.trim() ? 'Нет такого тега' : 'В заметках пока нет тегов'}</p>
    {/each}
  </div>
</div>

<Compat>
  {#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} width={290} onclose={() => (menu = null)} />{/if}
  {#if renaming}<TagRename from={renaming.tag} merge={renaming.merge} onclose={() => (renaming = null)} />{/if}
  {#if removing && removeInfo}
    {@const tag = removing}
    <ConfirmDialog label="Убрать тег" title="Убрать :{tag}: у {removeInfo.n} {pl(removeInfo.n, 'заголовка', 'заголовков', 'заголовков')} в {removeInfo.files} {pl(removeInfo.files, 'файле', 'файлах', 'файлах')}?"
      onclose={() => (removing = null)} actions={[{ label: 'Убрать', kind: 'danger', run: () => void ts.remove(tag) }]}>
      Сами заголовки останутся. Одна правка во всех файлах — ⌘Z вернёт тег.
    </ConfirmDialog>
  {/if}
</Compat>

<style>
  .tp { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .top { flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; padding: 2px 0 8px; }
  .find { height: 28px; display: flex; align-items: center; gap: 7px; padding: 0 10px; border-radius: 7px; background: var(--chip); color: var(--ink3); }
  .find input { flex: 1; min-width: 0; padding: 0; border: 0; outline: none; background: none; color: var(--ink); font: 12.5px var(--ui); -webkit-user-select: text; user-select: text; }
  .seg { align-self: flex-start; display: flex; gap: 2px; padding: 2px; border-radius: 7px; background: var(--chip); }
  .seg button { height: 22px; padding: 0 10px; border: 0; border-radius: 5px; background: transparent; color: var(--ink2); font: 12px var(--ui); }
  .seg button.on { background: var(--segon); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); }
  .list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; outline: none; }
  .row { flex: 0 0 28px; display: flex; align-items: center; gap: 9px; padding: 0 10px; border-radius: 6px; color: var(--ink2); cursor: default; }
  .row:hover:not(.on) { background: var(--chip); }
  .row.on { background: var(--lampsoft); color: var(--ink); }
  .list:focus-visible .row.cur { box-shadow: inset 0 0 0 2px var(--lamp); }
  .row i { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 2px; }
  .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12.5px var(--mono); }
  .n { margin-left: auto; font-size: 11.5px; color: var(--ink3); font-variant-numeric: tabular-nums; }
  .row.on .n { color: var(--lampink); }
  .none { margin: 0; padding: 4px 10px; font-size: 12px; color: var(--ink3); }
  .seg button:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
</style>
