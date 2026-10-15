<script lang="ts">
  import SchemaSettings from './SchemaSettings.svelte';
  import Picker from './Picker.svelte';
  import { store } from './store.svelte';
  import { moreSchema, showSchema, today } from './todayState.svelte';
  import { todayBlockOf } from './todayBlocks';
  import { toneFor } from './org';
  import { toneStyle } from './colors';

  // «Настройки → Сегодня» (ТЗ 32 §6): ПОКАЗ, ЗАДАЧИ (chips of statuses and files), АГЕНДА И 1-1, КОНЕЦ ДНЯ, БЛОКИ (their
  // switches, the order by dragging or ⌥↑ / ⌥↓). The schema draws the plain fields; the chips and the blocks are here.
  const cfg = $derived(today.folder);
  const allStatuses = $derived([...new Set([...store.config.workflows.flatMap((w) => w.states.filter((s) => !s.done).map((s) => s.name)), ...store.files.flatMap((f) => f.wf.open)])]);
  const freeStatuses = $derived(allStatuses.filter((s) => !cfg.statuses.includes(s)));
  let adding = $state(false);
  let picking = $state(false);

  const setStatuses = (list: string[]) => void today.setFolder({ statuses: list });
  const setFiles = (list: string[]) => void today.setFolder({ files: list });

  const all = $derived(today.blocks);
  const rows = $derived(all.filter((b) => todayBlockOf(b.id)));
  let dragId = $state<string | null>(null);
  let overId = $state<string | null>(null);
  function moveBlock(id: string, to: number) {
    const list = [...all];
    const from = list.findIndex((b) => b.id === id);
    if (from < 0) return;
    const [b] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, b);
    void today.setFolder({ blocks: list });
  }
  const dropOn = (target: string) => {
    if (dragId && dragId !== target) moveBlock(dragId, all.findIndex((b) => b.id === target));
    dragId = overId = null;
  };
  function step(e: KeyboardEvent, id: string) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const shown = rows.map((r) => r.id);
    const i = shown.indexOf(id);
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= shown.length) return;
    moveBlock(id, all.findIndex((b) => b.id === shown[j]));
    requestAnimationFrame(() => (document.querySelector(`[data-grip="${id}"]`) as HTMLElement | null)?.focus());
  }
  const toggle = (id: string) => void today.setFolder({ blocks: all.map((b) => (b.id === id ? { ...b, on: !b.on } : b)) });
</script>

<div class="body">
  <section class="general" aria-label="Сегодня">
    <SchemaSettings schema={showSchema} embedded />

    <div class="cap">ЗАДАЧИ</div>
    <div class="opts">
      <div class="opt">
        <span class="olab"><span id="today-statuses">Статусы</span><small>Какие задачи показывать</small></span>
        <span class="chips" role="group" aria-labelledby="today-statuses">
          {#each cfg.statuses as s (s)}
            <span class="chip st tone" style={toneStyle(toneFor(s, store.untitledWf))}>{s}<button aria-label="Убрать статус {s}" onclick={() => setStatuses(cfg.statuses.filter((x) => x !== s))}>×</button></span>
          {/each}
          <span class="addw">
            <button class="add" aria-label="Добавить статус" disabled={!freeStatuses.length} onclick={() => (adding = !adding)}>+</button>
            {#if adding}
              <div class="menu" role="menu">
                {#each freeStatuses as s (s)}
                  <button role="menuitem" onclick={() => { setStatuses([...cfg.statuses, s]); adding = false; }}>{s}</button>
                {/each}
              </div>
            {/if}
          </span>
        </span>
      </div>
      <div class="opt">
        <span class="olab"><span id="today-files">Файлы</span><small>Откуда брать задачи</small></span>
        <span class="chips" role="group" aria-labelledby="today-files">
          {#each today.taskFiles as f (f)}
            <span class="chip file">{f}<button aria-label="Убрать файл {f}" onclick={() => setFiles(today.taskFiles.filter((x) => x !== f))}>×</button></span>
          {/each}
          <button class="add" aria-label="Добавить файл" onclick={() => (picking = true)}>+</button>
        </span>
      </div>
      <div class="opt">
        <span class="olab"><span>Просроченные из всех файлов</span><small>SCHEDULED и DEADLINE раньше сегодняшнего дня</small></span>
        <button class="switch" role="switch" aria-checked={cfg.overdueAll} aria-label="Просроченные из всех файлов" onclick={() => void today.setFolder({ overdueAll: !cfg.overdueAll })}><span></span></button>
      </div>
    </div>
    <p class="help">Хранится в папке заметок.</p>

    <SchemaSettings schema={moreSchema} embedded />

    <div class="cap">БЛОКИ <span class="cs">порядок — перетаскиванием</span></div>
    <div class="opts" role="list" aria-label="Блоки">
      {#each rows as r (r.id)}
        {@const b = todayBlockOf(r.id)!}
        <div class="opt blk" class:over={overId === r.id && dragId !== r.id} role="listitem"
          ondragover={(e) => { if (dragId) { e.preventDefault(); overId = r.id; } }}
          ondrop={(e) => { e.preventDefault(); dropOn(r.id); }}>
          <span class="grip" role="button" tabindex="0" draggable="true" data-grip={r.id} aria-label="Перетащить блок «{b.title}». Option со стрелками вверх и вниз меняет порядок"
            ondragstart={(e) => { dragId = r.id; e.dataTransfer?.setData('text/plain', r.id); }} ondragend={() => (dragId = overId = null)}
            onkeydown={(e) => step(e, r.id)}>
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.2" /><circle cx="7" cy="3" r="1.2" /><circle cx="3" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" /><circle cx="3" cy="11" r="1.2" /><circle cx="7" cy="11" r="1.2" /></svg>
          </span>
          <span class="olab grow"><span>{b.title}</span>{#if b.hint}<small>{b.hint}</small>{/if}</span>
          <button class="switch" role="switch" aria-checked={r.on} aria-label={b.title} onclick={() => toggle(r.id)}><span></span></button>
        </div>
      {/each}
    </div>
    <p class="help">Хранится в папке заметок.</p>
  </section>
</div>

{#if picking}
  <Picker label="Файл задач" onclose={() => (picking = false)} onpick={(rel) => { if (!today.taskFiles.includes(rel)) setFiles([...today.taskFiles, rel]); picking = false; }} />
{/if}

<style>
  section > :global(*) { flex-shrink: 0; }
  section { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 24px; display: flex; flex-direction: column; gap: 14px; }
  .body { flex: 1; min-height: 0; display: flex; }
  .general { max-width: 760px; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--fg2); padding: 0 6px 6px; }
  .cs { margin-left: 6px; font-weight: 400; letter-spacing: 0; color: var(--fg3); }
  .help { margin: 0; font-size: 12px; line-height: 1.5; color: var(--fg2); padding: 10px 6px; }
  .opts { display: flex; flex-direction: column; gap: 6px; }
  .opt { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 12px; background: var(--side); border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
  .olab { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .olab small { font-size: 11.5px; color: var(--fg2); }
  .grow { flex: 1; }
  .chips { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px; }
  /* capsules of the values: a status in its colour, a file in mono */
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 22px; box-sizing: border-box; padding: 0 5px 0 8px; border-radius: 4px; letter-spacing: 0.02em; background: var(--field); color: var(--fg); font-size: 12px; white-space: nowrap; }
  .chip.st { color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); font-weight: 700; }
  .chip.file { font-family: var(--mono); }
  .chip button { padding: 0; border: 0; background: none; color: inherit; opacity: 0.6; font: 12px var(--ui); line-height: 1; }
  .chip button:hover { opacity: 1; }
  .add { width: 26px; height: 22px; box-sizing: border-box; padding: 0; border: 1px dashed var(--line); border-radius: 4px; background: none; color: var(--fg2); font-size: 13px; }
  .add:disabled { opacity: 0.4; }
  .addw { position: relative; }
  .menu { position: absolute; right: 0; top: 28px; z-index: 5; min-width: 120px; display: flex; flex-direction: column; padding: 4px; background: var(--pop); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); }
  .menu button { text-align: left; height: 24px; padding: 0 8px; border: 0; border-radius: 5px; background: none; color: var(--fg); font-size: 12.5px; }
  .menu button:hover { background: var(--pacc); color: var(--onpacc); }
  .blk { justify-content: flex-start; }
  .blk.over { box-shadow: inset 0 2px 0 var(--acc); }
  .grip { display: flex; align-items: center; color: var(--fg3); cursor: grab; padding: 2px; border-radius: 4px; }
  .grip:focus-visible { outline: 2px solid var(--acc); }
</style>
