<script lang="ts">
  import { onMount } from 'svelte';
  import { moved } from '../pointer';
  import { store } from '../store.svelte';
  import { toneFor } from '../org';
  import { toneOf, toneStyle } from '../colors';
  import { NAMED, NAMED_RU } from '../themes';
  import { displayName } from '../names';
  import { valueKind } from '../builderOptions';
  import { AgendaBuilderCtl } from '../agendaBuilderCtl.svelte';
  import { GROUPS, SORTS, fieldLabel, incomplete, noValue, opLabel, plural, query, runAgenda, shortDay, summary, tasksCount, valueWords, type Block, type Cond } from '../agendas';

  // «Конструктор агенды» in the new interface (ТЗ 48 §5): a tab «<Агенда> — правка», not a sheet — the files can be
  // looked into while the conditions are made. The header — «КОНСТРУКТОР АГЕНДЫ», the colour's dot and the name in
  // Yeseva One 36 edited in place, «Отмена», «Сохранить ⌘S»; «Источники: [все файлы ▾] · архивы не входят»; the
  // blocks — rows of 44 pt on `card`, the grip, the dot, the name and its conditions in IBM Plex Mono, the number, «›»;
  // the open one framed `lampline`: the phrase, the conditions (the field ▾, the operator ▾, the values as chips with
  // «×», «×» of the condition), «+ условие», the grouping, the order, the limit, the query; «+ Блок» dashed. On the
  // right «Предпросмотр», 340 pt: the open block's tasks as the agenda's rows, all of them with none open.
  // Its workings — agendaBuilderCtl.svelte.ts; ⌘S keeps the tab, closing it unsaved asks (the store's sheet).
  let root = $state<HTMLElement>();
  let nameEl = $state<HTMLInputElement>();
  const b0 = store.builder!;
  const isNew = !b0.orig;
  const c = new AgendaBuilderCtl(b0.draft, () => root);
  const draft = c.draft;
  c.open = draft.blocks[0]?.id ?? '';
  const dot = (b: Block) => toneStyle(toneOf(b.color) ?? toneOf('blue')!);
  const preview = $derived(runAgenda(draft, store.files, c.today, 60));
  const shown = $derived(c.open ? preview.filter((r) => r.block.id === c.open) : preview);
  const countOf = (b: Block) => preview.find((r) => r.block.id === b.id)?.total ?? 0;
  onMount(() => {
    if (isNew) queueMicrotask(() => (nameEl?.focus(), nameEl?.select()));
    store.builderSaveFn = () => c.save(nameEl);
    return () => {
      if (store.builderSaveFn) store.builderSaveFn = null;
    };
  });
  // ⌘S (the menu bar's «Сохранить», the shortcut)
  let saves = store.builderSave;
  $effect(() => {
    if (store.builderSave !== saves) {
      saves = store.builderSave;
      void c.save(nameEl);
    }
  });
  /** «Отмена»: the tab closes (asking, when there is something unsaved). */
  function cancel() {
    const p = store.layout.panes[0];
    const i = p?.tabs.findIndex((t) => t.kind === 'agenda.edit') ?? -1;
    if (i >= 0) void store.closeTab(0, i);
  }
  let palette = $state<{ block: Block; x: number; y: number } | null>(null);
  function removeValue(cond: Cond, w: string) {
    if (!cond.values) return;
    const words = valueWords(cond);
    const i = words.indexOf(w);
    if (i >= 0) cond.values = cond.values.filter((_, k) => k !== i);
  }
  const chev = 'M2 4.5l4 4 4-4';
  const sourcesWord = $derived(draft.sources.length ? draft.sources.map((s) => displayName(s)).join(', ') : 'все файлы');
  const fileOf = (i: number) => displayName(store.files[i]?.name ?? '');
  const dateOf = (t: { scheduled?: { y: number; m: number; d: number }; deadline?: { y: number; m: number; d: number } }) => {
    const d = t.scheduled ?? t.deadline;
    return d ? shortDay(d as never) : '';
  };
</script>

{#snippet chevron()}<svg class="chev" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={chev} /></svg>{/snippet}
{#snippet grip(b: Block)}
  <span class="grip" role="button" tabindex="0" use:c.drag.handle={{ id: b.id }} data-grip={b.id} aria-label="Перетащить блок «{b.name}». Option со стрелками меняет порядок"
    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" onkeydown={(e) => c.gripKey(e, b)} onclick={(e) => e.stopPropagation()}>
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 5h.01M13 5h.01M7 10h.01M13 10h.01M7 15h.01M13 15h.01" /></svg>
  </span>
{/snippet}

<div class="ab" bind:this={root} role="region" aria-label="Конструктор агенды">
  <div class="ed">
    <header>
      <div class="ttl">
        <div class="kick">Конструктор агенды</div>
        <div class="nrow">
          <span class="ndot tone-bg" style={dot(draft.blocks[0] ?? ({ color: 'blue' } as Block))} aria-hidden="true"></span>
          <input class="name" class:bad={!!c.problem} bind:this={nameEl} bind:value={draft.name} aria-label="Название агенды" aria-invalid={!!c.problem} spellcheck="false" autocomplete="off" />
        </div>
        {#if c.problem}<span class="err" role="alert">{c.problem}</span>{/if}
      </div>
      <div class="tools">
        <button class="b" onclick={cancel}>Отмена</button>
        <button class="b main" disabled={!!c.problem} onclick={() => void c.save(nameEl)}>Сохранить <span class="k">{store.keyHint('save') || '⌘S'}</span></button>
      </div>
    </header>

    <div class="src">
      <span>Источники:</span>
      <button class="chip" aria-haspopup="listbox" aria-label="Источники: {sourcesWord}" onclick={(e) => c.openPop('sources', draft.blocks[0], e.currentTarget)}>{sourcesWord}{@render chevron()}</button>
      {#each draft.sources.filter((s) => !c.exists(s)) as s (s)}<span class="gone" title="«{s}» не найден">⚠ {displayName(s)}</span>{/each}
      <span class="note">· архивы не входят</span>
    </div>

    <div class="blocks">
      {#each draft.blocks as b (b.id)}
        <div class="bwrap" class:over={c.drag.overId === b.id && c.drag.dragId !== b.id} use:c.drag.zone={b.id}>
          {#if c.open !== b.id}
            <div class="block" data-block={b.id} role="button" tabindex="0" aria-expanded="false" aria-label="Блок «{b.name}»: {summary(b)}"
              onclick={() => (c.open = b.id)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), (c.open = b.id))}>
              {@render grip(b)}
              <span class="dot tone-bg" style={dot(b)}></span>
              <span class="bt"><span class="bn">{b.name || 'Без названия'}</span><span class="sum" class:red={c.showErrors && b.conds.some(incomplete)}>{summary(b)}</span></span>
              <span class="n">{countOf(b)}</span><span class="more" aria-hidden="true">›</span>
            </div>
          {:else}
            <div class="block open" data-block={b.id}>
              <div class="bh">
                {@render grip(b)}
                <button class="dotbtn" aria-label="Цвет блока" aria-haspopup="menu" onclick={(e) => { const r = e.currentTarget.getBoundingClientRect(); palette = { block: b, x: r.left, y: r.bottom + 4 }; }}><span class="dot tone-bg" style={dot(b)}></span></button>
                <input class="bname" data-bname={b.id} aria-label="Название блока" bind:value={b.name} spellcheck="false" autocomplete="off" />
                <button class="ib" aria-label="Удалить блок" disabled={draft.blocks.length < 2} onclick={() => c.removeBlock(b)}>
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" /></svg>
                </button>
                <button class="ib" aria-label="Свернуть блок" aria-expanded="true" onclick={() => (c.open = '')}>⌄</button>
              </div>
              <div class="phrase">Показывать задачи, у которых <b>выполняются все условия ▾</b></div>
              {#each b.conds as cd (cd.id)}
                {@const words = valueWords(cd)}
                <div class="cond" role="group" aria-label="Условие: {fieldLabel(cd.field)}">
                  <button class="slot" aria-haspopup="listbox" aria-label="Поле: {fieldLabel(cd.field)}" onclick={(e) => c.openPop('field', b, e.currentTarget, cd)}>{fieldLabel(cd.field)}{@render chevron()}</button>
                  <button class="slot" aria-haspopup="listbox" aria-label="Оператор: {opLabel(cd.field, cd.op)}" onclick={(e) => c.openPop('op', b, e.currentTarget, cd)}>{opLabel(cd.field, cd.op)}{@render chevron()}</button>
                  {#if cd.field === 'title'}
                    <input class="val text" class:bad={c.showErrors && incomplete(cd)} data-val={cd.id} aria-label="Текст в заголовке" placeholder="текст" bind:value={cd.text} spellcheck="false" autocomplete="off" />
                  {:else if cd.field === 'touched'}
                    <span class="days"><input class="val num" class:bad={c.showErrors && incomplete(cd)} data-val={cd.id} type="number" min="1" step="1" aria-label="Дней" placeholder="30"
                      value={cd.days ?? ''} oninput={(e) => (cd.days = e.currentTarget.value ? Math.max(1, Math.floor(+e.currentTarget.value)) : undefined)} /><span>{cd.days ? plural(cd.days, 'день', 'дня', 'дней') : 'дней'}</span></span>
                  {:else if noValue(cd)}
                    <span class="sp"></span>
                  {:else}
                    <span class="vals">
                      {#each words as w (w)}<span class="vchip">{w}{#if cd.values && cd.values.length > 1}<button aria-label="Убрать «{w}»" onclick={() => removeValue(cd, w)}>×</button>{/if}</span>{/each}
                      <button class="vadd" class:bad={c.showErrors && incomplete(cd)} data-val={cd.id} aria-haspopup="listbox" aria-label="Значение: {words.join(', ') || 'не выбрано'}"
                        onclick={(e) => c.openPop(valueKind(cd.field), b, e.currentTarget, cd)}>{words.length ? '▾' : c.showErrors ? 'выберите значение' : 'выбрать…'}</button>
                    </span>
                  {/if}
                  <button class="x" aria-label="Убрать условие" onclick={() => b.conds.splice(b.conds.indexOf(cd), 1)}>×</button>
                </div>
              {/each}
              <button class="addc" aria-haspopup="menu" onclick={(e) => c.openPop('add', b, e.currentTarget)}>+ условие</button>
              <div class="opts">
                <span class="of"><span>Группировка</span><button class="slot" aria-haspopup="listbox" onclick={(e) => c.openPop('group', b, e.currentTarget)}>{GROUPS.find((g) => g.id === b.group)?.label}{@render chevron()}</button></span>
                <span class="of"><span>Сортировка</span><button class="slot" aria-haspopup="listbox" onclick={(e) => c.openPop('sort', b, e.currentTarget)}>{SORTS.find((s) => s.id === b.sort)?.label}{@render chevron()}</button></span>
                <label class="of"><span>Лимит</span><input class="limit" inputmode="numeric" placeholder="нет" value={b.limit ?? ''} autocomplete="off"
                  oninput={(e) => { const v = e.currentTarget.value.replace(/\D/g, '').replace(/^0+/, ''); e.currentTarget.value = v; b.limit = v ? Math.min(+v, 9999) : null; }} /></label>
              </div>
              <div class="query" aria-label="Запрос">{query(b)}</div>
            </div>
          {/if}
        </div>
      {/each}
      <div class="bend" class:over={c.drag.overId === 'end'} use:c.drag.zone={'end'}></div>
      <button class="addb" onclick={() => void c.addBlock()}>+ Блок</button>
    </div>
  </div>

  <aside class="pv" aria-label="Предпросмотр">
    <div class="pvh">Предпросмотр</div>
    {#each shown as r (r.block.id)}
      <div class="ph"><span class="dot tone-bg" style={dot(r.block)}></span><b>{r.block.name || 'Без названия'}</b><span class="n">{tasksCount(r.total)}</span></div>
      {#if !r.total}<p class="none">нет задач</p>{/if}
      {#each r.groups as g (g.key)}
        {#if g.title}<div class="pg">{g.title}</div>{/if}
        {#each g.tasks as t (t.file + ':' + t.line)}
          {@const f = store.files[t.file]}
          <div class="prow">
            <span class="cap" style={f ? toneStyle(toneFor(t.kw, f.wf)) : ''}>{t.kw}</span>
            <span class="pm"><span class="pt">{t.title}</span><span class="pf">{fileOf(t.file)}</span></span>
            <span class="pd">{dateOf(t)}</span>
          </div>
        {/each}
      {/each}
      {#if r.more}<p class="none">и ещё {r.more}</p>{/if}
    {/each}
  </aside>
</div>

{#if c.pop}
  {@const pop = c.pop}
  {@const r = pop.anchor.getBoundingClientRect()}
  {@const w = pop.kind === 'path' || pop.kind === 'sources' ? 300 : pop.kind === 'date' ? 240 : 220}
  {@const below = window.innerHeight - r.bottom > 260 || r.top < window.innerHeight / 2}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" onmousedown={() => c.closePop(true, false)}></div>
  <div class="pop" bind:this={c.popEl} role={pop.kind === 'add' ? 'menu' : 'listbox'} tabindex="-1" aria-multiselectable={c.isMulti || undefined}
    aria-label={pop.kind === 'add' ? 'Поле условия' : pop.kind === 'sources' ? 'Источники' : 'Значение'} onkeydown={(e) => c.popKey(e)}
    style="left:{Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px;min-width:{w}px;{below ? `top:${r.bottom + 4}px;max-height:${window.innerHeight - r.bottom - 16}px` : `bottom:${window.innerHeight - r.top + 4}px;max-height:${r.top - 16}px`}">
    {#if c.searchable}
      <input class="search" bind:value={c.filter} spellcheck="false" autocomplete="off" placeholder={pop.kind === 'status' ? 'Найти статус' : pop.kind === 'tag' ? 'Найти или добавить тег' : 'Найти файл или папку'} aria-label="Найти" />
    {/if}
    {#if c.form === 'next'}
      <div class="form">
        <label>Ближайшие <input type="number" min="1" max="3650" bind:value={c.formN} aria-label="Число дней" /> дней</label>
        <div class="fb"><button onclick={() => (c.form = null)}>Назад</button><button class="main" onclick={() => c.submitForm()}>Готово</button></div>
      </div>
    {:else if c.form === 'range'}
      <div class="form">
        <label>С <input type="date" bind:value={c.formFrom} aria-label="С даты" /></label>
        <label>по <input type="date" bind:value={c.formTo} aria-label="По дату" /></label>
        <div class="fb"><button onclick={() => (c.form = null)}>Назад</button><button class="main" onclick={() => c.submitForm()}>Готово</button></div>
      </div>
    {:else}
      {#each c.opts as o (o.id)}
        {#if o.head}
          <div class="gh"><span>{o.label}</span><span>{o.count}</span></div>
        {:else}
          {@const i = c.items.indexOf(o)}
          <div class="opt" class:hi={i === c.hi} role={pop.kind === 'add' ? 'menuitem' : 'option'} aria-selected={c.checked(o.id)} data-opt={o.id}
            style="padding-left:{10 + (o.depth ?? 0) * 14}px" onmousemove={(e) => moved(e) && (c.hi = i)} onclick={() => void c.choose(o)}>
            <span class="ck">{c.checked(o.id) ? '✓' : ''}</span>
            {#if o.tone}<span class="sdot tone-bg" style={o.tone}></span>{/if}
            <span class="ol">{o.label}</span>{#if o.hint}<span class="oh">{o.hint}</span>{/if}
          </div>
        {/if}
      {:else}
        <div class="empty">{pop.kind === 'tag' ? 'Тегов пока нет — введите новый' : 'Ничего не найдено'}</div>
      {/each}
      {#if c.isMulti}<div class="pf">Space отмечает, ↩ подтверждает, ⎋ отменяет</div>{/if}
    {/if}
  </div>
{/if}

{#if palette}
  {@const pl = palette}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" onmousedown={() => (palette = null)}></div>
  <div class="pop colors" role="menu" aria-label="Цвет блока" style="left:{pl.x}px;top:{pl.y}px">
    {#each NAMED as n (n)}
      <button role="menuitem" aria-label={NAMED_RU[n]} title={NAMED_RU[n]} class:on={pl.block.color === n} onclick={() => { pl.block.color = n; palette = null; }}><span class="dot tone-bg" style={toneStyle(toneOf(n)!)}></span></button>
    {/each}
  </div>
{/if}

<style>
  .ab { flex: 1; min-height: 0; display: flex; background: var(--bg); color: var(--ink); font: 13px var(--ui); }
  .ed { flex: 1 1 auto; min-width: 0; overflow: auto; padding: 26px 32px 32px; display: flex; flex-direction: column; gap: 16px; }
  header { display: flex; align-items: flex-end; gap: 16px; }
  .ttl { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .kick { font: 500 11px var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink3); }
  .nrow { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .ndot { flex: 0 0 12px; width: 12px; height: 12px; border-radius: 6px; }
  .name { flex: 1; min-width: 0; padding: 0; border: 0; border-bottom: 1px dashed transparent; background: none; outline: none; color: var(--ink); font: 400 36px/1.1 var(--title); caret-color: var(--lamp); }
  .name:hover, .name:focus { border-bottom-color: var(--lampline); }
  .name.bad { border-bottom-color: var(--todo); }
  .err { font-size: 12px; color: var(--todo); }
  .tools { display: flex; gap: 8px; }
  .b { height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 13px var(--ui); white-space: nowrap; }
  .b.main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .b:disabled { opacity: 0.45; }
  .k { font: 11px var(--mono); opacity: 0.65; margin-left: 4px; }
  .src { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 13px; color: var(--ink2); }
  .chip { height: 26px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); }
  .gone { font-size: 12px; color: var(--wait); }
  .note { color: var(--ink3); }
  .blocks { display: flex; flex-direction: column; gap: 8px; }
  .bwrap.over { box-shadow: 0 -2px 0 var(--lamp); border-radius: 10px; }
  .block { min-height: 44px; display: flex; align-items: center; gap: 10px; padding: 6px 12px 6px 6px; box-sizing: border-box; border: 1px solid var(--rule); border-radius: 10px; background: var(--card); text-align: left; cursor: default; }
  .block:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
  .block.open { flex-direction: column; align-items: stretch; gap: 10px; padding: 10px 14px 14px; border: 1.5px solid var(--lampline); }
  .grip { flex: 0 0 auto; display: flex; padding: 4px; border-radius: 5px; color: var(--ink3); cursor: grab; }
  .dot { flex: 0 0 10px; width: 10px; height: 10px; border-radius: 5px; }
  .bt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .bn { font-size: 13.5px; font-weight: 600; }
  .sum { font: 10.5px var(--mono); color: var(--ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sum.red { color: var(--todo); }
  .n { font-size: 12px; color: var(--ink3); font-variant-numeric: tabular-nums; }
  .more { color: var(--ink3); }
  .bh { display: flex; align-items: center; gap: 8px; margin-left: -8px; }
  .dotbtn { display: flex; padding: 5px; border: 0; border-radius: 6px; background: none; }
  .dotbtn:hover { background: var(--chip); }
  .bname { flex: 1; min-width: 0; height: 28px; padding: 0 6px; border: 0; border-radius: 6px; background: none; outline: none; color: var(--ink); font: 600 14px var(--ui); }
  .bname:focus { background: var(--field); box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .ib { width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 6px; background: none; color: var(--ink3); font-size: 13px; }
  .ib:hover:not(:disabled) { background: var(--chip); color: var(--ink); }
  .ib:disabled { opacity: 0.35; }
  .phrase { font-size: 13px; color: var(--ink2); }
  .phrase b { font-weight: 600; color: var(--ink); }
  .cond { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .slot { height: 28px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--field); color: var(--ink); font: 12.5px var(--ui); }
  .chev { color: var(--ink3); }
  .vals { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .vchip { height: 24px; display: inline-flex; align-items: center; gap: 2px; padding: 0 4px 0 8px; border-radius: 6px; background: var(--chip2); font-size: 12px; }
  .vchip button { border: 0; background: none; color: var(--ink3); padding: 0 4px; font-size: 13px; }
  .vadd { height: 24px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: var(--ink3); font: 12px var(--ui); }
  .vadd:hover { background: var(--chip); }
  .vadd.bad, .val.bad { color: var(--todo); box-shadow: inset 0 0 0 1.5px var(--todo); }
  .val { height: 28px; padding: 0 8px; border: 0; border-radius: 7px; background: var(--field); color: var(--ink); font: 12.5px var(--ui); outline: none; }
  .val.text { flex: 1; min-width: 120px; }
  .val.num { width: 64px; }
  .days { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink2); }
  .sp { flex: 1; }
  .x { margin-left: auto; width: 24px; height: 24px; border: 0; border-radius: 6px; background: none; color: var(--ink3); font-size: 15px; }
  .x:hover { background: var(--chip); color: var(--ink); }
  .addc { align-self: flex-start; padding: 2px 0; border: 0; background: none; color: var(--lampink); font: 12.5px var(--ui); }
  .opts { display: flex; flex-wrap: wrap; gap: 8px 18px; padding-top: 10px; border-top: 1px solid var(--rule); }
  .of { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink2); }
  .limit { width: 64px; height: 28px; padding: 0 8px; border: 0; border-radius: 7px; background: var(--field); color: var(--ink); font: 12.5px var(--ui); outline: none; }
  .query { padding: 8px 10px; border-radius: 7px; background: var(--chip); font: 11px/1.45 var(--mono); color: var(--ink2); overflow-wrap: anywhere; }
  .bend { height: 6px; }
  .bend.over { box-shadow: 0 -2px 0 var(--lamp); }
  .addb { height: 40px; border: 1.5px dashed var(--rule); border-radius: 10px; background: none; color: var(--lampink); font: 13px var(--ui); }
  .addb:hover { border-color: var(--lampline); }
  .pv { flex: 0 0 340px; min-height: 0; overflow: auto; box-sizing: border-box; padding: 26px 20px; border-left: 1px solid var(--rule); background: var(--panel); }
  .pvh { margin-bottom: 14px; font: 600 11px var(--ui); color: var(--ink3); }
  .ph { display: flex; align-items: center; gap: 8px; margin: 14px 0 6px; font-size: 13px; }
  .ph:first-of-type { margin-top: 0; }
  .ph .n { margin-left: auto; }
  .pg { margin: 8px 0 2px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  .prow { min-height: 44px; display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--rule); }
  .cap { flex: 0 0 auto; display: inline-block; padding: 0 6px; border-radius: 4px; font: 700 10px/18px var(--ui); color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .pm { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .pt { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pf { font-size: 11px; color: var(--ink3); }
  .pd { font: 11px var(--mono); color: var(--ink3); white-space: nowrap; }
  .none { margin: 4px 0; color: var(--ink3); font-size: 12px; }
  .scrim { position: fixed; inset: 0; z-index: 90; }
  .pop { position: fixed; z-index: 91; overflow: auto; box-sizing: border-box; padding: 5px; border: 1px solid var(--rule); border-radius: 10px; background: var(--card); box-shadow: var(--popshadow); color: var(--ink); font: 13px var(--ui); outline: none; }
  .search { width: 100%; box-sizing: border-box; height: 28px; margin-bottom: 4px; padding: 0 8px; border: 0; border-radius: 7px; background: var(--field); color: var(--ink); font: 12.5px var(--ui); outline: none; }
  .opt { min-height: 28px; display: flex; align-items: center; gap: 8px; padding-right: 10px; border-radius: 6px; cursor: default; }
  .opt.hi { background: var(--lamp); color: var(--onlamp); }
  .opt.hi .oh { color: var(--onlamp); }
  .ck { flex: 0 0 12px; font-size: 11px; }
  .sdot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 4px; }
  .ol { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .oh { font-size: 11px; color: var(--ink3); }
  .gh { display: flex; justify-content: space-between; padding: 6px 10px 2px; font: 600 10.5px var(--ui); color: var(--ink3); text-transform: uppercase; letter-spacing: 0.04em; }
  .empty, .pf { padding: 6px 10px; font-size: 11.5px; color: var(--ink3); }
  .form { display: flex; flex-direction: column; gap: 8px; padding: 6px; font-size: 12.5px; }
  .form input { height: 26px; padding: 0 6px; border: 0; border-radius: 6px; background: var(--field); color: var(--ink); font: 12.5px var(--ui); }
  .fb { display: flex; justify-content: flex-end; gap: 6px; }
  .fb button { height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink); font: 12px var(--ui); }
  .fb .main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .colors { display: flex; gap: 2px; }
  .colors button { width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 6px; background: none; }
  .colors button:hover, .colors button.on { background: var(--chip); }
</style>
