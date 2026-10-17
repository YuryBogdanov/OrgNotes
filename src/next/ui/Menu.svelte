<script lang="ts">
  import { isCommand, type MenuItem } from '../../menuItems';
  import Popover from './Popover.svelte';
  import Self from './Menu.svelte';

  // A menu of the new interface (ТЗ 44 §1, §3): rows of 28 pt, 6 pt corners, SF Pro 13; the shortcut right in IBM Plex
  // Mono 11 `ink3`, «›» at a submenu; the row chosen on `lamp` with its text, icon and shortcut `onlamp`; a dangerous
  // one in `todo`; lines of 1 pt `rule`. The same items as the old menu (menuItems.ts). Keys: ↑↓ choose, ↩ runs, → opens
  // a submenu (and a hover after 150 ms), ← or ⎋ closes it; ⎋ closes the menu.
  let { x, y, items, onclose, width = 200, nested = false, soft = false, label, onback }: {
    x: number; y: number; items: MenuItem[]; onclose: () => void; width?: number; nested?: boolean; soft?: boolean; label?: string; onback?: () => void;
  } = $props();

  let el: HTMLDivElement | undefined = $state();
  let cur = $state(-1);
  let sub = $state<{ i: number; x: number; y: number; keys: boolean } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const checks = $derived(items.some((it) => isCommand(it) && it.checked !== undefined));
  const usable = (i: number) => {
    const it = items[i];
    return !!it && isCommand(it) && !it.disabled;
  };
  $effect(() => {
    // the keys go to the menu at once (a submenu opened by → gets them too)
    queueMicrotask(() => el?.focus({ preventScroll: true }));
    return () => clearTimeout(timer);
  });
  function openSub(i: number, keys = false) {
    clearTimeout(timer);
    const row = el?.querySelectorAll<HTMLElement>('[data-row]')[i];
    if (!row) return;
    const r = row.getBoundingClientRect();
    sub = { i, x: r.right + 2, y: r.top - 6, keys };
  }
  function hover(i: number) {
    cur = usable(i) ? i : -1;
    clearTimeout(timer);
    const it = items[i];
    if (isCommand(it) && it.sub) timer = setTimeout(() => openSub(i), 150);
    else timer = setTimeout(() => (sub = null), 150);
  }
  function run(i: number) {
    const it = items[i];
    if (!isCommand(it) || it.disabled) return;
    if (it.sub) return openSub(i, true);
    onclose();
    it.action();
  }
  function step(d: 1 | -1) {
    const n = items.length;
    for (let k = 1; k <= n; k++) {
      const i = (((cur < 0 ? (d > 0 ? -1 : 0) : cur) + d * k) % n + n) % n;
      if (usable(i)) return void (cur = i);
    }
  }
  function key(e: KeyboardEvent) {
    if (sub) return; // the submenu has them
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') step(e.key === 'ArrowDown' ? 1 : -1);
    else if (e.key === 'Enter' || e.key === ' ') cur >= 0 && run(cur);
    else if (e.key === 'ArrowRight') {
      const it = items[cur];
      if (isCommand(it) && it.sub) openSub(cur, true);
    } else if (e.key === 'ArrowLeft' && nested) onback?.();
    else if (e.key === 'Escape') (nested ? onback : onclose)?.();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<Popover {x} {y} {width} {nested} role="menu" {label} {onclose} onkeydown={key} bind:el>
  <div class="m" class:soft>
  {#each items as it, i (i)}
    {#if it === 'sep'}
      <div class="sep" role="separator"></div>
    {:else if typeof it === 'object' && 'note' in it}
      <div class="note">{it.note}</div>
    {:else if typeof it === 'object' && 'head' in it}
      <div class="head" role="presentation">{it.head}</div>
    {:else}
      <button role="menuitem" data-row class:cur={cur === i || sub?.i === i} class:danger={it.danger} disabled={it.disabled} tabindex="-1"
        aria-keyshortcuts={it.shortcut} aria-haspopup={it.sub ? 'menu' : undefined} aria-expanded={it.sub ? sub?.i === i : undefined}
        onmouseenter={() => hover(i)} onmouseleave={() => !sub && (cur = -1)} onclick={() => run(i)}>
        {#if checks}<span class="chk" aria-hidden="true">{#if it.checked}<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5l2.6 2.6L10 3.5" /></svg>{/if}</span>{/if}
        {#if it.icon}
          <svg class="ic" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray={it.icon === 'untitled' ? '2.2 2' : undefined} aria-hidden="true">
            {#if it.icon === 'agenda'}<rect x="3" y="4" width="14" height="13" rx="2.5" /><path d="M3 8h14M7 2.5v3M13 2.5v3" />{:else if it.icon === 'file' || it.icon === 'untitled'}<path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" />{:else}<path d={it.icon} />{/if}
          </svg>
        {/if}
        <span class="lb" class:two={!!it.detail} class:it={it.italic}>
          {#if it.capsule}<span class="capsule" style={it.capsule}>{it.label}</span>{:else}<span class="l1">{it.label}</span>{/if}
          {#if it.detail}<span class="dt">{it.detail}</span>{/if}
        </span>
        {#if it.dot}<span class="dot" aria-label="не сохранено"></span>{/if}
        {#if it.shortcut}<span class="kb">{it.shortcut}</span>{/if}
        {#if it.sub}<span class="more" aria-hidden="true">›</span>{/if}
      </button>
    {/if}
  {/each}
  </div>
</Popover>
{#if sub}
  {@const host = items[sub.i]}
  {#if isCommand(host) && host.sub}
    <Self x={sub.x} y={sub.y} items={host.sub} width={host.subWidth ?? 200} nested soft={!!host.soft} {onclose} onback={() => { sub = null; el?.focus(); }} />
  {/if}
{/if}

<style>
  button { width: 100%; min-height: 28px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: 13px var(--ui); text-align: left; }
  button.cur { background: var(--lamp); color: var(--onlamp); }
  button.danger { color: var(--todo); }
  button.danger.cur { background: var(--todo); color: var(--onlamp); }
  button:disabled { opacity: 0.4; }
  .lb { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lb.two { display: flex; flex-direction: column; padding: 4px 0; }
  .lb.it .l1 { font-style: italic; }
  .dt { font-size: 11.5px; color: var(--ink3); overflow: hidden; text-overflow: ellipsis; }
  .chk { flex: 0 0 12px; display: flex; align-items: center; }
  .ic { flex: 0 0 auto; color: var(--ink3); }
  .dot { flex: 0 0 6px; width: 6px; height: 6px; border-radius: 3px; background: currentColor; opacity: 0.6; }
  .kb { margin-left: auto; padding-left: 16px; font: 11px var(--mono); color: var(--ink3); white-space: nowrap; }
  .more { margin-left: auto; padding-left: 12px; color: var(--ink3); }
  .kb + .more { margin-left: 0; }
  button.cur .ic, button.cur .kb, button.cur .more, button.cur .dt { color: var(--onlamp); }
  .capsule { display: inline-block; padding: 0 6px; border-radius: 4px; font: 700 10.5px/18px var(--ui); letter-spacing: 0.02em; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  button.cur .capsule { background: color-mix(in srgb, var(--onlamp) 12%, var(--card)); }
  .sep { height: 1px; margin: 4px 8px; background: var(--rule); }
  .note { padding: 4px 10px; font-size: 11.5px; line-height: 1.4; color: var(--ink3); }
  .head { padding: 8px 10px 3px; font: 600 11px var(--ui); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3); }
  /* the statuses (§3.2): the row chosen on `lampsoft`, the capsule keeps its colour */
  .soft button { min-height: 30px; }
  .soft .chk { color: var(--lampink); }
  .soft button.cur { background: var(--lampsoft); color: var(--ink); }
  .soft button.cur .ic, .soft button.cur .kb, .soft button.cur .more, .soft button.cur .dt { color: var(--ink3); }
  .soft button.cur .capsule { background: color-mix(in srgb, var(--tl) 16%, transparent); }
</style>
