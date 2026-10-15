<script lang="ts">
  import { moved } from './pointer';
  import { onMount, tick } from 'svelte';
  import { store } from './store.svelte';
  import { sequenceFor, setKeyword, setPriority, toneFor } from './org';
  import { toneStyle } from './colors';
  import type { RichPick } from './orgRich';

  // The choice behind a drawn capsule of «Оформленный текст»: a status (of the task's set) or a priority (a date
  // opens the palette's calendar instead).
  // Written like the commands do; the caret does not move, so the line stays drawn.
  let { pick, path, onclose }: { pick: RichPick; path: string; onclose: () => void } = $props();

  const f = $derived(store.files.find((x) => x.path === path));
  type Item = { id: string; label: string; cap?: string; style?: string; hint?: string; check?: boolean; sep?: boolean; run: () => void };
  const close = (fn: () => void) => () => {
    fn();
    onclose();
  };
  const items = $derived.by<Item[]>(() => {
    if (!f) return [];
    const at = (fn: Parameters<typeof store.patchAt>[2]) => close(() => store.patchAt(path, pick.line, fn));
    if (pick.kind === 'status') {
      const states = sequenceFor(f.wf, pick.keyword ?? null).states;
      const open = states.filter((s) => !s.done);
      const done = states.filter((s) => s.done);
      return [...open, ...done].map((s, i) => ({
        id: s.name, label: s.name, cap: s.name, style: toneStyle(toneFor(s.name, f.wf)), check: s.name === pick.keyword, hint: s.name === pick.keyword ? 'сейчас' : '',
        sep: i === open.length && open.length > 0 && done.length > 0, run: at((t, h, wf) => setKeyword(t, h, s.name, wf)),
      }));
    }
    if (pick.kind === 'priority') {
      return [
        ...['A', 'B', 'C'].map((p) => ({ id: p, label: p, cap: p, style: '', check: p === pick.priority, hint: p === pick.priority ? 'сейчас' : '', run: at((t, h) => setPriority(t, h, p)) })),
        { id: 'none', label: 'Без приоритета', sep: true, run: at((t, h) => setPriority(t, h, null)) },
      ];
    }
    return [];
  });
  let sel = $state(0);
  let box: HTMLDivElement | undefined = $state();
  onMount(async () => {
    sel = Math.max(0, items.findIndex((x) => x.check));
    await tick();
    box?.focus();
  });
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[sel]?.run();
    }
  }
  const x = $derived(Math.min(pick.rect.left, window.innerWidth - 240));
  const y = $derived(pick.rect.bottom + 4);
  const title = $derived(pick.kind === 'status' ? 'Статус' : 'Приоритет');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" onmousedown={onclose}></div>
<div class="menu" role="menu" aria-label={title} tabindex="0" bind:this={box} onkeydown={key} style:left="{x}px" style:top="{y}px">
  {#each items as it, i (it.id)}
    {#if it.sep}<div class="sep" role="separator"></div>{/if}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="row" class:on={i === sel} role="menuitem" tabindex="-1" onmousemove={(e) => moved(e) && (sel = i)} onclick={it.run}>
      <span class="ck">{it.check ? '✓' : ''}</span>
      {#if it.cap}<span class="cap" class:tone-chip={!!it.style} class:prio={pick.kind === 'priority'} style={it.style}>{it.cap}</span>{:else}<span class="lbl">{it.label}</span>{/if}
      {#if it.hint}<span class="hint">{it.hint}</span>{/if}
    </div>
  {/each}
  {#if pick.kind === 'status'}<div class="foot">⇧← ⇧→ — предыдущий / следующий статус</div>{/if}
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 90; }
  .menu { position: fixed; z-index: 91; width: 240px; padding: 5px; display: flex; flex-direction: column; gap: 1px; background: var(--bg); border: 1px solid var(--line); border-radius: 9px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25); font-size: 13px; outline: none; }
  .row { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px; border-radius: 6px; cursor: default; }
  .row.on { background: var(--sel); }
  .ck { flex: 0 0 12px; font-size: 11px; color: var(--fg2); }
  .cap { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 5px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.02em; }
  .cap.prio { color: var(--wait); background: color-mix(in srgb, var(--wait) 15%, transparent); }
  .hint { margin-left: auto; font-size: 11.5px; color: var(--fg3); }
  .sep { height: 1px; margin: 4px 6px; background: var(--line); }
  .foot { margin: 5px 3px 2px; padding-top: 6px; border-top: 1px solid var(--line); font-size: 11px; color: var(--fg3); }
</style>
