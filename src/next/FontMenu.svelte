<script lang="ts">
  import { tick } from 'svelte';
  import { setLayer } from '../settingsNav.svelte';
  import { BUNDLED_FONTS, fontLabel, fontList, loadFonts, type FontRole } from './fontList.svelte';
  import { fontCss } from './tokens';
  import Popover from './ui/Popover.svelte';

  // A theme's font (ТЗ 57 §6): a button with the font's name set in it; its menu — the bundled ones, a rule, the
  // families of this Mac with a field to find one; each item in its own font, «нет кириллицы» grey by those without.
  let { value, role, label, onchange }: { value: string; role: FontRole; label: string; onchange: (name: string) => void } = $props();

  let open = $state<{ x: number; y: number } | null>(null);
  let q = $state('');
  let cur = $state(0);
  let field: HTMLInputElement | undefined = $state();
  $effect(() => setLayer('font-' + label, !!open));
  $effect(() => () => setLayer('font-' + label, false));

  type Item = { name: string; label: string; cyr: boolean; own?: boolean };
  const items = $derived.by((): Item[] => {
    const low = q.trim().toLowerCase();
    const bundled = BUNDLED_FONTS.map((f) => ({ ...f, cyr: true }));
    const mac = fontList.list.map((f) => ({ name: f.name, label: f.name, cyr: f.cyr, own: true }));
    return [...bundled, ...mac].filter((f) => !low || f.label.toLowerCase().includes(low));
  });
  async function show(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    open = { x: r.left, y: r.bottom + 4 };
    q = '';
    cur = Math.max(0, items.findIndex((f) => f.name === value));
    void loadFonts();
    await tick();
    field?.focus();
    document.querySelector('.fm-list .on')?.scrollIntoView({ block: 'nearest' });
  }
  function choose(f: Item) {
    open = null;
    if (f.name !== value) onchange(f.name);
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      open = null;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cur = Math.max(0, Math.min(items.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
      void tick().then(() => document.querySelector('.fm-list .on')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter' && items[cur]) {
      e.preventDefault();
      choose(items[cur]);
    }
  }
</script>

<button class="fb" aria-haspopup="listbox" aria-label="{label}: {fontLabel(value)}" style:font-family={fontCss(value, role)} onclick={show}>
  <span>{fontLabel(value)}</span><span class="chev" aria-hidden="true">⌄</span>
</button>
{#if open}
  <Popover x={open.x} y={open.y} width={260} {label} onclose={() => (open = null)} onkeydown={key}>
    <input class="fm-q" bind:this={field} bind:value={q} placeholder="Найти шрифт" aria-label="Найти шрифт" spellcheck="false" oninput={() => (cur = 0)} />
    <div class="fm-list" role="listbox" aria-label={label}>
      {#each items as f, i (f.name)}
        {#if f.own && (i === 0 || !items[i - 1].own)}<div class="fm-sep" role="separator"></div>{/if}
        <button class="fm-it" class:on={i === cur} role="option" aria-selected={f.name === value} style:font-family={fontCss(f.name, role)}
          onmouseenter={() => (cur = i)} onclick={() => choose(f)}>
          <span class="fm-n">{f.label}</span>
          {#if !f.cyr}<span class="fm-nc">нет кириллицы</span>{/if}
          {#if f.name === value}<span class="fm-ck" aria-hidden="true">✓</span>{/if}
        </button>
      {:else}
        <div class="fm-none">{fontList.loaded ? 'Нет такого шрифта' : 'Читаю шрифты…'}</div>
      {/each}
    </div>
  </Popover>
{/if}

<style>
  .fb { display: inline-flex; align-items: center; gap: 8px; max-width: 220px; height: 28px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font-size: 13px; }
  .fb span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chev { font: 11px var(--ui); color: var(--ink3); }
  .fb:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
  .fm-q { width: 100%; height: 28px; box-sizing: border-box; margin-bottom: 4px; padding: 0 8px; border: 0; border-radius: 6px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); font: 12.5px var(--ui); outline: none; -webkit-user-select: text; user-select: text; }
  .fm-q:focus { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .fm-list { max-height: 320px; overflow: auto; display: flex; flex-direction: column; }
  .fm-it { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: var(--ink); font-size: 15px; text-align: left; }
  .fm-it.on { background: var(--lampsoft); }
  .fm-n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fm-nc { flex: 0 0 auto; font: 11px var(--ui); color: var(--ink3); }
  .fm-ck { flex: 0 0 auto; font: 12px var(--ui); color: var(--lampink); }
  .fm-sep { height: 1px; margin: 4px 6px; background: var(--rule); }
  .fm-none { padding: 8px; font: 12.5px var(--ui); color: var(--ink3); }
</style>
