<script lang="ts">
  import Segmented from './Segmented.svelte';
  import { tagsState as ts } from './tagsState.svelte';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import TagRename from './TagRename.svelte';
  import { PALETTE, toneOf, toneStyle } from './colors';
  import { portal } from './portal';

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
  let renaming = $state<{ tag: string; merge: boolean } | null>(null);
  let removing = $state<string | null>(null);
  const removeInfo = $derived(removing ? ts.preview(removing, null) : null);
  const pl = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
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
      <Segmented label="Порядок тегов" size="small" push value={ts.sort} onchange={(v) => ts.setSort(v)} options={[{ value: 'count' as const, label: 'по частоте' }, { value: 'name' as const, label: 'А–Я' }]} />
    </div>
  </div>
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
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} width={290} onclose={() => (menu = null)} />{/if}
{#if renaming}<TagRename from={renaming.tag} merge={renaming.merge} onclose={() => (renaming = null)} />{/if}
{#if removing && removeInfo}
  <div class="layer" use:portal>
    <div class="scrim" aria-hidden="true"></div>
    <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Убрать тег" tabindex="-1"
      onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); removing = null; } }}>
      <b>Убрать :{removing}: у {removeInfo.n} {pl(removeInfo.n, 'заголовка', 'заголовков', 'заголовков')} в {removeInfo.files} {pl(removeInfo.files, 'файле', 'файлах', 'файлах')}?</b>
      <p>Сами заголовки останутся. Одна правка во всех файлах — ⌘Z вернёт тег.</p>
      <div class="row">
        <button class="b" onclick={() => (removing = null)}>Отмена</button>
        <!-- svelte-ignore a11y_autofocus -->
        <button class="b danger" autofocus onclick={() => { const t = removing!; removing = null; void ts.remove(t); }}>Убрать</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tp { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .top { padding: 10px 10px 4px; display: flex; flex-direction: column; gap: 8px; }
  .find { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px; border-radius: 6px; background: var(--field); color: var(--fg3); }
  .find input { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--fg); font-size: 12.5px; }
  .head { display: flex; align-items: center; gap: 8px; padding: 0 2px; }
  .head > span { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--fg3); }
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
  .layer { color: var(--fg); font: 13px var(--ui, -apple-system, system-ui, sans-serif); }
  .scrim { position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, 0.3); }
  .dlg { position: fixed; z-index: 91; left: 50%; top: 30%; transform: translateX(-50%); width: min(420px, calc(100% - 32px)); display: flex; flex-direction: column; gap: 8px; padding: 18px 20px 16px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35); outline: none; }
  .dlg p { margin: 0; color: var(--fg2); line-height: 1.45; }
  .dlg .row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  .b { height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font-size: 13px; }
  .b.danger { border: 0; background: var(--danger); color: var(--on-danger); font-weight: 600; }
  .hint { margin: 0; padding: 8px 12px 10px; font-size: 11px; line-height: 1.45; color: var(--fg3); border-top: 1px solid var(--line); }
</style>
