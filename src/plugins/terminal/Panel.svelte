<script lang="ts">
  import { terms, type Session } from './sessions.svelte';

  // The terminal's panel under the editor (ТЗ 55 §2): the head of 32 on `side` — the sessions' tabs (the dot, the name,
  // its folder; the active one on `bg` with a `lamp` bar on top, × on hover), «+» a new one; on the right «Во вкладку»,
  // ⌃`, ⌄ hide. The body: the active session's terminal on `bg`, 10/16 inside; ⌘F — a find bar over it.
  let { tab = false, old = false }: { tab?: boolean; old?: boolean } = $props();
  const active = $derived(terms.active);
  // the sessions live in one place: this one draws them while it is that place
  const home = $derived(tab ? terms.where === 'tab' : terms.where === 'panel');
  // every session's element in this body (the others hidden): moved here, not made again; the active one shown
  const place = (el: HTMLElement) => {
    if (!home) return;
    for (const s of terms.list) {
      if (s.host.parentElement !== el) el.append(s.host);
      s.host.style.display = s === active ? '' : 'none';
    }
    if (active) queueMicrotask(() => active.attach(el));
  };
  const DOT: Record<string, string> = { busy: 'var(--done)', idle: 'var(--wait)', bell: 'var(--wait)', ended: 'var(--ink3)' };
  // ---- the find bar ----
  let q = $state('');
  let findEl: HTMLInputElement | undefined = $state();
  $effect(() => {
    if (active?.findOpen) queueMicrotask(() => (findEl?.focus(), findEl?.select()));
  });
  function findKey(e: KeyboardEvent, s: Session) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) s.search.findPrevious(q);
      else s.search.findNext(q);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      s.findOpen = false;
      s.search.clearDecorations();
      s.focus();
    }
  }
</script>

<div class="tp" class:tab class:old>
  <div class="head" role="tablist" aria-label="Сессии терминала">
    {#each terms.list as s (s.id)}
      <div class="st" class:on={s === active} role="tab" tabindex="-1" aria-selected={s === active} title={s.launch.command || s.name}
        onclick={() => terms.pick(s.id)} onkeydown={() => {}} oncontextmenu={(e) => (e.preventDefault(), terms.sessionMenu(s, { x: e.clientX, y: e.clientY }))}>
        <i class="dot" class:ring={s.mood === 'bell'} style:background={DOT[s.mood]}></i>
        <span class="nm">{s.name}</span>
        {#if s.launch.cwd}<span class="cwd">{s.launch.cwd.replace(/^\/Users\/[^/]+/, '~')}</span>{/if}
        <button class="x" aria-label="Закрыть сессию {s.name}" onclick={(e) => (e.stopPropagation(), void terms.close(s.id))}>×</button>
      </div>
    {/each}
    <button class="plus" aria-label="Новая сессия" title="Новая сессия ⌃⇧` · ⌥-клик — профиль" onclick={(e) => {
      if (e.altKey) {
        const r = e.currentTarget.getBoundingClientRect();
        terms.profileMenu({ x: r.left, y: r.bottom + 4 });
      } else terms.add();
    }}>+</button>
    <span class="sp"></span>
    {#if !tab}
      <span class="right">
        <button class="lnk" onclick={() => terms.toTab()}>Во вкладку</button>
        <kbd>⌃`</kbd>
        <button class="hide" aria-label="Скрыть терминал" title="Скрыть ⌃`" onclick={() => terms.drawer?.hide()}>⌄</button>
      </span>
    {/if}
  </div>
  <div class="bodyw">
    {#if active?.findOpen}
      {@const s = active}
      <div class="find" role="search" aria-label="Поиск в выводе">
        <input bind:this={findEl} bind:value={q} placeholder="Найти в выводе" aria-label="Найти в выводе" spellcheck="false" autocomplete="off"
          oninput={() => s.search.findNext(q, { incremental: true })} onkeydown={(e) => findKey(e, s)} />
        <button aria-label="Предыдущее" onclick={() => s.search.findPrevious(q)}>↑</button>
        <button aria-label="Следующее" onclick={() => s.search.findNext(q)}>↓</button>
        <button aria-label="Закрыть поиск" onclick={() => ((s.findOpen = false), s.search.clearDecorations(), s.focus())}>×</button>
      </div>
    {/if}
    <div class="body" {@attach place}></div>
    {#if !home}<div class="empty">Сессии — в панели под редактором · <button class="lnk" onclick={() => terms.toPanel()}>Показать</button></div>
    {:else if !terms.list.length}<div class="empty">Нет сессий · <button class="lnk" onclick={() => terms.add()}>Новая сессия ⌃⇧`</button></div>{/if}
  </div>
</div>

<style>
  /* the old interface's tab: its variables as the new tokens */
  .tp.old { --bg: var(--ed-bg, #fff); --ink: var(--fg); --ink2: var(--fg2); --ink3: var(--fg3); --rule: var(--line); --chip: var(--field); --lamp: var(--acc); --lampink: var(--acc);
    --lampsoft: color-mix(in srgb, var(--acc) 18%, transparent); --lampline: var(--acc); --todo: var(--p-red); --done: var(--p-green); --wait: var(--p-orange); --next: var(--p-blue); --plug: var(--p-purple);
    --card: var(--bg); --field: var(--bg); --mono: ui-monospace, Menlo, monospace; --ui: -apple-system, system-ui, sans-serif; }
  .tp { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--bg); color: var(--ink); font: 12px var(--ui); }
  .head { flex: 0 0 32px; height: 32px; box-sizing: border-box; display: flex; align-items: stretch; background: var(--side); border-bottom: 1px solid var(--rule); }
  .st { display: flex; align-items: center; gap: 6px; padding: 0 8px 0 12px; border-right: 1px solid var(--rule); color: var(--ink2); cursor: default; white-space: nowrap; }
  .st.on { background: var(--bg); color: var(--ink); box-shadow: inset 0 2px 0 var(--lamp); }
  .dot { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; display: block; }
  .dot.ring { box-shadow: 0 0 0 3px color-mix(in srgb, var(--wait) 25%, transparent); }
  .cwd { font-size: 11px; color: var(--ink3); }
  .x { width: 16px; height: 16px; padding: 0; border: 0; border-radius: 4px; background: none; color: var(--ink3); font-size: 13px; line-height: 1; visibility: hidden; }
  .st:hover .x, .st.on .x { visibility: visible; }
  .x:hover { background: var(--chip); color: var(--ink); }
  .plus { width: 30px; padding: 0; border: 0; background: none; color: var(--ink3); font-size: 15px; }
  .plus:hover { color: var(--ink); }
  .sp { flex: 1; }
  .right { display: flex; align-items: center; gap: 12px; padding: 0 12px; color: var(--ink3); }
  .lnk { padding: 0; border: 0; background: none; color: var(--ink3); font: 12px var(--ui); }
  .lnk:not(:disabled):hover { color: var(--ink); }
  .empty .lnk { color: var(--lampink); }
  kbd { font: 11px var(--mono); padding: 1px 5px; border-radius: 4px; background: var(--chip); color: var(--ink3); }
  .hide { padding: 0; border: 0; background: none; color: var(--ink3); font-size: 14px; }
  .hide:hover { color: var(--ink); }
  .bodyw { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .body { flex: 1; min-height: 0; box-sizing: border-box; padding: 10px 16px; background: var(--bg); }
  .body :global(.tm-host) { width: 100%; height: 100%; }
  .body :global(.xterm) { height: 100%; }
  .body :global(.xterm-viewport) { background: transparent !important; }
  .empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 4px; color: var(--ink3); }
  .find { position: absolute; top: 8px; right: 18px; z-index: 3; display: flex; align-items: center; gap: 4px; padding: 6px; border: 1px solid var(--rule); border-radius: 10px; background: var(--card); box-shadow: var(--popshadow); }
  .find input { width: 200px; height: 26px; box-sizing: border-box; padding: 0 8px; border: 0; border-radius: 6px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); font: 12.5px var(--ui); outline: none; }
  .find input:focus { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .find button { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--ink2); }
  .find button:hover { background: var(--chip); }
</style>
