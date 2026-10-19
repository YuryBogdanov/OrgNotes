<script lang="ts">
  import { cal as calendar } from './state.svelte';
  import { dayTitle, entriesIn, fromIso, relWords, sortDay, toneVars, type CalEntry } from '@panopticon/api/org';
  import type { CalState } from './state.svelte';

  // The inspector while a calendar tab is shown (ТЗ 24): the chosen day — its entries as cards, and the deadlines
  // ahead of it.
  // `next` (ТЗ 47 §1.5): the column of the tab in the new interface — «Выбранный день» and «Впереди» fold by their
  // heads (kept on this Mac), the entries as cards on `card`, «+ Задача» the main button, the deadlines ahead with
  // their dates in IBM Plex Mono `todo`
  let { shown: c, next = false }: { shown: CalState; next?: boolean } = $props();
  const foldKey = (k: string) => 'calendar:fold:' + k;
  const readFold = (k: string) => {
    try {
      return localStorage.getItem(foldKey(k)) === '1';
    } catch {
      return false;
    }
  };
  let folded = $state({ day: readFold('day'), ahead: readFold('ahead') });
  function fold(k: 'day' | 'ahead') {
    folded[k] = !folded[k];
    try {
      localStorage.setItem(foldKey(k), folded[k] ? '1' : '0');
    } catch {
      /* private: kept for the session */
    }
  }
  const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const shortDate = (iso: string) => {
    const d = fromIso(iso);
    return `${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
  };
  const day = $derived(c ? fromIso(c.date) : new Date());
  const list = $derived(c ? (calendar.days(day, day).get(c.date) ?? []) : []);
  const ahead = $derived.by(() => {
    if (!c) return [] as CalEntry[];
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const to = new Date(day.getFullYear(), day.getMonth() + 3, day.getDate());
    const hidden = new Set(calendar.hiddenNow);
    return sortDay(entriesIn(calendar.files.filter((f) => !hidden.has(f.name)), from, to).filter((e) => e.layer === 'deadline'))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(0, 3);
  });
  // the entry chosen in the calendar (ТЗ 34): its task here, «Выполнено» and «Перенести…» do what the menu does
  const picked = $derived(calendar.picked);
  const pf = $derived(picked ? calendar.fileOf(picked.path) : undefined);
  const ph = $derived(picked && pf ? pf.headings.find((h) => h.line === picked.line) : undefined);
  const pDone = $derived(!!ph?.keyword && !!pf?.wf.done.includes(ph.keyword));
  const clean = (t: string) => t.replace(/\s*\[\d*(?:\/\d*|%)\]/g, '').trim();
  function choose(ev: MouseEvent, e: CalEntry) {
    if (ev.metaKey) return calendar.openEntry(e, true);
    calendar.pick(e);
    calendar.aside(ev);
  }
  const wfOf = (e: CalEntry) => calendar.files.find((f) => f.path === e.path)?.wf;
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  /** «work › Календарь»: where a new entry goes. */
  const place = (kind: 'task' | 'event') => {
    const t = calendar.target(kind);
    if (!t.file) return null;
    return [t.file.name.replace(/\.org$/, '').split('/').join(' › '), t.heading].filter(Boolean).join(' › ');
  };
  const tPlace = $derived(place('task'));
  const ePlace = $derived(place('event'));
  const when = (iso: string) => {
    const d = fromIso(iso);
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WD[d.getDay()]}`;
  };
</script>

{#if next}
<section class="nday">
  {#if picked && ph && pf}
    <div class="ntask" aria-label="Выбранная задача">
      <div class="lbl">Задача</div>
      <div class="ncard">
        {#if ph.keyword}<span class="cap kw tone-chip" style={toneVars(ph.keyword, pf.wf)}>{ph.keyword}</span>{/if}
        <b class="nt">{clean(ph.title)}</b>
        <span class="nw">{pf.name.replace(/\.org$/, '').split('/').join(' › ')}</span>
      </div>
      <div class="nbtns">
        {#if ph.keyword && !pDone}<button class="main" onclick={() => void calendar.done(picked)}>Выполнено</button>{/if}
        {#if picked.layer !== 'done'}<button onclick={() => void calendar.reschedule(picked)}>Перенести…</button>{/if}
        <button onclick={() => calendar.openEntry(picked)}>Открыть</button>
      </div>
    </div>
  {/if}
  <button class="lbl head" aria-expanded={!folded.day} onclick={() => fold('day')}>Выбранный день<span class="chev" aria-hidden="true">{folded.day ? '›' : '⌄'}</span></button>
  {#if !folded.day}
    <div class="ndt">{dayTitle(day)} <span>{relWords(day)}</span></div>
    <div class="ncards">
      {#each list as e (e.path + e.line + e.layer + (e.time ?? ''))}
        <button class="ncard" class:done={e.layer === 'done'} class:picked={calendar.isPicked(e)} onclick={(ev) => choose(ev, e)} ondblclick={() => calendar.openEntry(e)} oncontextmenu={(ev) => calendar.menuOf(ev, e)}>
          {#if e.layer === 'event'}
            <span class="cap tm">{e.time ?? 'весь день'}</span>
          {:else if e.layer === 'deadline'}
            <span class="cap dl">СРОК</span>
          {:else if e.keyword}
            <span class="cap kw tone-chip" style={wfOf(e) ? toneVars(e.keyword, wfOf(e)!) : ''}>{e.keyword}</span>
          {/if}
          <b class="nt">{#if e.priority}<i class="pr">[#{e.priority}]</i>{' '}{/if}{e.title}</b>
          <span class="nw">{e.where}</span>
        </button>
      {:else}
        <p class="none">На этот день ничего нет</p>
      {/each}
    </div>
    <div class="nbtns">
      <button class="main" onclick={() => c && calendar.openNew('task', c.date)}>+ Задача</button>
      <button onclick={() => c && calendar.openNew('event', c.date)}>+ Событие</button>
    </div>
    <div class="nwhere">
      {#if !tPlace && !ePlace}
        Файл для новых записей не выбран
      {:else if tPlace === ePlace || calendar.cfg.pick === 'ask'}
        создаётся в {tPlace ?? ePlace}
      {:else}
        задачи — в {tPlace ?? 'Inbox'}, события — в {ePlace ?? 'Inbox'}
      {/if}
    </div>
  {/if}
  {#if ahead.length}
    <button class="lbl head ah-head" aria-expanded={!folded.ahead} onclick={() => fold('ahead')}>Впереди<span class="chev" aria-hidden="true">{folded.ahead ? '›' : '⌄'}</span></button>
    {#if !folded.ahead}
      {#each ahead as e (e.path + e.line + e.day)}
        <button class="nah" onclick={() => calendar.openEntry(e)}><span class="nd">{shortDate(e.day)}</span><span class="na">{e.title}</span></button>
      {/each}
    {/if}
  {/if}
</section>
{:else}
<section class="day" aria-label="Выбранный день">
  {#if picked && ph && pf}
    <div class="task" aria-label="Выбранная задача">
      <div class="cap">ЗАДАЧА</div>
      <div class="pt">{#if ph.keyword}<span class="kw tone-chip" style={toneVars(ph.keyword, pf.wf)}>{ph.keyword}</span>{' '}{/if}{clean(ph.title)}</div>
      <div class="pw">{pf.name.replace(/\.org$/, '').split('/').join(' › ')}</div>
      <div class="pbtns">
        {#if ph.keyword && !pDone}<button class="pri" onclick={() => void calendar.done(picked)}>Выполнено</button>{/if}
        {#if picked.layer !== 'done'}<button onclick={() => void calendar.reschedule(picked)}>Перенести…</button>{/if}
      </div>
      <button class="open" onclick={() => calendar.openEntry(picked)}>Открыть в заметках</button>
    </div>
    <div class="sep"></div>
  {/if}
  <div class="cap">ВЫБРАННЫЙ ДЕНЬ</div>
  <div class="dt">{dayTitle(day)}</div>
  <div class="rel">{relWords(day)}</div>
  <div class="cards">
    {#each list as e (e.path + e.line + e.layer + (e.time ?? ''))}
      <button class="card" class:done={e.layer === 'done'} class:picked={calendar.isPicked(e)} onclick={(ev) => choose(ev, e)} ondblclick={() => calendar.openEntry(e)} oncontextmenu={(ev) => calendar.menuOf(ev, e)}>
        {#if e.layer === 'event'}
          <span class="tm">{e.time ?? 'весь день'}</span>
        {:else if e.layer === 'deadline'}
          <span class="kw dl">СРОК</span>
        {:else}
          <span class="kw tone-chip" style={e.keyword && wfOf(e) ? toneVars(e.keyword, wfOf(e)!) : ''}>{e.keyword}</span>
        {/if}
        <span class="tt"><span class="t">{#if e.priority}<b class="pr">[#{e.priority}]</b>{' '}{/if}{e.title}</span><span class="w">{e.where}</span></span>
      </button>
    {:else}
      <p class="none">На этот день ничего нет</p>
    {/each}
  </div>
  <div class="add">
    <button onclick={() => c && calendar.openNew('task', c.date)}><b>+</b> Задача</button>
    <button onclick={() => c && calendar.openNew('event', c.date)}><b>+</b> Событие</button>
  </div>
  <div class="where">
    {#if !tPlace && !ePlace}
      Файл для новых записей не выбран
    {:else if tPlace === ePlace || calendar.cfg.pick === 'ask'}
      Создаётся в {tPlace ?? ePlace}
    {:else}
      Задачи — в {tPlace ?? 'Inbox'}, события — в {ePlace ?? 'Inbox'}
    {/if}
    · <button class="link" onclick={() => calendar.settings()}>Изменить в настройках</button>
  </div>
  {#if ahead.length}
    <div class="sep"></div>
    <div class="cap">ВПЕРЕДИ</div>
    {#each ahead as e (e.path + e.line + e.day)}
      <button class="ah" onclick={() => calendar.openEntry(e)}><span>Дедлайн: {e.title}</span><span class="w">{when(e.day)}</span></button>
    {/each}
  {/if}
</section>
{/if}

<style>
  /* ---- the new interface's column (ТЗ 47 §1.5) ---- */
  .nday { display: flex; flex-direction: column; gap: 8px; color: var(--ink); font: 12px/1.4 var(--ui); }
  .lbl { font-size: 11px; font-weight: 600; color: var(--ink3); }
  .head { display: flex; align-items: center; gap: 6px; width: 100%; padding: 0; border: 0; background: none; text-align: left; font-family: var(--ui); cursor: default; }
  .head .chev { margin-left: auto; font-size: 10px; }
  .head:focus-visible { outline: 2px solid var(--lamp); outline-offset: 2px; border-radius: 4px; }
  .ah-head { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--rule); }
  .ndt { font-size: 15px; font-weight: 600; }
  .ndt span { font-size: 12px; font-weight: 400; color: var(--ink3); margin-left: 4px; }
  .ncards { display: flex; flex-direction: column; gap: 6px; }
  .ncard { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 8px 10px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); text-align: left; }
  .ncard.picked { box-shadow: inset 0 0 0 1.5px var(--lampink); }
  .ncard.done { opacity: 0.55; }
  .ncard.done .nt { text-decoration: line-through; }
  .cap { display: inline-flex; align-items: center; height: 17px; padding: 0 6px; border-radius: 4px; font: 600 10px var(--font-mono, ui-monospace, monospace); letter-spacing: 0.02em; }
  .cap.tm { color: var(--lampink); background: color-mix(in srgb, var(--lampink) 14%, transparent); }
  .cap.dl { color: var(--todo); background: color-mix(in srgb, var(--todo) 14%, transparent); }
  .nt { font-size: 12.5px; font-weight: 600; line-height: 1.3; }
  .nt .pr { font-style: normal; color: var(--wait); }
  .nw { font-size: 11px; color: var(--ink3); }
  .nbtns { display: flex; gap: 6px; margin-top: 2px; }
  .nbtns button { flex: 1; height: 28px; padding: 0 8px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); white-space: nowrap; }
  .nbtns button.main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .nwhere { font-size: 11px; color: var(--ink3); }
  .ntask { display: flex; flex-direction: column; gap: 6px; padding-bottom: 14px; margin-bottom: 6px; border-bottom: 1px solid var(--rule); }
  .nah { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; border: 0; background: none; color: var(--ink); text-align: left; font: 12px var(--ui); }
  .nah:hover .na { text-decoration: underline; }
  .nd { flex: 0 0 auto; font: 10.5px var(--font-mono, ui-monospace, monospace); color: var(--todo); }
  .na { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .task { display: flex; flex-direction: column; gap: 6px; }
  .pt { font-size: 14px; font-weight: 600; line-height: 1.3; }
  .pt .kw { font-size: 10px; vertical-align: 1px; }
  .pw { font-size: 12px; color: var(--fg2); }
  .pbtns { display: flex; gap: 8px; margin-top: 4px; }
  .pbtns button { flex: 1; height: 28px; border: 0; border-radius: 6px; background: var(--field); color: var(--fg); font: inherit; font-size: 12.5px; }
  .pbtns button.pri { background: var(--acc); color: var(--onacc); font-weight: 600; }
  .open { height: 28px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--acc); font: inherit; font-size: 12.5px; }
  .card.picked { box-shadow: inset 0 0 0 1.5px var(--acc); }
  .day { display: flex; flex-direction: column; gap: 6px; padding: 14px; overflow: auto; }
  .cap { font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .dt { font-size: 16px; font-weight: 700; }
  .rel { font-size: 12px; color: var(--fg2); margin-bottom: 8px; }
  .cards { display: flex; flex-direction: column; gap: 6px; }
  .card { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; color: var(--fg); text-align: left; }
  .card.done .t { text-decoration: line-through; color: var(--fg3); }
  .tm { flex: 0 0 auto; font-family: var(--mono); font-size: 11.5px; color: var(--acc); font-weight: 700; }
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .kw.dl { color: var(--todo); background: color-mix(in srgb, var(--todo) 16%, transparent); }
  .tt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .t { font-weight: 500; }
  .pr { color: var(--wait); }
  .w { font-size: 11.5px; color: var(--fg2); }
  .none { margin: 0; color: var(--fg2); font-size: 12.5px; }
  .add { display: flex; gap: 6px; margin-top: 10px; }
  .add button { flex: 1; height: 28px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font-size: 12.5px; font-weight: 500; }
  .add b { color: var(--acc); font-weight: 700; }
  .where { font-size: 11.5px; color: var(--fg2); line-height: 1.45; }
  .link { border: 0; padding: 0; background: transparent; color: var(--acc); font-size: 11.5px; }
  .sep { height: 1px; background: var(--line); margin: 8px 0; }
  .ah { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 4px 0; border: 0; background: transparent; color: var(--fg); text-align: left; }
</style>
