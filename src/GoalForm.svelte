<script lang="ts">
  import { tick } from 'svelte';
  import { store } from './store.svelte';
  import Calendar from './Calendar.svelte';
  import { parseDate, weekdayNames } from './edits';
  import { busyDays, longDate, shiftDate } from './calendar';
  import { listEnter, listIndent } from './textList';
  import { GOAL_STATES, defaultQuarter, quarterLabel, quarterTitle, qEnd, shiftQuarter, cmpQuarter, type Quarter } from './goals';
  import type { CalSpec } from './commands';

  // «Новая цель» (ТЗ 23, 3.2): whose, the title, «Что будешь делать», «Ожидаемый результат» (lists as in the editor),
  // the deadline (as text or ⇧ + arrows: the calendar of ТЗ 20), the quarter. ⌘↩ creates, ⎋ keeps a draft.
  const LAST = 'goals:last';
  const DRAFT = 'goals:draft';
  const ls = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* none */ } };

  const req = store.goalForm!;
  // the team by name, «Мои цели» at the end (as the people in the overview)
  const people = $derived([...store.goalPeople.filter((p) => p.found)].sort((a, b) => Number(!!a.src.me) - Number(!!b.src.me) || a.name.localeCompare(b.name, 'ru')));
  const draft = (() => { try { return JSON.parse(ls(DRAFT) ?? 'null'); } catch { return null; } })();

  let who = $state<string>(req.key ?? draft?.who ?? ls(LAST) ?? '');
  if (!store.goalPeople.some((p) => p.key === who && p.found)) who = people[0]?.key ?? '';
  let title = $state<string>(draft?.title ?? '');
  let plan = $state<string>(draft?.plan ?? '');
  let result = $state<string>(draft?.result ?? '');
  let quarter = $state<Quarter>(defaultQuarter());
  let date = $state<Date | null>(qEnd(quarter));
  let dateText = $state('');
  let dateTouched = false;
  let bad = $state(false);
  let cal = $state(false); // the calendar is open under the deadline
  let view = $state<Date>(date!);
  let qMenu = $state(false);
  let busy = $state(false);

  const person = $derived(store.goalPeople.find((p) => p.key === who));
  const exists = $derived(!!person?.data.quarters.some((x) => cmpQuarter(x.q, quarter) === 0));
  const ready = $derived(!!person && !!title.trim() && !bad);
  const names = $derived(weekdayNames(person?.file?.text ?? ''));
  const spec = $derived<CalSpec>({ kind: 'DEADLINE', initial: date ?? new Date(), current: null, names, pick: (d) => setDate(d) });
  const busyMap = $derived(busyDays(store.files));

  function setDate(d: Date) {
    date = d;
    view = d;
    dateText = '';
    bad = false;
    dateTouched = true;
  }
  function setQuarter(q: Quarter) {
    quarter = q;
    qMenu = false;
    if (!dateTouched) {
      date = qEnd(q);
      view = date;
    }
  }
  function typedDate() {
    dateTouched = true;
    const t = dateText.trim();
    if (!t) {
      bad = false;
      return;
    }
    const d = parseDate(t);
    bad = !d;
    if (d) {
      date = d;
      view = d;
    }
  }
  /** ⇧ ← → a day, ⇧ ↑ ↓ a week; with ⌥ a month, a year; ↩ takes the day and closes the calendar. */
  function dateKey(e: KeyboardEvent) {
    const arrows: Record<string, ['day' | 'week', number]> = { ArrowLeft: ['day', -1], ArrowRight: ['day', 1], ArrowUp: ['week', -1], ArrowDown: ['week', 1] };
    const a = arrows[e.key];
    if (a && e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      cal = true;
      const unit = e.altKey ? (a[0] === 'day' ? 'month' : 'year') : a[0];
      setDate(shiftDate(date ?? new Date(), unit, a[1]));
      return;
    }
    if (e.key === 'Enter' && cal && !e.metaKey) {
      e.preventDefault();
      cal = false;
    } else if (e.key === 'Escape' && cal) {
      e.preventDefault();
      e.stopPropagation();
      cal = false;
    }
  }
  /** Lists in the long fields: ↩ the next item, ⇥ / ⇧⇥ in and out. */
  function listKey(e: KeyboardEvent, set: (v: string) => void) {
    const ta = e.currentTarget as HTMLTextAreaElement;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const r = e.key === 'Enter' && !e.shiftKey && !e.isComposing ? listEnter(ta.value, ta.selectionStart) : e.key === 'Tab' ? (listIndent(ta.value, ta.selectionStart, e.shiftKey ? -1 : 1) ?? { value: ta.value, caret: ta.selectionStart }) : null;
    if (!r) return;
    e.preventDefault();
    set(r.value);
    void tick().then(() => {
      ta.selectionStart = ta.selectionEnd = r.caret;
      grow(ta);
    });
  }
  function grow(ta: HTMLTextAreaElement) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 2 + 'px';
  }
  function autosize(ta: HTMLTextAreaElement) {
    queueMicrotask(() => grow(ta));
  }

  async function create() {
    if (!ready || busy) return;
    busy = true;
    const ok = await store.addGoal(who, quarter, { title, plan, result, deadline: date, status: GOAL_STATES.active });
    busy = false;
    if (!ok) return;
    lsSet(LAST, who);
    lsSet(DRAFT, null);
    store.goalsQuarter = quarter;
    store.goalForm = null;
  }
  function cancel() {
    // something typed: kept until the next time, as the quick entry of the Inbox
    lsSet(DRAFT, title.trim() || plan.trim() || result.trim() ? JSON.stringify({ who, title, plan, result }) : null);
    store.goalForm = null;
  }

  // ⌃⇥ / ⌃⇧⇥ between the fields (⇥ in the long ones is for lists), ⌘↩ creates, ⎋ closes
  let sheet: HTMLDivElement | undefined = $state();
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      if (qMenu) qMenu = false;
      else cancel();
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      void create();
    } else if (e.key === 'Tab' && e.ctrlKey) {
      e.preventDefault();
      const fields = [...(sheet?.querySelectorAll<HTMLElement>('[data-field]') ?? [])];
      const i = fields.indexOf(document.activeElement as HTMLElement);
      fields[(i + (e.shiftKey ? -1 : 1) + fields.length) % fields.length]?.focus();
    }
  }
  let titleEl: HTMLInputElement | undefined = $state();
  void tick().then(() => titleEl?.focus());
</script>

<div class="scrim" aria-hidden="true"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="gform" role="dialog" aria-modal="true" aria-label="Новая цель" tabindex="-1" bind:this={sheet} onkeydown={key}>
  <header>
    <b>Новая цель</b>
    <div class="qwrap">
      <button class="qchip" aria-haspopup="menu" aria-expanded={qMenu} onclick={() => (qMenu = !qMenu)}>Квартал {quarterLabel(quarter)} ⌄</button>
      {#if qMenu}
        <div class="qmenu" role="menu">
          {#each [-1, 0, 1] as d (d)}
            {@const qq = shiftQuarter(defaultQuarter(), d)}
            <button role="menuitemradio" aria-checked={cmpQuarter(qq, quarter) === 0} onclick={() => setQuarter(qq)}>{quarterLabel(qq)}</button>
          {/each}
        </div>
      {/if}
    </div>
  </header>
  <div class="body">
    <label class="fld">
      <span class="l">Чья цель</span>
      <span class="sel">
        {#if person}<span class="av" style="background:{person.color}" aria-hidden="true">{person.ini}</span>{/if}
        <select bind:value={who} data-field aria-label="Чья цель">
          {#each people as p (p.key)}<option value={p.key}>{p.name} — {p.src.file.split('/').pop()} › {p.src.heading}</option>{/each}
        </select>
      </span>
      <span class="hint">Из навигатора «Цели»; последний выбор запоминается</span>
    </label>
    <label class="fld">
      <span class="l">Название</span>
      <input bind:this={titleEl} bind:value={title} data-field aria-label="Название" spellcheck="false" />
    </label>
    <label class="fld">
      <span class="l">Что будешь делать</span>
      <textarea bind:value={plan} data-field rows="6" aria-label="Что будешь делать" use:autosize oninput={(e) => grow(e.currentTarget)} onkeydown={(e) => listKey(e, (v) => (plan = v))}></textarea>
      <span class="hint">Абзацы и списки как в редакторе: «- » — пункт, ⇥ — вложенный пункт. Поле растёт вместе с текстом</span>
    </label>
    <label class="fld">
      <span class="l">Ожидаемый результат</span>
      <textarea bind:value={result} data-field rows="4" aria-label="Ожидаемый результат" use:autosize oninput={(e) => grow(e.currentTarget)} onkeydown={(e) => listKey(e, (v) => (result = v))}></textarea>
    </label>
    <label class="fld">
      <span class="l">Срок</span>
      <input class:bad bind:value={dateText} data-field aria-label="Срок" placeholder={date ? longDate(date) : 'Без срока'} spellcheck="false" autocomplete="off"
        oninput={typedDate} onkeydown={dateKey} onblur={() => (cal = false)} />
      <span class="hint">{bad ? 'Не похоже на дату' : `${date ? longDate(date) + ' · ' : ''}Текстом («30 ноя», «+6н») или ⇧ + стрелки — календарь на 3 месяца`}</span>
    </label>
    {#if cal && date}
      <div class="calbox"><Calendar {spec} sel={date} {view} {bad} busy={busyMap} onselect={setDate} onpick={(d) => { setDate(d); cal = false; }} onturn={(n) => (view = shiftDate(view, 'month', n))} /></div>
    {/if}
    {#if person}
      <div class="where">Запишется в <b>{person.src.file.split('/').pop()} › {person.src.heading} › {quarterTitle(quarter)}</b> как <code>*** ACTIVE …</code>{date ? ' с DEADLINE' : ''} и подзаголовками «Что буду делать», «Ожидаемый результат», «Отметки».{exists ? '' : ' Квартала ещё нет — будет создан'}</div>
    {/if}
  </div>
  <footer>
    <span class="kh">⌃⇥ следующее поле · ⇧ + стрелки в поле срока — календарь</span>
    <button onclick={cancel}>Отмена</button>
    <button class="pri" disabled={!ready || busy} onclick={create}>Создать <span>⌘↩</span></button>
  </footer>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.42); }
  .gform { position: fixed; z-index: 71; left: 50%; top: 36px; bottom: 36px; transform: translateX(-50%); width: min(720px, calc(100% - 48px)); display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5); overflow: hidden; outline: none; }
  header { flex: 0 0 52px; display: flex; align-items: center; gap: 10px; padding: 0 20px; background: var(--bar); border-bottom: 1px solid var(--line); }
  header b { font-size: 15px; }
  .qwrap { margin-left: auto; position: relative; }
  .qchip { height: 22px; padding: 0 9px; border: 0; border-radius: 11px; background: var(--field); font-size: 12px; color: var(--fg2); }
  .qmenu { position: absolute; right: 0; top: 26px; z-index: 3; display: flex; flex-direction: column; padding: 4px; min-width: 120px; background: var(--pop); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); }
  .qmenu button { height: 26px; padding: 0 10px; border: 0; border-radius: 5px; background: transparent; color: var(--fg); text-align: left; }
  .qmenu button[aria-checked='true'] { color: var(--acc); font-weight: 600; }
  .qmenu button:hover { background: var(--sel); }
  .body { flex: 1 1 0; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; }
  .body > * { flex-shrink: 0; }
  .fld { display: flex; flex-direction: column; gap: 5px; }
  .l { font-size: 12px; font-weight: 600; color: var(--fg2); }
  .hint { font-size: 11.5px; color: var(--fg3); }
  input, textarea, .sel { box-sizing: border-box; padding: 6px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font: inherit; font-size: 13px; line-height: 1.45; outline: none; -webkit-user-select: text; user-select: text; }
  input { height: 34px; }
  textarea { resize: none; overflow: hidden; min-height: 60px; }
  input:focus, textarea:focus, .sel:focus-within { border-color: var(--acc); box-shadow: 0 0 0 1px var(--acc); }
  input.bad { border-color: var(--todo); }
  .sel { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 6px 0 8px; }
  .sel select { flex: 1; min-width: 0; height: 30px; border: 0; background: transparent; color: var(--fg); font: inherit; outline: none; }
  .av { flex: 0 0 20px; width: 20px; height: 20px; border-radius: 10px; color: #ffffff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .calbox { border: 1px solid var(--line); border-radius: 9px; overflow: hidden; }
  .where { padding: 8px 10px; border-radius: 7px; background: var(--side); font-size: 12px; color: var(--fg2); line-height: 1.45; }
  .where b { color: var(--fg); }
  code { font-family: var(--mono); }
  footer { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--line); background: var(--side); }
  .kh { font-size: 11.5px; color: var(--fg3); margin-right: auto; }
  footer button { height: 30px; padding: 0 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); }
  footer .pri { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .pri span { opacity: 0.8; font-weight: 400; }
  .pri:disabled { opacity: 0.5; }
</style>
