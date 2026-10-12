<script lang="ts">
  import { tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { store } from './store.svelte';
  import Editor from './Editor.svelte';
  import { weekdayNames } from './edits';
  import { listEnter } from './textList';
  import {
    FIELDS, GOAL_TONES, cmpQuarter, dayLabel, goalNote, isSilent, markDayLabel, quarterLabel, shiftQuarter, shortDay, type Goal,
  } from './goals';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import type { Tab } from './layout';

  // «Разбор целей» on 1-1 (ТЗ 23, part 2): one goal at a time on a card — on the left its text in an editor narrowed
  // to the goal («Отметки» folded), on the right the marks, newest first, with the field of a new one; the actions
  // below. The queue and the actions live in the store (`goalReview`).
  let { tab }: { tab: Tab } = $props();

  const r = $derived(store.goalReview);
  const card = $derived(store.goalCard);
  const p = $derived(card?.p);
  const g = $derived(card?.goal ?? null);
  const f = $derived(p?.file ? store.files.find((x) => x.path === p.file!.path) : undefined);
  const total = $derived(r?.items.length ?? 0);
  const marksNewest = $derived(g ? [...g.marks].map((m, i) => ({ m, i })).sort((a, b) => +b.m.date - +a.m.date || b.i - a.i).map((x) => x.m) : []);
  // the line of «Отметки» under the goal: folded on the left, «N — справа» at its end
  const marksLine = $derived.by(() => {
    if (!f || !g) return -1;
    const gi = f.headings.findIndex((h) => h.line === g.line);
    const h = f.headings.find((x, i) => x.parent === gi && i > gi && x.title.trim().toLowerCase() === FIELDS.marks.toLowerCase());
    return h ? h.line : -1;
  });
  let showMarks = $state(false); // a double click on a mark: «Отметки» open on the left, the caret on it
  let rev = $state<{ line: number; n: number; focus: boolean } | null>(null);
  const pill = (x: Goal) => (isSilent(x) ? goalNote(x, f?.wf.done ?? []) : goalNote(x, f?.wf.done ?? []));
  const chip = (kw: string | null) =>
    !kw ? '' : GOAL_TONES[kw] ? `color:${GOAL_TONES[kw]};background:color-mix(in srgb, ${GOAL_TONES[kw]} 15%, transparent)` : f ? toneStyle(toneFor(kw, f.wf)) : '';

  // a new card: the field of the mark takes the keys
  let field: HTMLTextAreaElement | undefined = $state();
  let shownFor = '';
  $effect(() => {
    const k = card ? card.it.title + '|' + card.it.q.y + card.it.q.q : '';
    if (k === shownFor) return;
    shownFor = k;
    showMarks = false;
    rev = null;
    void tick().then(() => field?.focus());
  });

  // ---- the quick buttons and the dates ----------------------------------------------------------------------------
  let qMenu = $state(false);
  const status = () => {
    if (!g) return;
    store.setTabCursor(tab, g.line, 0); // the palette works on the heading under the caret
    store.openPalette('status');
  };
  const names = $derived(weekdayNames(f?.text ?? ''));
  function shiftDeadline() {
    if (!g) return;
    store.openCalendar({ kind: 'DEADLINE', initial: g.deadline ?? new Date(), current: g.deadline, names, pick: (d) => void store.goalShiftDeadline(d) });
  }
  function markDay() {
    if (!r) return;
    store.openCalendar({ kind: 'MARK', initial: r.date ?? new Date(), current: null, names, pick: (d) => { if (store.goalReview) store.goalReview.date = d; } });
  }
  async function complete() {
    if (await store.goalComplete()) {
      await tick();
      field?.focus();
      if (field) field.selectionStart = field.selectionEnd = field.value.length;
    }
  }
  function openMark(line: number) {
    showMarks = true;
    rev = { line, n: Date.now(), focus: true };
  }
  /** «- » makes an item, ↩ a new line, ⌘↩ adds (the window's handler). */
  function fieldKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.isComposing || !r) return;
    const ta = e.currentTarget as HTMLTextAreaElement;
    const x = listEnter(ta.value, ta.selectionStart);
    if (!x) return;
    e.preventDefault();
    r.draft = x.value;
    void tick().then(() => (ta.selectionStart = ta.selectionEnd = x.caret));
  }

  // ---- the keys of the review: ⌘↩ ⌘1 ⌘2 ⌘[ ⌘] (as set in «Клавиши») ------------------------------------------------
  const RUN: Record<string, () => void> = {
    goalMark: () => void store.goalAddMark(),
    goalDone: () => void complete(),
    goalShift: () => shiftDeadline(),
    goalBack: () => void store.goalStep(-1),
    goalNext: () => void store.goalStep(1),
  };
  $effect(() => {
    const keys = {
      active: () => store.tab === tab && !!store.goalReview && !store.palette && !store.sheetOpen,
      run: (id: string) => {
        if (!RUN[id]) return false;
        if (store.goalReview!.cur < 0 && id !== 'goalBack') return false;
        RUN[id]();
        return true;
      },
    };
    store.goalReviewKeys = keys;
    return () => {
      if (store.goalReviewKeys === keys) store.goalReviewKeys = null;
    };
  });
  const kbd = (id: string) => store.keyHint(id);
</script>

<div class="greview">
  <div class="stage">
    {#if r && card && p && f && g}
      {#key card.it.title + '|' + card.it.q.y + card.it.q.q + '|' + showMarks}
        <div class="card" in:fly={{ y: 8, duration: 150 }}>
          <div class="chead">
            <span class="av" style="background:{p.color}" aria-hidden="true">{p.ini}</span>
            <b>{p.name} · цель {r.cur + 1} из {total}</b>
            <span class="file">{p.src.file.split('/').pop()}</span>
            <span class="pill" class:silent={isSilent(g)}>{pill(g)}</span>
          </div>
          <div class="quick" role="toolbar" aria-label="Быстрые действия">
            <button onclick={status}><span>Статус</span><span class="qv st" style={chip(g.keyword)}>{g.keyword ?? '—'}</span></button>
            <button onclick={shiftDeadline}><span>Срок</span><span class="qv ts">{g.deadline ? shortDay(g.deadline) : '—'}</span></button>
            <div class="qwrap">
              <button aria-haspopup="menu" aria-expanded={qMenu} onclick={() => (qMenu = !qMenu)}><span>Квартал</span><span class="qv">{quarterLabel(card.it.q)}</span></button>
              {#if qMenu}
                <div class="qmenu" role="menu">
                  {#each [-1, 0, 1] as d (d)}
                    {@const qq = shiftQuarter(card.it.q, d)}
                    <button role="menuitemradio" aria-checked={cmpQuarter(qq, card.it.q) === 0} onclick={() => { qMenu = false; void store.goalMoveQuarter(qq); }}>{quarterLabel(qq)}</button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
          <div class="cols">
            <div class="ed">
              <Editor text={f.text} fileKey={'goalReview|' + card.it.title + '|' + f.path + '|' + showMarks} wf={f.wf} reveal={rev} narrow={{ line: g.line, end: g.end }} drawers={true} levels={store.levels}
                folded={showMarks || marksLine < 0 ? [] : [marksLine]} lineNote={!showMarks && marksLine >= 0 && g.marks.length ? { line: marksLine, text: `${g.marks.length} — справа` } : null}
                onchange={(t) => store.setText(t, f.path)} oncursor={(line, col) => store.setTabCursor(tab, line, col)} onfollow={(l) => store.follow(l)} />
            </div>
            <aside class="marks" aria-label="Отметки">
              <div class="mh"><span class="cap">ОТМЕТКИ · {g.marks.length}</span><span class="nt">новые сверху</span></div>
              <div class="new">
                <button class="day" title="Другой день" onclick={markDay}>{markDayLabel(r.date ?? new Date())}</button>
                <textarea bind:this={field} bind:value={r.draft} rows="3" aria-label="Новая отметка" placeholder="Что сделано, что дальше…" onkeydown={fieldKey}></textarea>
                <span class="nt">↩ новая строка · «- » пункт списка · {kbd('goalMark') || '⌘↩'} добавить</span>
              </div>
              {#each marksNewest as m (m.line)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="mark" ondblclick={() => openMark(m.line)} title="Двойной клик — показать слева">
                  <span class="md">{dayLabel(m.date)}</span>
                  <span class="mt">{m.text}</span>
                </div>
              {/each}
              <span class="nt">Отметки пишутся в подзаголовок «Отметки» этой цели строками <code>- [дата] текст</code>, по порядку дат.</span>
            </aside>
          </div>
        </div>
      {/key}
    {:else if r && r.cur < 0}
      <div class="done" in:fly={{ y: 8, duration: 150 }}>
        <span class="okc" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg></span>
        <h2>Разбор закончен</h2>
        <div class="stats">
          <div class="stat"><span class="n" style:color="var(--acc)">{r.marks}</span><span>{r.marks === 1 ? 'отметка добавлена' : 'отметок добавлено'}</span></div>
          <div class="stat"><span class="n" style:color="var(--done)">{r.closed}</span><span>{r.closed === 1 ? 'цель закрыта' : 'целей закрыто'}</span></div>
          <div class="stat"><span class="n" style:color="var(--wait)">{r.moved}</span><span>{r.moved === 1 ? 'срок сдвинут' : 'сроков сдвинуто'}</span></div>
        </div>
        <div class="btns">
          <button onclick={() => { const k = r.key; store.endGoalReview(); store.openGoalFile(k); }}>Открыть файл человека</button>
          <button class="pri" onclick={() => store.endGoalReview()}>Закончить</button>
        </div>
        <span class="fine">Всё уже записано в файл.</span>
      </div>
    {:else if r && card && !g}
      <div class="none">Цель «{card.it.title}» не найдена в файле: её переименовали или перенесли. <button onclick={() => store.goalStep(1)}>Следующая</button></div>
    {:else}
      <div class="none">Разбор не идёт. Начать — «Разобрать цели» в разделе «Цели».</div>
    {/if}
  </div>

  {#if r && card && g}
    <div class="bar">
      <button class="back" disabled={r.cur <= 0} onclick={() => store.goalStep(-1)}>‹ Назад{#if kbd('goalBack')}<kbd>{kbd('goalBack')}</kbd>{/if}</button>
      <div class="acts">
        <button class="a pri" disabled={!r.draft.trim()} onclick={() => store.goalAddMark()}>Добавить отметку{#if kbd('goalMark')}<kbd>{kbd('goalMark')}</kbd>{/if}</button>
        <button class="a ok" disabled={!!g.keyword && (f?.wf.done ?? []).includes(g.keyword)} onclick={complete}>Цель достигнута<span class="h">COMPLETED</span>{#if kbd('goalDone')}<kbd>{kbd('goalDone')}</kbd>{/if}</button>
        <button class="a" onclick={shiftDeadline}>Сдвинуть срок…{#if kbd('goalShift')}<kbd>{kbd('goalShift')}</kbd>{/if}</button>
        <button class="a" onclick={() => store.goalStep(1)}>Следующая{#if kbd('goalNext')}<kbd>{kbd('goalNext')}</kbd>{/if}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .greview { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .stage { flex: 1 1 0; min-height: 0; overflow: auto; background: var(--stage); padding: 24px; display: flex; justify-content: center; align-items: flex-start; }
  .card { width: 100%; max-width: 1080px; display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1); overflow: hidden; }
  .chead { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--line); }
  .av { flex: 0 0 24px; width: 24px; height: 24px; border-radius: 12px; color: #ffffff; font-size: 10.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .file { color: var(--fg2); }
  .pill { margin-left: auto; display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 11px; font-size: 12px; color: var(--fg2); background: var(--field); }
  .pill.silent { font-weight: 600; color: var(--wait); background: color-mix(in srgb, var(--wait) 14%, transparent); }
  .quick { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 10px 18px; border-bottom: 1px solid var(--line); background: var(--side); }
  .quick button { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; }
  .qv { font-weight: 600; }
  .qv.st { padding: 1px 6px; border-radius: 5px; font-size: 11px; }
  .qv.ts { color: var(--ts); }
  .qwrap { position: relative; }
  .qmenu { position: absolute; left: 0; top: 32px; z-index: 3; display: flex; flex-direction: column; padding: 4px; min-width: 120px; background: var(--pop); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); }
  .qmenu button { border: 0; justify-content: flex-start; }
  .qmenu button[aria-checked='true'] { color: var(--acc); font-weight: 600; }
  .cols { display: flex; flex-wrap: wrap; min-height: 0; }
  .ed { flex: 3 1 460px; min-width: 0; min-height: 360px; display: flex; flex-direction: column; border-right: 1px solid var(--line); }
  .marks { flex: 2 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 12px; padding: 14px 16px 18px; background: var(--side); }
  .mh { display: flex; align-items: baseline; gap: 8px; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; color: var(--fg2); }
  .nt { font-size: 11px; color: var(--fg3); line-height: 1.45; }
  .new { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1.5px solid var(--acc); border-radius: 9px; background: var(--bg); }
  .day { align-self: flex-start; height: 20px; padding: 0 8px; border: 0; border-radius: 10px; font-size: 11.5px; font-weight: 600; color: var(--ts); background: color-mix(in srgb, var(--ts) 12%, transparent); }
  textarea { min-height: 60px; resize: vertical; border: 0; outline: none; background: transparent; color: var(--fg); font: inherit; font-size: 13px; line-height: 1.5; padding: 0; -webkit-user-select: text; user-select: text; }
  .mark { display: flex; flex-direction: column; gap: 4px; padding: 0 2px 10px; border-bottom: 1px solid var(--line); cursor: default; }
  .md { font-size: 11.5px; font-weight: 600; color: var(--fg2); }
  .mt { white-space: pre-wrap; line-height: 1.5; -webkit-user-select: text; user-select: text; }
  code { font-family: var(--mono); }
  .bar { flex: 0 0 auto; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 16px; background: var(--bar); border-top: 1px solid var(--line); }
  .back { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: var(--fg2); }
  .back:disabled { opacity: 0.4; }
  .acts { flex: 1 1 auto; display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; }
  .a { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font-weight: 600; }
  .a.pri { border-color: var(--acc); background: var(--acc); color: var(--onacc); }
  .a.ok { color: var(--done); }
  .a:disabled { opacity: 0.45; }
  .h { font-weight: 400; font-size: 11.5px; opacity: 0.8; }
  kbd { font-family: var(--mono); font-size: 10.5px; font-weight: 400; padding: 0 4px; border: 1px solid var(--line); border-radius: 4px; }
  .a.pri kbd { border-color: color-mix(in srgb, var(--onacc) 45%, transparent); }
  .done { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 32px; width: 100%; max-width: 560px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; }
  .okc { width: 48px; height: 48px; border-radius: 24px; display: flex; align-items: center; justify-content: center; color: var(--done); background: color-mix(in srgb, var(--done) 14%, transparent); }
  .done h2 { margin: 0; font-size: 18px; }
  .stats { display: flex; gap: 24px; }
  .stat { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; color: var(--fg2); }
  .stat .n { font-size: 22px; font-weight: 700; }
  .btns { display: flex; gap: 8px; }
  .btns button, .none button { height: 30px; padding: 0 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); }
  .btns .pri { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .fine { font-size: 11.5px; color: var(--fg3); }
  .none { color: var(--fg2); padding: 40px; }
</style>
