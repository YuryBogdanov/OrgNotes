<script lang="ts">
  import { store } from '../store.svelte';
  import { Reorder } from '../reorder.svelte';
  import { moreSchema, showSchema, today } from '../todayState.svelte';
  import { todayBlockOf } from '../todayBlocks';
  import { toneFor } from '../org';
  import { toneStyle } from '../colors';
  import { setLayer } from '../settingsNav.svelte';
  import SetSchema from './SetSchema.svelte';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Menu from './ui/Menu.svelte';
  import PlacePalette from './PlacePalette.svelte';

  // «Настройки → Сегодня» of the new interface (ТЗ 54 §2, ТЗ 32 §6): «Показ» and «Ещё» by their schemas; «Задачи» —
  // the statuses and the files as chips (+ a menu, + the palette's files), the overdue ones; «Блоки» — on or off,
  // the order by dragging or ⌥↑↓.
  const cfg = $derived(today.folder);
  const allStatuses = $derived([...new Set([...store.config.workflows.flatMap((w) => w.states.filter((s) => !s.done).map((s) => s.name)), ...store.files.flatMap((f) => f.wf.open)])]);
  const freeStatuses = $derived(allStatuses.filter((s) => !cfg.statuses.includes(s)));
  let adding = $state<{ x: number; y: number } | null>(null);
  let picking = $state(false);
  $effect(() => setLayer('today', !!(adding || picking)));
  $effect(() => () => setLayer('today', false));
  const setStatuses = (list: string[]) => void today.setFolder({ statuses: list });
  const setFiles = (list: string[]) => void today.setFolder({ files: list });

  const all = $derived(today.blocks);
  const rows = $derived(all.filter((b) => todayBlockOf(b.id)));
  function moveBlock(id: string, to: number) {
    const list = [...all];
    const from = list.findIndex((b) => b.id === id);
    if (from < 0) return;
    const [b] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, b);
    void today.setFolder({ blocks: list });
  }
  const drag = new Reorder((id, target) => void (id !== target && moveBlock(id, all.findIndex((b) => b.id === target))));
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

<SetSchema schema={showSchema} />
<Group caption="Задачи">
  <Row label="Статусы" hint="Какие задачи показывать" id="td-statuses">
    <span class="chips" role="group" aria-labelledby="td-statuses">
      {#each cfg.statuses as s (s)}
        <span class="cap tone-chip" style={toneStyle(toneFor(s, store.untitledWf))}>{s}<button aria-label="Убрать статус {s}" onclick={() => setStatuses(cfg.statuses.filter((x) => x !== s))}>×</button></span>
      {/each}
      <button class="add" aria-label="Добавить статус" disabled={!freeStatuses.length} onclick={(e) => { const r = e.currentTarget.getBoundingClientRect(); adding = { x: r.left, y: r.bottom + 4 }; }}>+</button>
    </span>
  </Row>
  <Row label="Файлы" hint="Откуда брать задачи" id="td-files">
    <span class="chips" role="group" aria-labelledby="td-files">
      {#each today.taskFiles as f (f)}
        <span class="chip">{f}<button aria-label="Убрать файл {f}" onclick={() => setFiles(today.taskFiles.filter((x) => x !== f))}>×</button></span>
      {/each}
      <button class="add" aria-label="Добавить файл" onclick={() => (picking = true)}>+</button>
    </span>
  </Row>
  <Row label="Просроченные из всех файлов" hint="SCHEDULED и DEADLINE раньше сегодняшнего дня" id="td-overdue">
    <Toggle checked={cfg.overdueAll} labelledby="td-overdue" onchange={() => void today.setFolder({ overdueAll: !cfg.overdueAll })} />
  </Row>
</Group>
<SetSchema schema={moreSchema} />
<Group caption="Блоки" note="порядок — перетаскиванием или ⌥↑↓">
  {#each rows as r (r.id)}
    {@const b = todayBlockOf(r.id)!}
    <div class="blk" class:over={drag.overId === r.id && drag.dragId !== r.id} role="listitem" use:drag.zone={r.id}>
      <span class="grip" role="button" tabindex="0" use:drag.handle={{ id: r.id }} data-grip={r.id} aria-label="Перетащить блок «{b.title}». Option со стрелками вверх и вниз меняет порядок"
        onkeydown={(e) => step(e, r.id)}>⋮⋮</span>
      <span class="tx"><span class="nm">{b.title}</span>{#if b.hint}<span class="hint">{b.hint}</span>{/if}</span>
      <Toggle checked={r.on} label={b.title} onchange={() => toggle(r.id)} />
    </div>
  {/each}
</Group>

{#if adding}
  <Menu x={adding.x} y={adding.y} width={180} label="Статус" items={freeStatuses.map((s) => ({ label: s, capsule: toneStyle(toneFor(s, store.untitledWf)), action: () => setStatuses([...cfg.statuses, s]) }))} onclose={() => (adding = null)} />
{/if}
{#if picking}
  <PlacePalette kind="file" title="Файл задач" token="Файл задач" placeholder="Найти файл" recent={store.refileRecentFiles('')} onclose={() => (picking = false)}
    onpick={(x) => {
      const rel = store.files.find((y) => y.path === x.path)?.name;
      if (!rel) return 'Файл не найден';
      if (!today.taskFiles.includes(rel)) setFiles([...today.taskFiles, rel]);
      picking = false;
    }} />
{/if}

<style>
  .chips { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px; max-width: 420px; }
  .cap, .chip { display: inline-flex; align-items: center; gap: 2px; height: 22px; padding: 0 3px 0 7px; border-radius: 5px; white-space: nowrap; }
  .cap { font: 700 10.5px var(--ui); letter-spacing: 0.02em; }
  .chip { background: var(--chip); color: var(--ink2); font: 12px var(--ui); }
  .cap button, .chip button { width: 16px; height: 16px; padding: 0; border: 0; background: none; color: inherit; opacity: 0.6; font-size: 13px; line-height: 1; }
  .add { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 5px; outline: 1px dashed var(--rule); outline-offset: -1px; background: transparent; color: var(--ink3); font-size: 14px; line-height: 1; }
  .add:disabled { opacity: 0.4; }
  .blk { display: flex; align-items: center; gap: 12px; min-height: 46px; box-sizing: border-box; padding: 8px 16px; }
  .blk + .blk { border-top: 1px solid var(--rule); }
  .blk.over { box-shadow: inset 0 2px 0 var(--lamp); }
  .grip { color: var(--ink3); font-size: 12px; letter-spacing: -2px; cursor: grab; outline: none; -webkit-user-select: none; user-select: none; }
  .grip:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
  .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .nm { font-size: 13.5px; }
  .hint { font-size: 12px; color: var(--ink3); }
</style>
