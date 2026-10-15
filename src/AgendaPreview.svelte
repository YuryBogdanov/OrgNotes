<script lang="ts">
  import { store } from './store.svelte';
  import { toneFor } from './org';
  import { toneOf, toneStyle } from './colors';
  import { runAgenda, shortDay, tasksCount, type Agenda, type Block } from './agendas';

  // The agenda builder's live preview (tech sprint 4.2, from AgendaBuilder.svelte): the draft run on the files, block
  // by block, up to 50 tasks each — drawn again at every change of the draft.
  let { draft, today }: { draft: Agenda; today: Date } = $props();

  const preview = $derived(runAgenda(draft, store.files, today, 50));
  const dotStyle = (b: Block) => toneStyle(toneOf(b.color) ?? toneOf('blue')!);
</script>

  <div class="pv" aria-label="Предпросмотр">
    <div class="pvh"><span class="cap">ПРЕДПРОСМОТР</span><span class="upd">обновляется при каждом изменении</span></div>
    {#each preview as r (r.block.id)}
      <div class="ph2" data-preview={r.block.name}>
        <span class="dot tone-bg" style={dotStyle(r.block)}></span>
        <span class="pt">{r.block.name || 'Без названия'}</span>
        <span class="pc">{tasksCount(r.total)}</span>
      </div>
      {#if !r.total}<div class="pnone">нет задач</div>{/if}
      {#each r.groups as g (g.key)}
        {#if g.title}<div class="pg">{g.title}</div>{/if}
        {#each g.tasks as t (t.file + ':' + t.line)}
          {@const f = store.files[t.file]}
          {@const d = t.scheduled ?? t.deadline}
          <div class="prow">
            <span class="kw tone-chip" style={toneStyle(toneFor(t.kw, f.wf))}>{t.kw}</span>
            <div class="pm"><span class="ptt">{t.title}</span><span class="ps">{t.src}</span></div>
            <span class="pd">{d ? shortDay(d) : ''}</span>
          </div>
        {/each}
      {/each}
      {#if r.more}<div class="pnone">и ещё {r.more}</div>{/if}
    {/each}
  </div>

<style>
  .pv { flex: 1 1 440px; min-width: 0; overflow: auto; padding: 22px 24px; display: flex; flex-direction: column; gap: 6px; }
  /* an app window under 960 pt: the preview goes under the editor (AgendaBuilder), the content scrolls as one */
  @container (max-width: 885px) {
    .pv { flex-basis: 100%; overflow: visible; }
  }
  .cap { font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 4px; }
  .pvh { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .upd { font-size: 12px; color: var(--fg3); }
  .ph2 { display: flex; align-items: center; gap: 8px; padding: 14px 0 6px; }
  .pt { font-weight: 700; }
  .pc { font-size: 12px; color: var(--fg2); }
  .pg { padding: 4px 0 2px 16px; font-size: 12px; font-weight: 600; color: var(--fg2); }
  .pnone { padding: 2px 0 4px 16px; font-size: 12.5px; color: var(--fg2); }
  .prow { display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 4px 10px; margin-bottom: 4px; border-radius: 7px; background: var(--side); }
  .kw { flex: 0 0 auto; min-width: 52px; box-sizing: border-box; text-align: center; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 700; white-space: nowrap; }
  .pm { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ptt { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ps { font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pd { flex: 0 0 auto; font-size: 11.5px; color: var(--fg2); }
</style>
