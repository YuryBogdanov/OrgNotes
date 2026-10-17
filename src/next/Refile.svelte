<script lang="ts">
  import { store } from '../store.svelte';
  import { displayName } from '../names';
  import { toneFor, type Heading } from '../org';
  import { toneStyle } from '../colors';
  import { bareTitle, keyOf, plural } from '../refile';
  import PlacePalette from './PlacePalette.svelte';

  // «Перенести» in the new interface (ТЗ 44 §2.1, ТЗ 16): the heading with its subtree to another place — the plate
  // «Переносим» with its capsule and title, then the new choice of a place. As the old Refile.svelte, the same store.
  const req = store.refile!;
  const fromPalette = req.self;
  const src = $derived(store.refileSource());
  const below = $derived(src ? src.f.headings.filter((h) => h.line > src.h.line && h.line < src.h.end).length : 0);
  const close = () => (store.refile = null);
  async function pick(p: { path: string; heading: Heading | null }) {
    const r = await store.refileMove(p.path, p.heading ? { key: keyOf(p.heading), line: p.heading.line } : null);
    if (r === 'gone') return 'Заголовок изменился, выберите место ещё раз';
  }
</script>

{#snippet plate()}
  {#if src}
    <span class="cap">Переносим</span>
    {#if src.h.keyword}<span class="kw" style={toneStyle(toneFor(src.h.keyword, src.f.wf))}>{src.h.keyword}</span>{/if}
    <b class="ttl">{#if src.h.priority}<span class="pr">[#{src.h.priority}]</span>{' '}{/if}{bareTitle(src.h.title)}</b>
    <span class="right">{fromPalette && below ? `+${below} ${plural(below, 'подзаголовок', 'подзаголовка', 'подзаголовков')} · ` : ''}из {displayName(src.f.name)}</span>
  {/if}
{/snippet}

<PlacePalette title={fromPalette ? 'Перенести заголовок' : 'Перенести задачу'} token="Перенести" placeholder="Куда: файл…" {plate}
  recent={store.refileRecentFiles(req.path)} {...fromPalette ? { self: req.path } : { exclude: req.path }}
  top="Перенести на 1-й уровень" will={(h) => `станет ${h.level + 1}-м уровнем`}
  blocked={src ? { path: src.f.path, line: src.h.line, end: src.h.end } : null}
  lastKey={(p) => store.refileRecent().find((x) => x.path === p)?.key || undefined}
  onback={fromPalette ? () => { close(); store.palette = { n: Date.now() }; } : undefined}
  onpick={pick} onclose={close} />

<style>
  .cap { flex: 0 0 auto; }
  .kw { flex: 0 0 auto; height: 18px; padding: 0 6px; border-radius: 4px; font: 700 10.5px/18px var(--ui); color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .ttl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
  .pr { color: var(--wait); }
  .right { margin-left: auto; flex: 0 0 auto; font-size: 11.5px; color: var(--ink3); }
</style>
