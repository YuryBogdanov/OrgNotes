<script lang="ts">
  import { terms } from './sessions.svelte';
  import { commandLine, profiles } from './profiles.svelte';
  import type { Ctx } from '@panopticon/api';
  let { ctx }: { ctx: Ctx } = $props();
  const keyOf = (i: number) => (i < 5 ? ctx.commands.keyOf(`terminal.profile${i + 1}`) : '');
  function profileMenu(e: MouseEvent, id: string) {
    e.preventDefault();
    const p = profiles.list.find((x) => x.id === id)!;
    ctx.ui.menu(
      [
        { label: 'Изменить…', run: () => void profiles.edit(p) },
        { label: 'По умолчанию', disabled: p.isDefault, run: () => profiles.makeDefault(p.id) },
        'sep',
        { label: 'Удалить', danger: true, run: () => profiles.remove(p.id) },
      ],
      { x: e.clientX, y: e.clientY },
    );
  }

  // The section «Терминал» in the strip (ТЗ 55 §5): «Сессии» — rows of 44: the dot, the name (the active one 600 on
  // `lampsoft`), its state on the right («ждёт ввода», «ждёт ответа», «завершена · код 0»), the folder and the command
  // in IBM Plex Mono under it; a click shows it where it is. The foot — «Новая сессия ⌃⇧`».
  const DOT: Record<string, string> = { busy: 'var(--done)', idle: 'var(--wait)', bell: 'var(--wait)', ended: 'var(--ink3)' };
  const tilde = (p: string) => p.replace(/^\/Users\/[^/]+/, '~');
</script>

<div class="ts">
  <div class="cap">Сессии</div>
  {#each terms.list as s (s.id)}
    <button class="row" class:on={s === terms.active} onclick={() => terms.reveal(s)} oncontextmenu={(e) => (e.preventDefault(), terms.sessionMenu(s, { x: e.clientX, y: e.clientY }))}>
      <span class="l1"><i class="dot" class:ring={s.mood === 'bell'} style:background={DOT[s.mood]}></i><span class="nm">{s.name}</span><span class="mood">{s.moodText}</span></span>
      <span class="l2">{[s.launch.cwd ? tilde(s.launch.cwd) : 'рабочая папка', s.launch.command ?? 'оболочка'].join(' · ')}</span>
    </button>
  {:else}
    <div class="none">Сессий нет</div>
  {/each}
  <div class="cap">Профили</div>
  {#each profiles.list as p, i (p.id)}
    <button class="prow" title={p.isDefault ? 'По умолчанию' : undefined} onclick={() => void terms.byProfile(p)} oncontextmenu={(e) => profileMenu(e, p.id)}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h14v12H3zM6 8l2.5 2L6 12M10 12.5h4" /></svg>
      <span class="pn">{p.name}{#if p.isDefault}<i class="def" aria-label="по умолчанию"></i>{/if}</span>
      <span class="pk">{keyOf(i) || commandLine(p) || 'оболочка'}</span>
    </button>
  {/each}
  <button class="addp" onclick={() => void profiles.edit()}>+ Профиль…</button>
  <span class="sp"></span>
  <button class="foot" onclick={() => terms.add()}>Новая сессия<kbd>⌃⇧`</kbd></button>
</div>

<style>
  .ts { height: 100%; display: flex; flex-direction: column; gap: 1px; padding: 4px 0; color: var(--ink); font: 13px var(--ui); }
  .cap { padding: 8px 10px 4px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  .row { display: flex; flex-direction: column; justify-content: center; gap: 2px; height: 44px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); text-align: left; }
  .row:hover:not(.on) { background: var(--chip); }
  .row.on { background: var(--lampsoft); }
  .row.on .nm { font-weight: 600; }
  .l1 { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .dot { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; display: block; }
  .dot.ring { box-shadow: 0 0 0 3px color-mix(in srgb, var(--wait) 25%, transparent); }
  .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mood { font-size: 11px; color: var(--ink3); white-space: nowrap; }
  .l2 { padding-left: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 10.5px var(--mono); color: var(--ink3); }
  .prow { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: 13px var(--ui); text-align: left; }
  .prow:hover { background: var(--chip); }
  .prow svg { flex: 0 0 14px; color: var(--ink3); }
  .pn { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .def { width: 5px; height: 5px; border-radius: 3px; background: var(--lamp); display: block; }
  .pk { max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 10.5px var(--mono); color: var(--ink3); }
  .addp { align-self: flex-start; margin: 2px 10px; padding: 0; border: 0; background: none; color: var(--lampink); font: 12.5px var(--ui); }
  .addp:hover { text-decoration: underline; }
  .none { padding: 8px 10px; font-size: 12px; color: var(--ink3); }
  .sp { flex: 1; }
  .foot { display: flex; align-items: center; gap: 8px; margin: 6px 4px 0; padding: 8px 6px; border: 0; border-top: 1px solid var(--rule); background: none; color: var(--lampink); font: 12px var(--ui); text-align: left; }
  .foot kbd { margin-left: auto; font: 11px var(--mono); color: var(--ink3); }
</style>
