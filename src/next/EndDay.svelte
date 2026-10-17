<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { moved } from '../pointer';
  import { displayName } from '../names';
  import { dayTitle } from '../endDay';
  import { listEnter, listIndent } from '../textList';
  import { DONE_CAP, EndDayCtl, isDate, shortDay } from '../endDayCtl.svelte';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';

  // «Завершить день» in the new interface (ТЗ 45 §2.5): a sheet of 640 pt, the parts one under another — «Сделано
  // сегодня» as capsules with a check, «Не успел» with «На завтра» / «Дата…» / «Оставить» under each (the chosen on
  // `lampsoft`), «Главное на завтра» numbered with «+ выбрать задачу…» found as in the palette, «Заметка на завтра» in
  // Cormorant 18; the foot says where it goes. ⌘↩ ends the day, ⎋ leaves. Its workings are endDayCtl.svelte.ts.
  const c = new EndDayCtl();
  const name = (rel: string) => displayName(rel);
  let ta: HTMLTextAreaElement | undefined = $state();
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  };
  function noteKey(e: KeyboardEvent) {
    const el = e.currentTarget as HTMLTextAreaElement;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const r = e.key === 'Enter' && !e.shiftKey && !e.isComposing ? listEnter(el.value, el.selectionStart) : e.key === 'Tab' ? (listIndent(el.value, el.selectionStart, e.shiftKey ? -1 : 1) ?? { value: el.value, caret: el.selectionStart }) : null;
    if (!r) return;
    e.preventDefault();
    c.note = r.value;
    void tick().then(() => {
      el.selectionStart = el.selectionEnd = r.caret;
      grow(el);
    });
  }
  onMount(() => {
    if (!c.focus.length) c.input?.focus();
    else if (ta) {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    }
  });
</script>

<svelte:window onkeydowncapture={(e) => c.keys(e)} />

{#snippet cap(kw: string, path: string)}
  {#if kw}<span class="cap" style={c.tone(kw, path)}>{kw}</span>{/if}
{/snippet}

<Sheet label="Завершить день" width={640} oncancel={c.close}>
  <div class="ed">
    <div class="hd">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" /></svg>
      <h2>Завершить день</h2><span class="sub">{c.when}</span>
    </div>

    <section aria-label="Сделано сегодня">
      <div class="sh"><b>Сделано сегодня</b><span>{c.done.length}</span></div>
      {#if c.done.length}
        <div class="chips">
          {#each c.done.slice(0, c.done.length > DONE_CAP ? DONE_CAP - 1 : DONE_CAP) as t (t.key)}<span class="dchip"><span class="ck">✓</span>{t.title}</span>{/each}
          {#if c.done.length > DONE_CAP}<span class="dchip more">+{c.done.length - DONE_CAP + 1}</span>{/if}
        </div>
      {:else}
        <div class="none">Сегодня ничего не закрыто</div>
      {/if}
    </section>

    {#if c.left.length}
      <section aria-label="Не успел">
        <div class="sh"><b>Не успел</b><span>{c.left.length}</span></div>
        {#each c.left as t (t.key)}
          {@const ch = c.choice[t.key]}
          <div class="row"><span class="kc">{@render cap(t.kw, t.path)}</span><span class="t">{t.title}</span><span class="file">{name(t.file)}</span></div>
          <div class="opts" role="radiogroup" aria-label="Что с задачей «{t.title}»">
            <button role="radio" aria-checked={ch === 'next'} class:on={ch === 'next'} onclick={() => (c.choice[t.key] = 'next')}>{c.nextWord}</button>
            <button role="radio" aria-checked={isDate(ch)} class:on={isDate(ch)} onclick={() => c.pickDate(t)}>{isDate(ch) ? shortDay(ch) : 'Дата…'}</button>
            <button role="radio" aria-checked={ch === 'keep'} class:on={ch === 'keep'} onclick={() => (c.choice[t.key] = 'keep')}>Оставить</button>
          </div>
        {/each}
      </section>
    {/if}

    <section aria-label="Главное на завтра">
      <div class="sh"><b>Главное на завтра</b><span>{c.nextDay} · до трёх</span></div>
      <div role="list">
        {#each c.focus as f, i (f.key)}
          <!-- a row is taken by the keyboard (⌥↑ ⌥↓) and dragged, as the old sheet's -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <div class="row frow" class:over={c.drag.overId === f.key && c.drag.dragId !== f.key} role="listitem" tabindex="0" aria-label="{i + 1}. {f.title}"
            use:c.drag.handle={{ id: f.key }} use:c.drag.zone={f.key} onkeydown={(e) => c.stepKey(e, i)}>
            <span class="n">{i + 1}</span>{@render cap(f.kw, f.path)}<span class="t">{f.title}</span><span class="file">{name(f.file)}</span>
            <button class="x" aria-label="Убрать «{f.title}»" onclick={() => c.remove(f.key)}>×</button>
          </div>
        {/each}
        {#if c.focus.length < 3}
          <div class="row find">
            <span class="n">{c.focus.length + 1}</span>
            <input bind:this={c.input} bind:value={() => c.q, (v) => c.setQuery(v)} onkeydown={(e) => c.searchKey(e)} placeholder="+ выбрать задачу…" aria-label="Найти задачу" spellcheck="false" autocomplete="off" />
            {#if c.candidates.length}
              <div class="drop" role="listbox" aria-label="Задачи">
                {#each c.candidates as t, i (t.key)}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div class="opt" class:on={i === c.sel} role="option" aria-selected={i === c.sel} tabindex="-1" onmousemove={(e) => moved(e) && (c.sel = i)} onmousedown={(e) => e.preventDefault()} onclick={() => c.add(t)}>
                    {@render cap(t.kw, t.path)}<span class="t">{t.title}</span><span class="file">{name(t.file)}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <section aria-label="Заметка на завтра">
      <div class="sh"><b>Заметка на завтра</b><span>запишется в {name(c.cfg.journal)}</span></div>
      <textarea class="note" bind:this={ta} aria-label="Заметка на завтра" rows="2" value={c.note} spellcheck="false"
        oninput={(e) => { c.note = e.currentTarget.value; grow(e.currentTarget); }} onkeydown={noteKey} use:grow></textarea>
    </section>
  </div>
  {#snippet foot()}
    <span class="where">Запишется в {name(c.cfg.journal)} › {dayTitle(c.day)}</span>
    <Button key="esc" onclick={c.close}>Отмена</Button>
    <Button kind="main" key="⌘↩" disabled={c.busy} onclick={() => void c.finish()}>Завершить день</Button>
  {/snippet}
</Sheet>

<style>
  .ed { display: flex; flex-direction: column; gap: 14px; color: var(--ink); }
  .hd { display: flex; align-items: center; gap: 8px; }
  .hd svg { color: var(--lampink); }
  h2 { margin: 0; font: 700 15px/1.3 var(--ui); }
  .sub { font-size: 12px; color: var(--ink3); }
  .sh { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .sh b { font-size: 13px; font-weight: 700; }
  .sh span { font-size: 11.5px; color: var(--ink3); }
  .none { color: var(--ink3); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .dchip { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border-radius: 4px; background: color-mix(in srgb, var(--done) 14%, transparent); font-size: 12.5px; }
  .dchip .ck { color: var(--done); font-weight: 700; }
  .dchip.more { color: var(--ink2); }
  .cap { flex: 0 0 auto; display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 4px; font: 700 10.5px var(--ui); letter-spacing: 0.02em; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .row { display: flex; align-items: center; gap: 9px; min-height: 32px; border-top: 1px solid var(--rule); padding: 3px 0; box-sizing: border-box; }
  .kc { flex: 0 0 46px; display: flex; }
  .t { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13.5px; }
  .file { flex: 0 0 auto; font-size: 11.5px; color: var(--ink3); }
  .opts { display: flex; gap: 5px; margin: 0 0 6px 55px; }
  .opts button { height: 22px; padding: 0 8px; border: 0; border-radius: 5px; background: var(--chip2); color: var(--ink); font: 11.5px var(--ui); white-space: nowrap; }
  .opts button.on { background: var(--lampsoft); color: var(--lampink); font-weight: 600; }
  .n { flex: 0 0 18px; font: 12px var(--mono); color: var(--ink3); }
  .frow { cursor: grab; border-radius: 0; }
  .frow.over { box-shadow: inset 0 2px 0 var(--lamp); }
  .frow:focus-visible { outline: 2px solid var(--lamp); outline-offset: -2px; }
  .x { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 9px; background: none; color: var(--ink3); font-size: 14px; line-height: 1; }
  .x:hover { background: var(--chip2); color: var(--ink); }
  .find { position: relative; }
  .find input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--ink); caret-color: var(--lamp); font: 13.5px var(--ui); padding: 0; }
  .find input::placeholder { color: var(--ink3); }
  .drop { position: absolute; left: 0; right: 0; top: 34px; z-index: 2; padding: 4px; background: var(--card); border: 1px solid var(--rule); border-radius: 8px; box-shadow: var(--popshadow); }
  .opt { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px; border-radius: 5px; color: var(--ink); cursor: default; }
  .opt.on { background: var(--lamp); color: var(--onlamp); }
  .opt.on .file { color: inherit; opacity: 0.75; }
  .note { width: 100%; box-sizing: border-box; min-height: 70px; resize: none; overflow: hidden; padding: 10px 12px; border: 0; border-radius: 8px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); caret-color: var(--lamp); font: 500 18px/1.45 var(--text); outline: none; -webkit-user-select: text; user-select: text; }
  .note:focus { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .where { flex: 1; font-size: 12px; color: var(--ink3); }
</style>
