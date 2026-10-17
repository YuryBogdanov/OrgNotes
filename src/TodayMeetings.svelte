<script lang="ts">
  import { fmtDay } from './org';
  import type { OneOnOne } from './oneOnOne';
  import { MeetingsCtl } from './meetingsCtl.svelte';

  // «Сегодня» → «1-1 сегодня» (tech sprint 4.2, from Today.svelte): a card per meeting of the day — who, how often,
  // the last one; what the plugins add to it (the goals' line, «Разбор целей»); a new meeting note or the file. Its
  // workings are meetingsCtl.svelte.ts (the new interface draws them too).
  let { meetings, day, onopen }: { meetings: OneOnOne[]; day: Date; onopen: (path: string, line: number) => void } = $props();
  const ctl = new MeetingsCtl(() => ({ meetings, day, onopen }));
  ctl.effects();
  const extras = $derived(ctl.extras);
  const meeting = (m: OneOnOne) => ctl.meeting(m);
</script>

{#each meetings as m (m.key)}
  {@const ex = extras[m.key] ?? []}
  <section class="tcard one" aria-label="1-1 сегодня: {m.name}">
    <div class="tcard-head"><span class="tcard-name">1-1 сегодня</span>{#if m.time}<span class="tcard-sub">{m.time}</span>{/if}</div>
    <div class="who">
      <span class="av" style:background={m.color} aria-hidden="true">{m.initials}</span>
      <div class="wl"><div class="wn">{m.name}</div><div class="ws">{[m.file, m.every, m.last ? `прошлая — ${fmtDay(m.last)}` : ''].filter(Boolean).join(' · ')}</div></div>
    </div>
    {#if ex.some((e) => e.line) || m.open}
      <div class="facts">
        {#each ex.filter((e) => e.line) as e, i (i)}<div class="fact"><span class="fdot wait"></span><span>{e.line}</span></div>{/each}
        {#if m.open}<div class="fact"><span class="fdot red"></span><span>Открытые договорённости с прошлой 1-1: {m.open}</span></div>{/if}
      </div>
    {/if}
    <div class="mbtns">
      <button class="mb primary" onclick={() => void meeting(m)}>{m.today !== null ? 'Открыть встречу' : 'Новая встреча'}</button>
      <button class="mb" onclick={() => onopen(m.path, m.line)}>Открыть файл</button>
      {#each ex.filter((e) => e.action) as e, i (i)}<button class="mb" onclick={() => e.action!.run()}>{e.action!.label}</button>{/each}
    </div>
  </section>
{/each}

<style>
  .one { padding: 12px 16px; }
  .who { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
  .av { flex: 0 0 30px; width: 30px; height: 30px; border-radius: 15px; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .wl { flex: 1; min-width: 0; }
  .wn { font-weight: 600; }
  .ws { font-size: 12px; color: var(--fg2); }
  .facts { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; }
  .fact { display: flex; gap: 8px; }
  .fdot { flex: 0 0 8px; width: 8px; height: 8px; margin-top: 5px; border-radius: 4px; }
  .fdot.wait { background: var(--wait); }
  .fdot.red { background: var(--todo); }
  .mbtns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .mb { height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font: inherit; font-size: 12px; }
  .mb:hover { background: var(--field); }
  .mb.primary { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; }
</style>
