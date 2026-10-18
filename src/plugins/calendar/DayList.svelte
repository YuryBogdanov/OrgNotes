<script lang="ts">
  import { cal as calendar } from './state.svelte';
  import { onMount, tick } from 'svelte';
  import { dayShort, entriesWord, fromIso, toneVars, type CalEntry } from '@panopticon/api/org';

  // «… ещё N» (ТЗ 24, 2.4): every entry of a day, under its cell. A click opens the file at the heading in a new tab,
  // ⌘-click in the neighbour pane; ↑↓ ↩ ⌘↩ from the keyboard. It stays while the pointer is over it or the button.
  let { day, entries, at, mark = null, onclose, onenter, onleave }: {
    day: string;
    entries: CalEntry[];
    at: { left: number; top: number }; // under the cell, in the window
    mark?: ((e: CalEntry) => boolean) | null; // «— эта задача» (the review's calendar)
    onclose: () => void;
    onenter?: () => void;
    onleave?: () => void;
  } = $props();

  let el: HTMLDivElement | undefined = $state();
  let sel = $state(0);
  let pos = $state({ left: 0, top: 0 });
  // moved inside the window when it does not fit to the right or below
  onMount(() => {
    const r = el!.getBoundingClientRect();
    pos = {
      left: Math.max(8, Math.min(at.left, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(at.top, window.innerHeight - r.height - 8)),
    };
    void tick().then(() => el?.focus());
  });
  const open = (e: CalEntry, neighbour: boolean) => {
    onclose();
    calendar.openEntry(e, neighbour);
  };
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (entries[sel]) open(entries[sel], e.metaKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }
  const wfOf = (e: CalEntry) => calendar.files.find((f) => f.path === e.path)?.wf;
  const label = (e: CalEntry) => (e.layer === 'event' ? (e.time ?? 'весь день') : e.layer === 'deadline' ? 'СРОК' : (e.keyword ?? '—'));
  const tone = (e: CalEntry) => {
    if (e.layer === 'event') return 'color:var(--acc);background:color-mix(in srgb, var(--acc) 15%, transparent)';
    if (e.layer === 'deadline') return 'color:var(--todo);background:color-mix(in srgb, var(--todo) 15%, transparent)';
    const wf = wfOf(e);
    return e.keyword && wf ? toneVars(e.keyword, wf) : '';
  };
</script>

<svelte:window onmousedown={(e) => { if (el && !el.contains(e.target as Node) && !(e.target as Element).closest('.more')) onclose(); }} />

<div class="daylist" role="dialog" aria-label="Записи на день" tabindex="-1" bind:this={el} style="left:{pos.left}px;top:{pos.top}px" onkeydown={key} onmouseenter={onenter} onmouseleave={onleave}>
  <div class="dh"><b>{dayShort(fromIso(day))}</b><span>{entriesWord(entries.length)}</span></div>
  <div role="listbox" aria-label="Записи">
    {#each entries as e, i (e.path + e.line + e.layer + (e.time ?? ''))}
      <button role="option" aria-selected={i === sel} class:on={i === sel} class:picked={!mark && calendar.isPicked(e)} class:mine={mark?.(e)} onmousemove={() => (sel = i)}
        onclick={(ev) => (mark || ev.metaKey ? open(e, ev.metaKey) : calendar.pick(e))} ondblclick={() => open(e, false)} oncontextmenu={(ev) => !mark && calendar.menuOf(ev, e)}>
        <span class="k tone-chip" class:ev={e.layer === 'event' || e.layer === 'deadline'} style={tone(e)}>{label(e)}</span>
        <span class="tt"><span class="t" class:done={e.layer === 'done'}>{e.priority ? `[#${e.priority}] ` : ''}{e.title}{mark?.(e) ? ' — эта задача' : ''}</span><span class="w">{e.where}</span></span>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--fg2)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-label="Открыть в новой вкладке"><path d="M8 4H4v12h12v-4M11 3h6v6M17 3l-8 8" /></svg>
      </button>
    {/each}
  </div>
  <div class="foot">{mark ? 'Клик — открыть в новой вкладке · ⌘-клик — в соседней панели' : 'Клик — выбрать · двойной клик или ↩ — открыть · ⌘-клик — в соседней панели'}</div>
</div>

<style>
  .daylist { position: fixed; z-index: 60; width: 330px; max-height: min(420px, calc(100vh - 16px)); overflow: auto; box-sizing: border-box; padding: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 14px 40px rgba(0, 0, 0, 0.28); display: flex; flex-direction: column; gap: 1px; outline: none; }
  .dh { display: flex; align-items: baseline; gap: 8px; padding: 4px 8px 6px; }
  .dh span { font-size: 11.5px; color: var(--fg2); }
  button { width: 100%; display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 4px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--fg); text-align: left; }
  button.on { background: var(--sel); }
  button.picked { box-shadow: inset 0 0 0 1.5px var(--acc); }
  .k { flex: 0 0 auto; min-width: 42px; height: 18px; display: inline-flex; align-items: center; justify-content: center; padding: 0 5px; border-radius: 4px; font-size: 10px; font-weight: 700; box-sizing: border-box; }
  .tt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t.done { text-decoration: line-through; color: var(--fg3); }
  .mine .t { font-weight: 700; }
  .w { font-size: 11px; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  svg { flex: 0 0 13px; }
  .foot { padding: 6px 8px 2px; border-top: 1px solid var(--line); margin-top: 4px; font-size: 11px; color: var(--fg3); }
  /* the new interface (ТЗ 47 §1.3): the popover of ТЗ 44 — `card`, `rule`, 12 pt corners, its shadow */
  :global([data-ui='next']) .daylist { background: var(--card); border-color: var(--rule); border-radius: 12px; box-shadow: var(--popshadow); color: var(--ink); font-family: var(--ui); }
  :global([data-ui='next']) .daylist button.on { background: var(--chip); }
  :global([data-ui='next']) .daylist .k { font-family: var(--font-mono, ui-monospace, monospace); }
  :global([data-ui='next']) .daylist .foot { border-color: var(--rule); color: var(--ink3); }
</style>
