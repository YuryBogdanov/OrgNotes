<script lang="ts">
  import { tick } from 'svelte';
  import { weekdayNames } from '@panopticon/api/org';
  import { data } from './state.svelte';
  import { session } from './session.svelte';
  import { deferDates, withDay } from './review';

  // The bar of the card: «Выполнено» and «Отменить» with the statuses they write, «Перенести…», «Отложить…» with its
  // choices of days, «Пропустить»; the dialog of «Удалить…» (from «…»).
  const item = $derived(session.item);
  const doneKw = $derived(item ? data.closing(item, 'done') : null);
  const cancelKw = $derived(item ? data.closing(item, 'cancel') : null);
  // the status it would write, shown on a button that is off because the task has it already (#105)
  const doneShown = $derived(item ? data.closingOf(item, 'done') : null);
  const cancelShown = $derived(item ? data.closingOf(item, 'cancel') : null);
  const already = (kw: string | null) => !!item && !!kw && data.keywordOf(item) === kw;
  const kbd = (id: string) => data.ctx.commands.keyOf(id);
  const REFILE = 'M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5zM8 11h5M11 9l2 2-2 2';

  // ---- «Отложить до…» --------------------------------------------------------------------------------------
  const options = deferDates();
  let deferEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (session.defer && deferEl) void tick().then(() => deferEl?.focus());
  });
  /** «Выбрать дату…»: the core's calendar; the date it gives defers the task like the other choices. */
  async function deferCalendar() {
    session.defer = null;
    const r = item && data.find(item);
    if (!r) return;
    const s = r.h.scheduled;
    const d = await data.ctx.ui.pickDate({ kind: 'SCHEDULED', initial: options[0].date, current: s ? new Date(s.y, s.m - 1, s.d) : null, names: weekdayNames(r.f.text) });
    if (d) void session.deferTo(d);
  }
  function deferKey(e: KeyboardEvent) {
    const d = session.defer;
    if (!d) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      session.defer = null;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      d.sel = (d.sel + (e.key === 'ArrowDown' ? 1 : -1) + options.length + 1) % (options.length + 1); // + «Выбрать дату…»
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (d.sel === options.length) void deferCalendar();
      else void session.deferTo(options[d.sel].date);
    } else if (/^[1-4]$/.test(e.key)) {
      e.preventDefault();
      void session.deferTo(options[+e.key - 1].date);
    }
  }
</script>

<button class="a done-b" disabled={!doneKw} title={already(doneShown) ? `Уже ${doneShown}` : ''} onclick={() => session.act(() => session.close('done'))}>
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>Выполнено<span class="hint">{doneShown ?? ''}</span>{#if kbd('inbox.done')}<kbd>{kbd('inbox.done')}</kbd>{/if}
</button>
<button class="a" disabled={!cancelKw} title={cancelKw ? '' : already(cancelShown) ? `Уже ${cancelShown}` : 'В наборе нет статуса для отмены'} onclick={() => session.act(() => session.close('cancel'))}>
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>Отменить<span class="hint">{cancelShown ?? ''}</span>{#if kbd('inbox.cancel')}<kbd>{kbd('inbox.cancel')}</kbd>{/if}
</button>
<button class="a move-b" onclick={() => session.act(() => session.move())}>
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={REFILE} /></svg>Перенести…{#if kbd('inbox.move')}<kbd>{kbd('inbox.move')}</kbd>{/if}
</button>
<div class="dwrap">
  <button class="a" class:on={!!session.defer} aria-haspopup="dialog" onclick={() => (session.defer = session.defer ? null : { sel: 0 })}>
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 6.5V10l2.5 1.5" /></svg>Отложить…{#if kbd('inbox.defer')}<kbd>{kbd('inbox.defer')}</kbd>{/if}
  </button>
  {#if session.defer}
    {@const d = session.defer}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="defer" role="dialog" aria-label="Отложить до" tabindex="0" bind:this={deferEl} onkeydown={deferKey}>
      <span class="dh"><b>Отложить до…</b><span>ставит SCHEDULED</span></span>
      <div class="opts" role="listbox" aria-label="Когда">
        {#each options as o, i (o.label)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="opt" class:on={d.sel === i} role="option" aria-selected={d.sel === i} tabindex="-1" onmousemove={() => (d.sel = i)} onclick={() => session.deferTo(o.date)}>
            <span class="ol">{o.label}</span><span class="od">{withDay(o.date)}</span><kbd>{i + 1}</kbd>
          </div>
        {/each}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="opt" class:on={d.sel === options.length} role="option" aria-selected={d.sel === options.length} tabindex="-1" onmousemove={() => (d.sel = options.length)} onclick={deferCalendar}>
          <span class="ol">Выбрать дату…</span><span class="od">календарь</span>
        </div>
      </div>
      <span class="dn">Задача останется в Inbox с датой и вернётся в разбор, когда дата наступит. Дальше — следующая карточка.</span>
    </div>
  {/if}
</div>
<button class="a" onclick={() => session.act(() => session.skip())}>
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5l6 5-6 5M13 5v10" /></svg>Пропустить{#if kbd('inbox.skip')}<kbd>{kbd('inbox.skip')}</kbd>{/if}
</button>

{#if session.defer}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dscrim" onmousedown={() => (session.defer = null)}></div>
{/if}
{#if session.confirmDel && item}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="ib-modal" onmousedown={() => (session.confirmDel = false)}>
    <div class="ib-dlg" role="alertdialog" aria-modal="true" aria-label="Удаление задачи" onmousedown={(e) => e.stopPropagation()}>
      <h2>Удалить задачу «{item.title}» вместе с деталями?</h2>
      <p>Заголовок удаляется из файла со всем, что под ним. Вернуть можно кнопкой «Отменить» в подсказке внизу.</p>
      <div class="ib-btns">
        <button onclick={() => (session.confirmDel = false)}>Отмена</button>
        <button class="danger-b" onclick={() => session.remove()}>Удалить</button>
      </div>
    </div>
  </div>
{/if}
