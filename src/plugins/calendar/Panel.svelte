<script lang="ts">
  import { cal as calendar } from './state.svelte';
  import { LAYERS, datedCount, toneVars, undated } from '@panopticon/api/org';

  // The navigator in the «Календарь» mode (ТЗ 24): the layers shown, the files with dated entries, the open tasks
  // without a date. Both choices are kept on this Mac (the files per notes folder).
  const hidden = $derived(new Set(calendar.hiddenNow));
  const files = $derived(calendar.dated);
  const tasks = $derived(undated(calendar.files.filter((f) => !hidden.has(f.name))));
  const base = (n: string) => n.split('/').pop()!.replace(/\.org$/, '');
  const wfOf = (path: string) => calendar.files.find((f) => f.path === path)?.wf;
  // the new interface (ТЗ 47 §1.1): ticks of 14 pt (on — `lamp`), the layer's dot after it, the files with their number
  // of entries, «БЕЗ ДАТЫ · N» as capsules; the colours of the layers by the new tokens
  const next = calendar.ctx.ui.look === 'next';
  const NEXT_COLOR: Record<string, string> = { task: 'var(--next)', deadline: 'var(--todo)', event: 'var(--lampink)', wait: 'var(--wait)', done: 'var(--done)' };
</script>

{#if next}
<nav class="ncal" aria-label="Календарь: слои и файлы">
  <div class="cap">ПОКАЗЫВАТЬ</div>
  {#each LAYERS as l (l.id)}
    <label class="ck">
      <input type="checkbox" checked={calendar.layers.includes(l.id)} onchange={(e) => calendar.setLayer(l.id, e.currentTarget.checked)} />
      <span class="dot" style="background:{NEXT_COLOR[l.id] ?? l.color}" aria-hidden="true"></span>
      <span class="nm">{l.name}</span>
    </label>
  {/each}
  <div class="cap">ФАЙЛЫ</div>
  {#each files as f (f.path)}
    <label class="ck" title={f.name}>
      <input type="checkbox" checked={!hidden.has(f.name)} onchange={(e) => calendar.setFile(f.name, e.currentTarget.checked)} />
      <span class="nm">{base(f.name)}</span>
      <span class="n">{datedCount(f)}</span>
    </label>
  {:else}
    <p class="hint">Дат в файлах пока нет.</p>
  {/each}
  {#if calendar.cfg.undated}
    <div class="cap">БЕЗ ДАТЫ · {tasks.length}</div>
    {#each tasks as t (t.path + t.line)}
      <button class="ud" class:picked={calendar.isPicked({ path: t.path, line: t.line, layer: 'undated' })} title="{t.title} — {base(t.file)} · перетащите на день" draggable="true"
        onclick={(ev) => (ev.metaKey ? calendar.openEntry(t, true) : calendar.pick({ path: t.path, line: t.line, layer: 'undated' }))}
        ondblclick={() => calendar.openEntry(t)} oncontextmenu={(ev) => calendar.menuOf(ev, { path: t.path, line: t.line, layer: 'undated' })}
        ondragstart={(e) => { calendar.drag = { path: t.path, line: t.line, layer: 'undated', repeat: false, title: t.title, dy: 0 }; e.dataTransfer?.setData('text/plain', t.title); }}
        ondragend={() => (calendar.drag = null)}>
        <span class="kw tone-chip" style={wfOf(t.path) ? toneVars(t.keyword, wfOf(t.path)!) : ''}>{t.keyword}</span>
        <span class="t">{t.priority ? `[#${t.priority}] ` : ''}{t.title}</span>
      </button>
    {:else}
      <p class="hint">Все открытые задачи с датой.</p>
    {/each}
  {/if}
</nav>
{:else}

<nav class="calnav" aria-label="Календарь: слои и файлы">
  <div class="cap">ПОКАЗЫВАТЬ</div>
  {#each LAYERS as l (l.id)}
    <label class="ck">
      <input type="checkbox" checked={calendar.layers.includes(l.id)} onchange={(e) => calendar.setLayer(l.id, e.currentTarget.checked)} />
      <span class="nm">{l.name}</span>
      <span class="dot" style="background:{l.color}" aria-hidden="true"></span>
    </label>
  {/each}
  <div class="cap">ФАЙЛЫ</div>
  {#each files as f (f.path)}
    <label class="ck" title={f.name}>
      <input type="checkbox" checked={!hidden.has(f.name)} onchange={(e) => calendar.setFile(f.name, e.currentTarget.checked)} />
      <span class="nm">{base(f.name)}</span>
    </label>
  {:else}
    <p class="hint">Дат в файлах пока нет.</p>
  {/each}
  {#if calendar.cfg.undated}
  <div class="cap">БЕЗ ДАТЫ</div>
  {#each tasks as t (t.path + t.line)}
    <button class="ud" class:picked={calendar.isPicked({ path: t.path, line: t.line, layer: 'undated' })} title="{t.title} — {base(t.file)}" draggable="true"
      onclick={(ev) => (ev.metaKey ? calendar.openEntry(t, true) : calendar.pick({ path: t.path, line: t.line, layer: 'undated' }))}
      ondblclick={() => calendar.openEntry(t)} oncontextmenu={(ev) => calendar.menuOf(ev, { path: t.path, line: t.line, layer: 'undated' })}
      ondragstart={(e) => { calendar.drag = { path: t.path, line: t.line, layer: 'undated', repeat: false, title: t.title, dy: 0 }; e.dataTransfer?.setData('text/plain', t.title); }}
      ondragend={() => (calendar.drag = null)}>
      <span class="kw tone-chip" style={wfOf(t.path) ? toneVars(t.keyword, wfOf(t.path)!) : ''}>{t.keyword}</span>
      <span class="t">{t.priority ? `[#${t.priority}] ` : ''}{t.title}</span>
    </button>
  {:else}
    <p class="hint">Все открытые задачи с датой.</p>
  {/each}
  {#if tasks.length}<p class="hint drag">Перетащите задачу на нужный день</p>{/if}
  {/if}
</nav>
{/if}

<style>
  .ncal { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; padding: 4px 4px 16px; color: var(--ink); font: 12.5px var(--ui); }
  .ncal .cap { padding: 14px 6px 6px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.05em; color: var(--ink3); }
  .ncal .cap:first-child { padding-top: 2px; }
  .ncal .ck { height: 28px; gap: 8px; padding: 0 6px; border-radius: 7px; font-size: 12.5px; }
  .ncal .ck:hover { background: var(--chip); }
  .ncal .ck input { appearance: none; -webkit-appearance: none; flex: 0 0 14px; width: 14px; height: 14px; margin: 0; border: 1.5px solid var(--ink3); border-radius: 4px; background: transparent; display: grid; place-content: center; }
  .ncal .ck input:checked { border-color: var(--lamp); background: var(--lamp); }
  .ncal .ck input:checked::after { content: ''; width: 7px; height: 4px; margin-top: -2px; border-left: 1.8px solid var(--onlamp); border-bottom: 1.8px solid var(--onlamp); transform: rotate(-45deg); }
  .ncal .ck input:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
  .ncal .dot { flex: 0 0 8px; }
  .ncal .n { font-size: 11px; color: var(--ink3); font-variant-numeric: tabular-nums; }
  .ncal .ud { min-height: 30px; margin-top: 3px; padding: 4px 8px; border-color: var(--rule); border-radius: 8px; background: var(--card); color: var(--ink); font: 12.5px var(--ui); }
  .ncal .ud.picked { border-color: var(--lampline); box-shadow: inset 0 0 0 1px var(--lampline); }
  .ncal .kw { font: 600 10px var(--font-mono, ui-monospace, monospace); }
  .ncal .hint { color: var(--ink3); font-size: 11.5px; padding: 2px 6px; }
  .calnav { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 2px; padding: 12px 12px 16px; }
  .cap { padding: 12px 4px 4px; font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .cap:first-child { padding-top: 0; }
  .ck { display: flex; align-items: center; gap: 9px; height: 26px; padding: 0 4px; font-size: 13px; }
  .ck input { width: 15px; height: 15px; margin: 0; accent-color: var(--acc); }
  .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 4px; }
  .ud { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 4px 8px; margin-top: 4px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); text-align: left; }
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hint { margin: 0; padding: 2px 4px; font-size: 11.5px; color: var(--fg2); }
  .hint.drag { padding-top: 6px; color: var(--fg3); }
  .ud[draggable='true'] { cursor: grab; }
  .ud.picked { border-color: var(--acc); box-shadow: inset 0 0 0 1px var(--acc); }
</style>
