<script lang="ts">
  import { moved } from './pointer';
  import { onMount, tick } from 'svelte';
  import Editor from './Editor.svelte';
  import { store } from './store.svelte';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import { fuzzy } from './fuzzy';
  import { weekdayNames } from './edits';
  import { dayTitle, doneOn, leftOn, nextWorkday, openTasks, type DayTask } from './endDay';
  import { focusRows, journalDays, lastDay } from './today';
  import { today, type EndTask } from './todayState.svelte';

  // «Завершить день» (ТЗ 32 §3): what was done, what is left (moved or kept), the three tasks for tomorrow, a note to
  // tomorrow; ⌘↩ writes it all into the journal at once, ⎋ leaves.
  const day = today.day;
  const files = store.agendaFiles;
  const cfg = today.folder;
  const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const when = `${WD[day.getDay()]}, ${day.getDate()} ${MON[day.getMonth()]}`;
  const tone = (kw: string, path: string) => {
    const f = files.find((x) => x.path === path);
    return f && kw ? toneStyle(toneFor(kw, f.wf)) : '';
  };
  const base = (p: string) => p.split('/').pop() ?? p;

  // ---- what the sheet starts with ----
  const done = doneOn(files, day);
  const left = leftOn(files, day);
  const next = nextWorkday(day);
  const nextWord = next.getDay() === 1 && day.getDay() >= 5 ? 'На понедельник' : 'На завтра';
  const journal = files.find((f) => f.name === cfg.journal);
  const days = journal ? journalDays(journal) : [];
  const mine = days.find((d) => +d.date === +day); // the day was ended already: what it wrote
  const morning = lastDay(days, day);
  type Item = EndTask & { kw: string; file: string };
  const item = (t: DayTask): Item => ({ key: t.key, path: t.path, line: t.line, title: t.title, id: t.id, kw: t.kw, file: t.file });
  const fromLinks = (links: { id: string; title: string }[], keepDone: boolean): Item[] =>
    focusRows(links, files, day).flatMap((r) => (r.task && (keepDone || !r.task.done) ? [{ key: r.task.key, path: r.task.path, line: r.task.line, title: r.task.title, id: r.id, kw: r.task.kw, file: r.task.file }] : []));
  let focus = $state<Item[]>(mine?.focus.length ? fromLinks(mine.focus, true) : fromLinks(morning?.focus ?? [], false));
  let note = $state(mine?.note?.text ?? '- ');

  // «Не успел»: kept (default), tomorrow, or a date
  let choice = $state<Record<string, 'keep' | 'next' | Date>>(Object.fromEntries(left.map((t) => [t.key, 'keep'])));
  function pickDate(t: DayTask) {
    const f = files.find((x) => x.path === t.path);
    store.openCalendar({ kind: 'SCHEDULED', initial: next, current: day, names: weekdayNames(f?.text ?? ''), pick: (d) => (choice[t.key] = d) });
  }
  const isDate = (v: unknown): v is Date => v instanceof Date;

  // ---- «Главное на завтра»: up to three, found as in the palette ----
  let q = $state('');
  let sel = $state(0);
  let input: HTMLInputElement | undefined = $state();
  const candidates = $derived.by(() => {
    if (!q.trim()) return [] as DayTask[];
    const taken = new Set(focus.map((f) => f.key));
    return openTasks(files)
      .filter((t) => !taken.has(t.key))
      .map((t) => ({ t, m: fuzzy(q, t.title) }))
      .filter((x) => x.m)
      .sort((a, b) => Number(b.m!.wordStart) - Number(a.m!.wordStart) || a.m!.span - b.m!.span || a.t.title.length - b.t.title.length)
      .slice(0, 6)
      .map((x) => x.t);
  });
  $effect(() => {
    void q;
    sel = 0;
  });
  function add(t: DayTask | undefined) {
    if (!t || focus.length >= 3) return;
    focus = [...focus, item(t)];
    q = '';
    void tick().then(() => input?.focus());
  }
  function searchKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, Math.min(candidates.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
    } else if (e.key === 'Enter' && !e.metaKey) {
      e.preventDefault();
      add(candidates[sel]);
    } else if (e.key === 'Escape' && q) {
      e.preventDefault();
      e.stopPropagation();
      q = '';
    }
  }
  let dragKey = $state<string | null>(null);
  let overKey = $state<string | null>(null);
  function drop(target: string) {
    if (dragKey && dragKey !== target) {
      const list = [...focus];
      const from = list.findIndex((x) => x.key === dragKey);
      const [it] = list.splice(from, 1);
      list.splice(list.findIndex((x) => x.key === target) + (from <= list.findIndex((x) => x.key === target) ? 1 : 0), 0, it);
      focus = list;
    }
    dragKey = overKey = null;
  }
  function stepKey(e: KeyboardEvent, i: number) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= focus.length) return;
    const list = [...focus];
    [list[i], list[j]] = [list[j], list[i]];
    focus = list;
  }

  // ---- the end ----
  let busy = $state(false);
  async function finish() {
    if (busy) return;
    busy = true;
    const moves = left.flatMap((t) => {
      const c = choice[t.key];
      return c === 'keep' ? [] : [{ task: item(t), date: c === 'next' ? next : c }];
    });
    const ok = await today.finishDay({ moves, focus, done: done.map(item), note: note.trim() === '-' ? '' : note });
    busy = false;
    void ok;
  }
  const close = () => (today.ending = false);
  function keys(e: KeyboardEvent) {
    if (store.palette) return; // the calendar of «Дата…» answers first
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      void finish();
    }
  }
  const DONE_CAP = 8;
  onMount(() => {
    if (!focus.length) input?.focus();
  });
</script>

<svelte:window onkeydowncapture={keys} />

<div class="scrim" aria-hidden="true"></div>
<div class="sheet" role="dialog" aria-label="Завершить день" aria-modal="true">
  <header>
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" /></svg>
    <div class="ht"><b>Завершить день</b><span>{when}</span></div>
  </header>
  <div class="body">
    <section aria-label="Сделано сегодня">
      <div class="cap">СДЕЛАНО СЕГОДНЯ<span>по отметкам CLOSED · {done.length}</span></div>
      {#if done.length}
        <div class="chips">
          {#each done.slice(0, done.length > DONE_CAP ? DONE_CAP - 1 : DONE_CAP) as t (t.key)}<span class="dchip"><span class="ck">✓</span>{t.title}</span>{/each}
          {#if done.length > DONE_CAP}<span class="dchip more">+{done.length - DONE_CAP + 1}</span>{/if}
        </div>
      {:else}
        <div class="none">Сегодня ничего не закрыто</div>
      {/if}
    </section>

    {#if left.length}
      <section aria-label="Не успел">
        <div class="cap">НЕ УСПЕЛ<span>было запланировано на сегодня</span></div>
        {#each left as t (t.key)}
          {@const c = choice[t.key]}
          <div class="lrow">
            <span class="kw tone" style={tone(t.kw, t.path)}>{t.kw}</span><span class="t">{t.title}</span>
            <span class="seg" role="radiogroup" aria-label="Что с задачей «{t.title}»">
              <button role="radio" aria-checked={c === 'next'} class:on={c === 'next'} onclick={() => (choice[t.key] = 'next')}>{nextWord}</button>
              <button role="radio" aria-checked={isDate(c)} class:on={isDate(c)} onclick={() => pickDate(t)}>{isDate(c) ? `${c.getDate()} ${SHORT[c.getMonth()]}` : 'Дата…'}</button>
              <button role="radio" aria-checked={c === 'keep'} class:on={c === 'keep'} onclick={() => (choice[t.key] = 'keep')}>Оставить</button>
            </span>
          </div>
        {/each}
      </section>
    {/if}

    <section aria-label="Главное на завтра">
      <div class="cap">ГЛАВНОЕ НА ЗАВТРА<span>до трёх задач</span></div>
      <div class="focus" role="list">
        {#each focus as f, i (f.key)}
          <div class="frow" class:over={overKey === f.key && dragKey !== f.key} role="listitem" draggable="true" tabindex="0" aria-label="{i + 1}. {f.title}"
            ondragstart={(e) => { dragKey = f.key; e.dataTransfer?.setData('text/plain', f.key); }} ondragend={() => (dragKey = overKey = null)}
            ondragover={(e) => { if (dragKey) { e.preventDefault(); overKey = f.key; } }} ondrop={(e) => { e.preventDefault(); drop(f.key); }}
            onkeydown={(e) => stepKey(e, i)}>
            <span class="n">{i + 1}</span>
            <span class="kw tone" style={tone(f.kw, f.path)}>{f.kw}</span>
            <span class="t">{f.title}</span>
            <span class="file">{base(f.file)}</span>
            <button class="x" aria-label="Убрать «{f.title}»" onclick={() => (focus = focus.filter((x) => x.key !== f.key))}>×</button>
          </div>
        {/each}
        <div class="find" class:full={focus.length >= 3}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
          <input bind:this={input} bind:value={q} onkeydown={searchKey} placeholder="Найти задачу…" aria-label="Найти задачу" disabled={focus.length >= 3} spellcheck="false" autocomplete="off" />
          <span class="cnt">{focus.length} из 3</span>
          {#if candidates.length}
            <div class="drop" role="listbox" aria-label="Задачи">
              {#each candidates as t, i (t.key)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="opt" class:on={i === sel} role="option" aria-selected={i === sel} tabindex="-1" onmousemove={(e) => moved(e) && (sel = i)} onclick={() => add(t)}>
                  <span class="kw tone" style={tone(t.kw, t.path)}>{t.kw}</span><span class="t">{t.title}</span><span class="file">{base(t.file)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </section>

    <section aria-label="Заметка на завтра">
      <div class="cap">ЗАМЕТКА НА ЗАВТРА</div>
      <div class="note">
        <Editor text={note} fileKey="end-day-note" wf={store.untitledWf} gutter={false} drawers={false} levels={store.levels} initial={{ line: note.split('\n').length - 1, col: note.split('\n').at(-1)!.length }}
          reveal={null} onchange={(t) => (note = t)} oncursor={() => {}} onfollow={(l) => store.follow(l)} />
      </div>
    </section>
  </div>
  <footer>
    <span class="where">Запишется в <code>{cfg.journal} › {dayTitle(day)}</code></span>
    <button class="btn" onclick={close}>Отмена</button>
    <button class="btn primary" disabled={busy} onclick={() => void finish()}>Завершить день ⌘↩</button>
  </footer>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 72; background: rgba(0, 0, 0, 0.42); }
  .sheet { position: fixed; z-index: 73; left: 50%; top: 22px; transform: translateX(-50%); width: 760px; max-width: calc(100% - 48px); max-height: calc(100% - 44px);
    display: flex; flex-direction: column; background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5); overflow: hidden; font-family: var(--ui); font-size: 13px; }
  header { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 18px; background: var(--bar); border-bottom: 1px solid var(--line); }
  .ht { display: flex; flex-direction: column; line-height: 1.25; }
  .ht b { font-size: 15px; }
  .ht span { font-size: 11.5px; color: var(--fg2); }
  .body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 14px 20px 4px; display: flex; flex-direction: column; gap: 14px; }
  .cap { display: flex; align-items: baseline; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--fg2); }
  .cap span { font-weight: 400; letter-spacing: 0; color: var(--fg3); }
  .none { margin-top: 6px; color: var(--fg2); }
  .chips { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
  .dchip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; border-radius: 4px; background: color-mix(in srgb, var(--done) 13%, transparent); font-size: 12.5px; }
  .dchip .ck { color: var(--done); font-weight: 700; }
  .dchip.more { color: var(--fg2); }
  /* a status as a capsule (ТЗ 32, the design's update) */
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font-size: 10.5px; font-weight: 700; line-height: 15px; letter-spacing: 0.02em; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .t { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .lrow { display: flex; align-items: center; gap: 8px; min-height: 32px; border-bottom: 1px solid var(--line); }
  .seg { display: flex; gap: 6px; }
  .seg button { height: 22px; padding: 0 8px; border: 0; border-radius: 5px; background: var(--field); color: var(--fg); font-size: 11.5px; }
  .seg button.on { background: var(--acc); color: var(--onacc); font-weight: 600; }
  .focus { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
  .frow { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border-radius: 7px; background: var(--side); border: 1px solid var(--line); cursor: grab; }
  .frow.over { box-shadow: inset 0 2px 0 var(--acc); }
  .frow:focus-visible { outline: 2px solid var(--acc); outline-offset: -1px; }
  .n { color: var(--fg3); font-size: 12px; }
  .file { flex: 0 0 auto; font-size: 11.5px; color: var(--fg3); }
  .x { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 9px; background: none; color: var(--fg3); font-size: 14px; line-height: 1; }
  .x:hover { background: var(--field); color: var(--fg); }
  .find { position: relative; display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border-radius: 7px; border: 1px dashed var(--line); color: var(--fg3); }
  .find.full { opacity: 0.6; }
  .find input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--fg); font: inherit; }
  .find input::placeholder { color: var(--fg3); }
  .cnt { font-size: 11px; }
  .drop { position: absolute; left: -1px; right: -1px; top: 34px; z-index: 2; padding: 4px; background: var(--pop); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25); }
  .opt { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px; border-radius: 5px; color: var(--fg); cursor: default; }
  .opt.on { background: var(--sel); }
  .note { margin-top: 6px; box-sizing: border-box; height: calc(4 * 22px + 24px); min-height: calc(4 * 22px + 24px); max-height: calc(10 * 22px + 24px); resize: vertical; overflow: hidden; border-radius: 8px; border: 2px solid var(--acc); background: var(--bg); }
  .note :global(.cm-editor) { height: 100%; }
  .note :global(.cm-content) { padding-left: 10px !important; }
  footer { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 12px 20px; margin-top: 10px; border-top: 1px solid var(--line); }
  .where { margin-right: auto; font-size: 11.5px; color: var(--fg2); }
  .where code { font: 11.5px var(--mono); }
  .btn { height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font: inherit; }
  .btn.primary { border: 0; padding: 0 14px; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .btn:disabled { opacity: 0.6; }
</style>
