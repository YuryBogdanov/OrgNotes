<script lang="ts">
  import { store } from './store.svelte';
  import { kwTone } from './org';
  import {
    COLORS, addState, addWorkflow, dropState, fromConfig, keywordOf, moveState, moveWorkflow, orgLine,
    removeState, removeWorkflow, toJson, validate, type DraftState,
  } from './workflowEditor';

  let draft = $state(fromConfig(store.config));
  let selectedId = $state(draft.workflows[0]?.id ?? '');
  const wf = $derived(draft.workflows.find((w) => w.id === selectedId) ?? draft.workflows[0]);
  const problems = $derived(validate(draft));
  const json = $derived(toJson(store.configText, draft));
  // nothing is written until the user actually changes something
  let baseline = toJson(store.configText, draft);
  let savedFlash = $state(false);

  $effect(() => {
    const j = json;
    if (problems.length || j === baseline) return;
    const t = setTimeout(async () => {
      baseline = j;
      await store.saveConfig(j);
      savedFlash = true;
      setTimeout(() => (savedFlash = false), 1500);
    }, 250);
    return () => clearTimeout(t);
  });

  const problemsFor = (stateId: string) => problems.filter((p) => p.state === stateId);
  const wfProblems = $derived(wf ? problems.filter((p) => p.workflow === wf.id && !p.state) : []);

  // how many headings use each status, to warn before it is removed or renamed
  const usage = $derived.by(() => {
    const m = new Map<string, number>();
    for (const f of store.files) for (const h of f.headings) if (h.keyword) m.set(h.keyword, (m.get(h.keyword) ?? 0) + 1);
    return m;
  });
  const used = (s: DraftState) => usage.get(keywordOf(s.label)) ?? 0;

  const COLOR_VAR: Record<string, string> = { gray: '--fg3', red: '--todo', blue: '--next', orange: '--wait', green: '--done', purple: '--purple' };
  const COLOR_RU: Record<string, string> = { gray: 'серый', red: 'красный', blue: 'синий', orange: 'оранжевый', green: 'зелёный', purple: 'фиолетовый' };
  const tone = (s: DraftState) =>
    s.color ? COLOR_VAR[s.color] : kwTone(keywordOf(s.label), { open: [], done: s.done ? [keywordOf(s.label)] : [] });

  // two-step delete when the status is in use
  let confirmState = $state<string | null>(null);
  let confirmWf = $state(false);
  function delState(s: DraftState) {
    if (used(s) > 0 && confirmState !== s.id) {
      confirmState = s.id;
      return;
    }
    confirmState = null;
    removeState(wf, s.id);
  }
  const wfUsed = $derived(wf ? wf.states.reduce((n, s) => n + used(s), 0) : 0);
  function delWorkflow() {
    if (wfUsed > 0 && !confirmWf) {
      confirmWf = true;
      return;
    }
    confirmWf = false;
    const idx = draft.workflows.findIndex((w) => w.id === wf.id);
    removeWorkflow(draft, wf.id);
    selectedId = draft.workflows[Math.max(0, idx - 1)]?.id ?? '';
  }
  $effect(() => {
    selectedId; // switching workflow clears pending confirmations
    confirmState = null;
    confirmWf = false;
  });

  // drag and drop of rows
  let dragId = $state<string | null>(null);
  let overId = $state<string | null>(null); // state id, 'separator' or 'end'
  const onDrop = (e: DragEvent, before: string | 'separator' | null) => {
    e.preventDefault();
    if (dragId) dropState(wf, dragId, before);
    dragId = overId = null;
  };

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') store.settingsOpen = false;
  }
  const open = $derived(wf ? wf.states.filter((s) => !s.done) : []);
  const done = $derived(wf ? wf.states.filter((s) => s.done) : []);
</script>

<svelte:window onkeydown={key} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onmousedown={() => (store.settingsOpen = false)}>
  <div class="win" role="dialog" aria-modal="true" aria-label="Настройки" onmousedown={(e) => e.stopPropagation()}>
    <header>
      <div class="ttl">Настройки</div>
      <div class="tabs" role="tablist" aria-label="Разделы настроек">
        {#each ['Основные', 'Статусы', 'Теги', 'Агенды', 'Файлы'] as t}
          <button role="tab" aria-selected={t === 'Статусы'} class:on={t === 'Статусы'} disabled={t !== 'Статусы'} title={t === 'Статусы' ? '' : 'Пока не реализовано'}>{t}</button>
        {/each}
      </div>
      <span class="flash" class:show={savedFlash}>Сохранено в .orgnotes/config.json</span>
      <button class="close" aria-label="Закрыть настройки" onclick={() => (store.settingsOpen = false)}>×</button>
    </header>

    <div class="body">
      <aside>
        <div class="cap">НАБОРЫ СТАТУСОВ</div>
        {#each draft.workflows as w (w.id)}
          <button class="wf" class:on={w.id === wf?.id} aria-pressed={w.id === wf?.id} onclick={() => (selectedId = w.id)}>
            <span class="wfn">{w.name || '—'}</span>
            <span class="chips">
              {#each w.states as s (s.id)}<span class="chip">{keywordOf(s.label) || '…'}</span>{/each}
            </span>
          </button>
        {/each}
        <button class="add" onclick={() => (selectedId = addWorkflow(draft).id)}>+ Новый набор</button>
        <p class="help">Набор — это цепочка состояний. Первый набор в списке используется по умолчанию. Переключаться между наборами на заголовке можно клавишами ⌃⇧← и ⌃⇧→.</p>
      </aside>

      {#if wf}
        <section>
          <div class="head">
            <label class="field">
              <span>Название набора</span>
              <input aria-label="Название набора" bind:value={wf.name} />
            </label>
            <div class="field">
              <span>Состояние новой задачи</span>
              <div class="start" title="Первое состояние в списке. Меняется перетаскиванием строки наверх.">{open[0] ? keywordOf(open[0].label) : '—'}</div>
            </div>
            <div class="tools">
              <button aria-label="Набор выше" onclick={() => moveWorkflow(draft, wf.id, -1)} disabled={draft.workflows[0]?.id === wf.id}>↑</button>
              <button aria-label="Набор ниже" onclick={() => moveWorkflow(draft, wf.id, 1)} disabled={draft.workflows.at(-1)?.id === wf.id}>↓</button>
              <button class="danger" aria-label="Удалить набор" disabled={draft.workflows.length === 1} onclick={delWorkflow}>
                {confirmWf ? `Удалить (в заметках: ${wfUsed})?` : 'Удалить набор'}
              </button>
            </div>
          </div>
          {#each wfProblems as p}<div class="err">{p.message}</div>{/each}

          <div class="table" role="table" aria-label="Состояния набора">
            <div class="th"><span></span><span>ЦВЕТ</span><span>НАЗВАНИЕ</span><span>В ФАЙЛЕ</span><span>КЛАВИША</span><span></span></div>

            {#each [...open, 'sep', ...done] as item, i (typeof item === 'string' ? 'sep' : item.id)}
              {#if typeof item === 'string'}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="sep" class:over={overId === 'separator'} ondragover={(e) => { e.preventDefault(); overId = 'separator'; }} ondrop={(e) => onDrop(e, 'separator')}>
                  Ниже — завершающие состояния: задача считается закрытой <span class="bar">|</span>
                </div>
              {:else}
                {@const s = item}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="srow" class:over={overId === s.id} class:done={s.done} draggable="true" role="row"
                  ondragstart={() => (dragId = s.id)} ondragend={() => (dragId = overId = null)}
                  ondragover={(e) => { e.preventDefault(); overId = s.id; }} ondrop={(e) => onDrop(e, s.id)}>
                  <span class="grip" aria-hidden="true">⋮⋮</span>
                  <span class="color">
                    <span class="sw" style="background:var({tone(s)})"></span>
                    <select aria-label="Цвет состояния" bind:value={s.color}>
                      <option value="">авто</option>
                      {#each COLORS as c}<option value={c}>{COLOR_RU[c]}</option>{/each}
                    </select>
                  </span>
                  <input class="nm" aria-label="Название состояния" bind:value={s.label} />
                  <span class="kwcol" title="Так слово записывается в файл">
                    {keywordOf(s.label)}{#if used(s)}<em>&nbsp;·&nbsp;{used(s)}</em>{/if}
                  </span>
                  <input class="qk" aria-label="Клавиша" maxlength="1" bind:value={s.key} />
                  <span class="acts">
                    <button aria-label="Выше" onclick={() => moveState(wf, s.id, -1)}>↑</button>
                    <button aria-label="Ниже" onclick={() => moveState(wf, s.id, 1)}>↓</button>
                    <button class="x" class:warn={confirmState === s.id} aria-label="Удалить состояние" onclick={() => delState(s)}>
                      {confirmState === s.id ? `Удалить (${used(s)})?` : '×'}
                    </button>
                  </span>
                </div>
                {#each problemsFor(s.id) as p}<div class="err inrow">{p.message}</div>{/each}
              {/if}
            {/each}

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="addrow" class:over={overId === 'end'} ondragover={(e) => { e.preventDefault(); overId = 'end'; }} ondrop={(e) => onDrop(e, null)}>
              <button onclick={() => addState(draft, wf)}>+ Состояние</button>
              <button onclick={() => addState(draft, wf, true)}>+ Завершающее</button>
            </div>
          </div>

          <div class="block">
            <div class="cap">ПОВЕДЕНИЕ</div>
            <button class="sw-row" role="switch" aria-checked={draft.behavior.closed} onclick={() => (draft.behavior.closed = !draft.behavior.closed)}>
              <span class="tg" class:on={draft.behavior.closed}><span></span></span>
              <span>Записывать время закрытия <code>CLOSED:</code></span>
            </button>
            <button class="sw-row" role="switch" aria-checked={draft.behavior.logbook} onclick={() => (draft.behavior.logbook = !draft.behavior.logbook)}>
              <span class="tg" class:on={draft.behavior.logbook}><span></span></span>
              <span>Вести историю смены состояний в <code>:LOGBOOK:</code></span>
            </button>
            <div class="note">Поведение действует на весь проект и на все наборы.</div>
          </div>

          <div class="block">
            <div class="cap">КАК ЭТО ВЫГЛЯДИТ</div>
            <div class="flow">
              {#each wf.states as s, i (s.id)}
                <span class="fchip" style="color:var({tone(s)});background:color-mix(in srgb, var({tone(s)}) 16%, transparent)">{keywordOf(s.label) || '…'}</span>
                {#if i < wf.states.length - 1}<span class="arrow" aria-hidden="true">→</span>{/if}
              {/each}
            </div>
            <div class="orgline" aria-label="Строка #+TODO">{orgLine(wf)}</div>
            <div class="note">В файле ключевое слово не может содержать пробелов, поэтому «IN PROGRESS» записывается как IN-PROGRESS. Приложение не пишет эту строку в ваши файлы; она показана для Emacs.</div>
          </div>

          {#if problems.length}
            <div class="err banner">Изменения не сохраняются, пока есть ошибки ({problems.length}).</div>
          {/if}
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.3); display: flex; align-items: center; justify-content: center; padding: 24px; }
  .win { width: min(1040px, 100%); height: min(760px, 100%); display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4); }
  header { display: flex; align-items: center; gap: 16px; padding: 10px 14px; background: var(--bar); border-bottom: 1px solid var(--line); }
  .ttl { font-weight: 600; width: 90px; }
  .tabs { display: flex; gap: 2px; }
  .tabs button { border: 0; background: transparent; padding: 5px 14px; border-radius: 7px; color: var(--fg2); }
  .tabs button.on { background: var(--field); color: var(--fg); font-weight: 600; }
  .tabs button:disabled { opacity: 0.45; }
  .flash { margin-left: auto; font-size: 12px; color: var(--done); opacity: 0; transition: opacity 0.2s; }
  .flash.show { opacity: 1; }
  .close { border: 0; background: transparent; font-size: 20px; width: 28px; height: 28px; color: var(--fg2); border-radius: 6px; }
  .close:hover { background: var(--field); }

  .body { flex: 1; min-height: 0; display: flex; }
  aside { flex: 0 0 270px; border-right: 1px solid var(--line); background: var(--side); padding: 14px 10px; overflow: auto; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--fg2); padding: 0 6px 6px; }
  .wf { display: block; width: 100%; text-align: left; border: 0; background: transparent; border-radius: 8px; padding: 8px 10px; margin-bottom: 2px; }
  .wf.on { background: var(--sel); }
  .wfn { display: block; font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
  .chip { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: var(--field); color: var(--fg2); }
  .add { width: 100%; margin-top: 8px; height: 30px; border: 1px dashed var(--line); background: transparent; border-radius: 7px; color: var(--acc); }
  .help { font-size: 12px; line-height: 1.5; color: var(--fg2); padding: 10px 6px; }

  section { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 24px; display: flex; flex-direction: column; gap: 16px; }
  .head { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 200px; }
  .field > span { font-size: 12px; color: var(--fg2); }
  .field input, .start { height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); font-size: 14px; font-weight: 600; -webkit-user-select: text; user-select: text; }
  .start { display: flex; align-items: center; background: var(--field); font-family: var(--mono); font-size: 13px; }
  .tools { margin-left: auto; display: flex; gap: 6px; }
  .tools button, .acts button { height: 28px; min-width: 28px; padding: 0 8px; border: 0; border-radius: 6px; background: var(--field); }
  .tools button:disabled, .acts button:disabled { opacity: 0.4; }
  .danger, .x { color: var(--todo); }
  .x.warn { background: var(--todo); color: var(--onacc); font-weight: 600; }

  .table { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .th, .srow { display: grid; grid-template-columns: 22px 150px minmax(120px, 1fr) minmax(110px, 160px) 70px auto; align-items: center; gap: 10px; padding: 0 10px; }
  .th { height: 28px; background: var(--side); font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .srow { min-height: 42px; border-top: 1px solid var(--line); background: var(--bg); }
  .srow.over, .sep.over, .addrow.over { box-shadow: inset 0 2px 0 var(--acc); }
  .grip { color: var(--fg3); cursor: grab; letter-spacing: -2px; }
  .color { display: flex; align-items: center; gap: 8px; }
  .sw { width: 12px; height: 12px; border-radius: 6px; flex: 0 0 12px; }
  .color select { flex: 1; min-width: 0; height: 26px; border: 0; border-radius: 6px; background: var(--field); }
  .nm, .qk { height: 28px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); -webkit-user-select: text; user-select: text; }
  .qk { width: 100%; text-align: center; font-family: var(--mono); }
  .kwcol { font-family: var(--mono); font-size: 12px; color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kwcol em { font-style: normal; color: var(--fg3); }
  .acts { display: flex; gap: 4px; }
  .sep { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px; font-size: 12px; color: var(--fg2); background: var(--side); border-top: 1px solid var(--line); }
  .bar { font-family: var(--mono); color: var(--fg); }
  .addrow { display: flex; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--line); }
  .addrow button { height: 28px; padding: 0 12px; border: 1px dashed var(--line); border-radius: 6px; background: transparent; color: var(--acc); }

  .block { display: flex; flex-direction: column; gap: 8px; }
  .sw-row { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; text-align: left; padding: 3px 0; }
  .tg { width: 34px; height: 20px; border-radius: 10px; background: var(--field); position: relative; flex: 0 0 34px; transition: background 0.15s; }
  .tg span { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 8px; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
  .tg.on { background: var(--acc); }
  .tg.on span { transform: translateX(14px); }
  code, .orgline { font-family: var(--mono); font-size: 12px; }
  .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .fchip { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 6px; }
  .arrow { color: var(--fg3); }
  .orgline { padding: 8px 10px; border-radius: 6px; background: var(--side); -webkit-user-select: text; user-select: text; }
  .note { font-size: 12px; color: var(--fg2); line-height: 1.5; }
  .err { color: var(--todo); font-size: 12px; }
  .err.inrow { padding: 4px 12px 8px 42px; background: var(--bg); }
  .err.banner { padding: 8px 12px; border-radius: 6px; background: color-mix(in srgb, var(--todo) 12%, transparent); }
</style>
