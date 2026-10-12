<script lang="ts">
  import { store } from './store.svelte';
  import { calendar } from './features/calendar.svelte';
  import Picker from './Picker.svelte';

  // «Настройки → Календарь» (ТЗ 24), a section the calendar registers (views.ts). Its look repeats the sheet's own
  // (until the settings are drawn by schema, roadmap 0.6).
  let pickCal = $state<'task' | 'event' | null>(null); // «Выбрать…» of the file for tasks / events
  const calPath = (rel: string | null) => {
    if (!rel) return store.inboxCfg.file ? `Inbox — ${store.inboxCfg.file.split('/').join(' / ')}` : 'Inbox (файл не выбран)';
    return rel.split('/').join(' / ') + (store.files.some((f) => f.name === rel) ? '' : ' — не найден');
  };
  const allStates = $derived([...new Set(store.config.workflows.flatMap((sq) => sq.states.filter((x) => !x.done).map((x) => x.name)))]);
  const eventStates = $derived(calendar.cfg.eventStatus && !allStates.includes(calendar.cfg.eventStatus) ? [calendar.cfg.eventStatus, ...allStates] : allStates);
  const LEN: [number, string][] = [[30, '30 минут'], [60, '1 час'], [90, '1,5 часа'], [120, '2 часа']];
  const c = $derived(calendar.cfg);
  // ⎋ closes the picker of a file first, not the sheet
  const esc = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && pickCal) {
      e.preventDefault();
      pickCal = null;
    }
  };
</script>

<svelte:window onkeydowncapture={esc} />

<div class="body">
  <section class="general" aria-label="Календарь">
    <div class="cap">КУДА СОХРАНЯЮТСЯ НОВЫЕ ЗАПИСИ</div>
    <div class="opts">
      <div class="opt">
        <span class="olab"><span id="cal-pick">Выбор файла</span><small>Для кнопок «+ Задача» и «+ Событие» и двойного клика по дню</small></span>
        <div class="segs" role="radiogroup" aria-labelledby="cal-pick">
          {#each [['default', 'По умолчанию'], ['ask', 'Спрашивать'], ['last', 'Как в прошлый раз']] as [v, t] (v)}
            <button role="radio" aria-checked={c.pick === v} class:on={c.pick === v} onclick={() => void calendar.setCfg({ pick: v as typeof c.pick })}>{t}</button>
          {/each}
        </div>
      </div>
      {#each [['task', 'задач'], ['event', 'событий']] as [k, w] (k)}
        {@const fileKey = k === 'task' ? 'taskFile' : 'eventFile'}
        {@const headKey = k === 'task' ? 'taskHeading' : 'eventHeading'}
        <div class="opt">
          <span id="cal-{k}-file">Файл для {w}</span>
          <span class="ibfile">
            <span class="val" aria-labelledby="cal-{k}-file" data-testid="cal-{k}-file">{calPath(c[fileKey])}</span>
            {#if c[fileKey]}<button class="change" aria-label="Файл для {w}: как Inbox" title="Как Inbox" onclick={() => void calendar.setCfg({ [fileKey]: null })}>×</button>{/if}
            <button class="change" aria-label="Выбрать файл для {w}" onclick={() => (pickCal = k as 'task' | 'event')}>Выбрать…</button>
          </span>
        </div>
        <div class="opt">
          <span class="olab"><label for="cal-{k}-head">Заголовок для {w}</label><small>{c[headKey] ? 'Запись добавляется в конец этого заголовка; если его нет, он будет создан' : 'Без заголовка — в начало или конец файла, как в Inbox'}</small></span>
          <input id="cal-{k}-head" class="sel txt" value={c[headKey]} placeholder="Без заголовка" spellcheck="false"
            onchange={(e) => void calendar.setCfg({ [headKey]: e.currentTarget.value.replace(/^\*+\s*/, '').trim() })} />
        </div>
      {/each}
    </div>
    <p class="help">Файл не выбран — записи идут в файл Inbox. Заголовок — первого уровня, без звёздочки. Настройки хранятся в папке заметок.</p>

    <div class="cap">ЧТО СОЗДАЁТСЯ</div>
    <div class="opts">
      <div class="opt">
        <label for="cal-tstatus">Статус новой задачи</label>
        <select id="cal-tstatus" class="sel" value={c.taskStatus ?? ''} onchange={(e) => void calendar.setCfg({ taskStatus: e.currentTarget.value || null })}>
          <option value="">Начальный статус набора</option>
          {#each allStates as st (st)}<option value={st}>{st}</option>{/each}
        </select>
      </div>
      <div class="opt">
        <label for="cal-estatus">Статус нового события</label>
        <select id="cal-estatus" class="sel" value={c.eventStatus} onchange={(e) => void calendar.setCfg({ eventStatus: e.currentTarget.value })}>
          <option value="">Без статуса</option>
          {#each eventStates as st (st)}<option value={st}>{st}</option>{/each}
        </select>
      </div>
      <div class="opt">
        <span id="cal-dkind">Дата, если создаёте по дню</span>
        <div class="segs" role="radiogroup" aria-labelledby="cal-dkind">
          {#each [['SCHEDULED', 'SCHEDULED'], ['DEADLINE', 'DEADLINE'], ['plain', 'Просто дата']] as [v, t] (v)}
            <button role="radio" aria-checked={c.dateKind === v} class:on={c.dateKind === v} onclick={() => void calendar.setCfg({ dateKind: v as typeof c.dateKind })}>{t}</button>
          {/each}
        </div>
      </div>
      <div class="opt">
        <label for="cal-len">Длительность события</label>
        <select id="cal-len" class="sel" value={String(c.minutes)} onchange={(e) => void calendar.setCfg({ minutes: +e.currentTarget.value })}>
          {#each LEN as [m, t] (m)}<option value={String(m)}>{t}</option>{/each}
        </select>
      </div>
    </div>
    <p class="help">Статус события ставится, если он есть в наборах файла; иначе событие создаётся без статуса. Длительность — для события со временем.</p>

    <div class="cap">ВИД</div>
    <div class="opts">
      <div class="opt">
        <span id="cal-view">Вид по умолчанию</span>
        <div class="segs" role="radiogroup" aria-labelledby="cal-view">
          <button role="radio" aria-checked={c.view === 'month'} class:on={c.view === 'month'} onclick={() => void calendar.setCfg({ view: 'month' })}>Месяц</button>
          <button role="radio" aria-checked={c.view === 'week'} class:on={c.view === 'week'} onclick={() => void calendar.setCfg({ view: 'week' })}>Неделя</button>
        </div>
      </div>
      <div class="opt">
        <span id="cal-hours">Часы в недельном виде</span>
        <span class="hrs" role="group" aria-labelledby="cal-hours">
          <select class="sel" aria-label="С" value={String(c.from)} onchange={(e) => void calendar.setCfg({ from: +e.currentTarget.value })}>
            {#each Array.from({ length: 13 }, (_, i) => i) as h (h)}<option value={String(h)} disabled={h >= c.to}>{h}:00</option>{/each}
          </select>
          –
          <select class="sel" aria-label="До" value={String(c.to)} onchange={(e) => void calendar.setCfg({ to: +e.currentTarget.value })}>
            {#each Array.from({ length: 13 }, (_, i) => 12 + i) as h (h)}<option value={String(h)} disabled={h <= c.from}>{h}:00</option>{/each}
          </select>
        </span>
      </div>
      {#each [['weekNumbers', 'Номера недель'], ['weekends', 'Показывать выходные'], ['undated', 'Блок «Без даты» в боковой панели']] as [k, t] (k)}
        {@const key = k as 'weekNumbers' | 'weekends' | 'undated'}
        <div class="opt">
          <label for="cal-{k}">{t}</label>
          <button id="cal-{k}" class="switch" role="switch" aria-checked={c[key]} aria-label={t} onclick={() => void calendar.setCfg({ [key]: !c[key] })}><span></span></button>
        </div>
      {/each}
    </div>

    <div class="cap">ПЕРЕНОС МЫШЬЮ</div>
    <div class="opts">
      <div class="opt">
        <span class="olab"><label for="cal-keepdl">Не менять дедлайн при переносе задачи</label><small>{c.keepDeadline ? 'Меняется только дата SCHEDULED' : 'DEADLINE сдвигается на столько же дней'}</small></span>
        <button id="cal-keepdl" class="switch" role="switch" aria-checked={c.keepDeadline} aria-label="Не менять дедлайн при переносе задачи" onclick={() => void calendar.setCfg({ keepDeadline: !c.keepDeadline })}><span></span></button>
      </div>
      <div class="opt">
        <span class="olab"><label for="cal-askrep">Спрашивать при переносе повторяющейся записи</label><small>Повтор переносится целиком: следующие пойдут от новой даты</small></span>
        <button id="cal-askrep" class="switch" role="switch" aria-checked={c.askRepeat} aria-label="Спрашивать при переносе повторяющейся записи" onclick={() => void calendar.setCfg({ askRepeat: !c.askRepeat })}><span></span></button>
      </div>
    </div>
    <p class="help">Перетащите плашку на другой день, в неделе — и на время. ⌘Z в календаре отменяет последний перенос.</p>
  </section>
</div>
{#if pickCal}
      {@const k = pickCal}
      <Picker label={k === 'task' ? 'Файл для задач' : 'Файл для событий'} onclose={() => (pickCal = null)} onpick={(rel) => void calendar.setCfg(k === 'task' ? { taskFile: rel } : { eventFile: rel })} />
    {/if}

<style>
  section > * { flex-shrink: 0; }
  section { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 24px; display: flex; flex-direction: column; gap: 14px; }
  .body { flex: 1; min-height: 0; display: flex; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--fg2); padding: 0 6px 6px; }
  .help { font-size: 12px; line-height: 1.5; color: var(--fg2); padding: 10px 6px; }
  .general { max-width: 760px; }
  .opts { display: flex; flex-direction: column; gap: 6px; }
  .sel { height: 26px; max-width: 260px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); padding: 0 6px; font-size: 12.5px; }
  .val { font-size: 12.5px; color: var(--fg2); }
  .segs { display: flex; padding: 2px; background: var(--field); border-radius: 7px; gap: 2px; }
  .segs button { height: 22px; padding: 0 10px; white-space: nowrap; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 12px; }
  .segs button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); font-weight: 500; }
  .ibfile { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .ibfile .val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .change { flex: 0 0 auto; height: 24px; padding: 0 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; }
  .opt { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 12px; background: var(--side); border: 1px solid var(--line); border-radius: 8px; }
  .opt label { font-size: 13px; }
  .olab { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .olab small { font-size: 11.5px; color: var(--fg2); }
  .sel.txt { width: 200px; padding: 0 8px; -webkit-user-select: text; user-select: text; }
  .hrs { display: flex; align-items: center; gap: 6px; color: var(--fg2); }
  .switch { flex: 0 0 auto; position: relative; width: 32px; height: 18px; padding: 0; border: 0; border-radius: 9px; background: var(--field); box-shadow: inset 0 0 0 1px var(--line); transition: background 0.15s; }
  .switch span { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 7px; background: var(--onpacc); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
  .switch[aria-checked='true'] { background: var(--acc); box-shadow: none; }
  .switch[aria-checked='true'] span { transform: translateX(14px); }
  .switch:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
</style>
