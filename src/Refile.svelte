<script lang="ts">
  import { store } from './store.svelte';
  import PlacePicker from './PlacePicker.svelte';
  import { ICONS } from './commands';
  import { displayName } from './names';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import { bareTitle, keyOf, plural } from './refile';

  // «Перенести»: a heading with its subtree goes to another place — the core's choice of a place (PlacePicker), a
  // file, then a heading in it or the file's 1st level. Opened by the palette's «Перенести в другой файл…» (looks
  // like the palette, ⌫ goes back to it) and by a feature (an Inbox task, a review card) with its hooks.
  const req = store.refile!;
  const fromPalette = req.self;
  const src = $derived(store.refileSource());
  const below = $derived(src ? src.f.headings.filter((h) => h.line > src.h.line && h.line < src.h.end).length : 0);
  const close = () => (store.refile = null);
  async function pick(p: { path: string; heading: import('./org').Heading | null }) {
    const r = await store.refileMove(p.path, p.heading ? { key: keyOf(p.heading), line: p.heading.line } : null);
    if (r === 'gone') return 'Заголовок изменился, выберите место ещё раз';
  }
</script>

{#snippet plate()}
  {#if src}
    <svg class="pi" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS.refile} /></svg>
    <div class="pt">
      <span class="cap">{fromPalette ? 'Переносится заголовок' : 'Переносится задача'}</span>
      <span class="ph">
        {#if src.h.keyword}<span class="kw tone-chip" style={toneStyle(toneFor(src.h.keyword, src.f.wf))}>{src.h.keyword}</span>{/if}
        <span class="ttl">{#if src.h.priority}<span class="pr">[#{src.h.priority}]</span>{' '}{/if}{bareTitle(src.h.title)}</span>
      </span>
    </div>
    <span class="right">{fromPalette && below ? `+${below} ${plural(below, 'подзаголовок', 'подзаголовка', 'подзаголовков')} · ` : ''}из {displayName(src.f.name)}</span>
  {/if}
{/snippet}

<PlacePicker title={fromPalette ? 'Перенести заголовок' : 'Перенести задачу'} token="Перенести в" placeholder="файл…" {plate}
  palette={fromPalette} full={!fromPalette} recent={store.refileRecentFiles(req.path)} {...fromPalette ? { self: req.path } : { exclude: req.path }}
  top="Перенести на 1-й уровень" will={(h) => `станет ${h.level + 1}-м уровнем`}
  blocked={src ? { path: src.f.path, line: src.h.line, end: src.h.end } : null}
  lastKey={(p) => store.refileRecent().find((x) => x.path === p)?.key || undefined}
  onback={fromPalette ? () => { close(); store.palette = { n: Date.now() }; } : undefined}
  onpick={pick} onclose={close} />

<style>
  .pi { flex: 0 0 14px; color: var(--acc); }
  .pt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .cap { font-size: 11px; color: var(--fg2); }
  .ph { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13.5px; min-width: 0; }
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .ttl { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pr { color: var(--wait); }
  .right { flex: 0 0 auto; font-size: 11.5px; color: var(--fg2); }
</style>
