<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { toneFor } from './org';
  import { colorName } from './colors';
  import ColorPicker from './ColorPicker.svelte';
  import { MAX_KEYWORD, displayName, orgLine } from './workflowEditor';
  import { StatusEditor } from './statusesEditor.svelte';

  // «Статусы» of the settings (ТЗ 22 §3): the sets on the left, the chosen one's states on the right; the logic is the
  // shared StatusEditor.
  const ed = new StatusEditor();
  ed.effects();
</script>

<div class="body">
      <aside>
        <div class="cap">НАБОРЫ СТАТУСОВ</div>
        {#each ed.draft.workflows as w (w.id)}
          <div class="wfrow" class:over={ed.wfDrag.overId === w.id} use:ed.wfDrag.zone={w.id}>
            <button class="wf" class:on={w.id === ed.wf?.id} aria-pressed={w.id === ed.wf?.id} onclick={() => (ed.selectedId = w.id)}>
              <span class="wfh">
                <span class="wfgrip" role="img" aria-label="Перетащить набор" use:ed.wfDrag.handle={{ id: w.id }}>⋮⋮</span>
                <span class="wfn">{w.name || '—'}</span>
              </span>
              <span class="chips">
                {#each w.states.filter((s) => !s.pending) as s (s.id)}<span class="chip tone-chip" style={ed.chipStyle(s)}>{displayName(s.keyword) || '…'}</span>{/each}
              </span>
            </button>
          </div>
        {/each}
        <div class="wfend" class:over={ed.wfDrag.overId === 'end'} use:ed.wfDrag.zone={'end'}></div>
        <button class="add" onclick={ed.addSet}>+ Новый набор</button>
        <p class="help">Набор — это цепочка состояний. Первый набор в списке используется по умолчанию. Порядок меняется перетаскиванием. Переключаться между наборами на заголовке можно клавишами ⌃⇧← и ⌃⇧→.</p>
      </aside>

      {#if ed.wf}
        <section>
          <div class="head">
            <label class="field">
              <span>Название набора</span>
              <input aria-label="Название набора" value={ed.wf.name} oninput={(e) => (ed.wf.name = e.currentTarget.value)} />
            </label>
            <label class="field">
              <span>Состояние новой задачи</span>
              <select aria-label="Состояние новой задачи" value={ed.initial?.id} onchange={(e) => (ed.wf.initialId = e.currentTarget.value)}>
                {#each ed.openStates.filter((s) => !s.pending) as s (s.id)}<option value={s.id}>{displayName(s.keyword)}</option>{/each}
              </select>
            </label>
            <div class="tools">
              <button class="danger" aria-label="Удалить набор" disabled={!ed.canRemoveSet} title={ed.canRemoveSet ? '' : 'Единственный набор удалить нельзя'} onclick={ed.deleteWorkflow}>
                {ed.confirmWf ? `Удалить (в заметках: ${ed.wfUsed})?` : 'Удалить набор'}
              </button>
            </div>
          </div>
          {#each ed.problems.filter((p) => p.workflow === ed.wf.id && !p.state) as p}<div class="err">{p.message}</div>{/each}

          <div class="table" role="table" aria-label="Состояния набора">
            <div class="grid th" role="row">
              <span></span><span role="columnheader">ЦВЕТ</span>
              <span role="columnheader" class="lockh">НАЗВАНИЕ
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Только чтение"><rect x="4.5" y="9" width="11" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
              </span>
              <span role="columnheader" class="edith">В ФАЙЛЕ
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Редактируется"><path d="M3 17l1-4 9.5-9.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L7 16z" /></svg>
              </span>
              <span role="columnheader" class="edith">КЛАВИША
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Редактируется (клавиша)"><path d="M3 17l1-4 9.5-9.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L7 16z" /></svg>
              </span><span></span>
            </div>

            {#each [...ed.openStates, 'sep', ...ed.doneStates] as item (typeof item === 'string' ? 'sep' : item.id)}
              {#if typeof item === 'string'}
                <div class="sep" class:over={ed.rowDrag.overId === 'separator'} use:ed.rowDrag.zone={'separator'}>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg>
                  Ниже — завершающие состояния: задача считается закрытой
                </div>
              {:else}
                {@const s = item}
                {@const kw = ed.valueOf(s)}
                <div class="grid srow" class:over={ed.rowDrag.overId === s.id} class:isdone={s.done} class:bad={!!ed.errors[s.id]} role="row" tabindex="0" data-row={s.id}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" aria-label="{displayName(s.keyword) || 'Новое состояние'}. Option со стрелками вверх и вниз меняет порядок"
                  onkeydown={(e) => ed.rowKey(e, s)} use:ed.rowDrag.zone={s.id}>
                  <span class="grip" role="img" aria-label="Перетащить строку" use:ed.rowDrag.handle={{ id: s.id, image: '.srow' }}>⋮⋮</span>
                  <span class="colorcell">
                    <button class="swatch" aria-label="Цвет: {s.color ? colorName(s.color) : 'авто'}. Изменить" aria-haspopup="dialog" aria-expanded={ed.picker?.id === s.id}
                      onclick={(e) => ed.togglePicker(e, s)}>
                      <span class="dot tone-bg" style={ed.chipStyle(s)}></span>
                      <svg class="chev" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5l4 4 4-4" /></svg>
                    </button>
                  </span>
                  <span class="name" role="cell" class:chip={!!kw} class:tone-chip={!!kw} class:empty={!kw} style={kw ? ed.chipStyle(s) : ''}>{kw ? displayName(kw) : '—'}</span>
                  <span class="filecell">
                    <input class="kw" class:red={!!ed.errors[s.id]} role="cell" aria-label="Ключевое слово в файле" aria-invalid={!!ed.errors[s.id]}
                      placeholder="например, REVIEW" maxlength={MAX_KEYWORD + 8} spellcheck="false" autocomplete="off"
                      use:ed.track={s.id} value={kw}
                      oninput={(e) => ed.typing(s, e.currentTarget.value)} onkeydown={(e) => ed.keydown(e, s)} onblur={() => ed.blur(s)}
                      onfocus={() => ed.focused(s)} />
                  </span>
                  <span class="keycell">
                    <input class="qk" class:auto={!s.key && ed.keyEdits[s.id] === undefined} class:red={!!ed.errors['k' + s.id]} aria-label="Клавиша" aria-invalid={!!ed.errors['k' + s.id]}
                      spellcheck="false" autocomplete="off" disabled={s.pending}
                      value={ed.keyShown(s)} onfocus={(e) => e.currentTarget.select()} onmouseup={(e) => { e.preventDefault(); e.currentTarget.select(); }}
                      oninput={(e) => { ed.typingKey(s, (e instanceof InputEvent ? e.data : null) || e.currentTarget.value); e.currentTarget.value = ed.keyEdits[s.id] ?? ''; }} onkeydown={(e) => ed.keyKeydown(e, s)} onblur={() => ed.keyBlur(s)} />
                  </span>
                  <span class="acts">
                    <button class="x" aria-label="Удалить состояние {displayName(s.keyword)}" disabled={!ed.canRemove(s)}
                      title={ed.canRemove(s) ? '' : 'Последнее открытое состояние удалить нельзя'} onclick={() => ed.askDelete(s)}>×</button>
                  </span>
                </div>
                {#if ed.errors['k' + s.id]}
                  <div class="hint err">{ed.errors['k' + s.id]}</div>
                {:else if ed.errors[s.id]}
                  <div class="hint err">{ed.errors[s.id]}</div>
                {:else if s.pending}
                  <div class="hint">Введите ключевое слово и нажмите ↩ · ⎋ — отмена</div>
                {/if}
                {#each ed.problems.filter((p) => p.state === s.id) as p}<div class="hint err">{p.message}</div>{/each}
              {/if}
            {/each}

            <div class="addrow" class:over={ed.rowDrag.overId === 'end'} use:ed.rowDrag.zone={'end'}>
              <button onclick={() => ed.plus(false)}>+ Состояние</button>
              <button onclick={() => ed.plus(true)}>+ Завершающее</button>
            </div>
          </div>
          <div class="note">Название строится из ключевого слова. Редактируются колонки «В файле» и «Клавиша».</div>

          <div class="block">
            <div class="cap">ПОВЕДЕНИЕ</div>
            <button class="sw-row" role="switch" aria-checked={ed.draft.behavior.closed} onclick={() => (ed.draft.behavior.closed = !ed.draft.behavior.closed)}>
              <span class="tg" class:on={ed.draft.behavior.closed}><span></span></span>
              <span>Записывать время закрытия <code>CLOSED:</code></span>
            </button>
            <button class="sw-row" role="switch" aria-checked={ed.draft.behavior.logbook} onclick={() => (ed.draft.behavior.logbook = !ed.draft.behavior.logbook)}>
              <span class="tg" class:on={ed.draft.behavior.logbook}><span></span></span>
              <span>Вести историю смены состояний в <code>:LOGBOOK:</code></span>
            </button>
            <div class="note">Поведение действует на весь проект и на все наборы.</div>
          </div>

          <div class="block">
            <div class="cap">КАК ЭТО ВЫГЛЯДИТ</div>
            <div class="flow">
              {#each ed.wf.states.filter((s) => !s.pending && s.keyword) as s, i (s.id)}
                <span class="fchip tone-chip" style={ed.chipStyle(s)}>{displayName(s.keyword)}</span>
                {#if i < ed.wf.states.filter((x) => !x.pending && x.keyword).length - 1}<span class="arrow" aria-hidden="true">→</span>{/if}
              {/each}
            </div>
            <div class="orgline" aria-label="Строка #+TODO">{orgLine(ed.wf)}</div>
            <div class="note">В файле ключевое слово не может содержать пробелов, поэтому «IN PROGRESS» записывается как IN-PROGRESS. Приложение не пишет эту строку в ваши файлы; она показана для Emacs.</div>
          </div>

          {#if ed.bannerCount}
            <div class="err banner">Изменения не сохраняются, пока есть ошибки ({ed.bannerCount}).</div>
          {/if}
        </section>
      {/if}
</div>

    {#if ed.picker && ed.pickerState}
      {@const ps = ed.pickerState}
      <ColorPicker value={ps.color} keyword={ps.keyword} fallback={toneFor(ps.keyword || 'X', ed.asWorkflow)}
        anchor={ed.picker?.anchor as HTMLElement} onpick={(c) => (ps.color = c)} onclose={() => (ed.picker = null)} />
    {/if}
    {#if ed.rename}
      <!-- «Отмена» of the dialog is the rename's «cancel» too -->
      <ConfirmDialog label="Переименование статуса" title="Заменить {ed.rename.from} на {ed.rename.to} в {ed.rename.count} заголовках?" onclose={() => ed.rename && ed.chooseRename('cancel')}
        actions={[{ label: 'Только в настройках', run: () => ed.chooseRename('settings') }, { label: 'Заменить в файлах', kind: 'primary', run: () => ed.chooseRename('files') }]}>
        Если оставить слово в заметках как есть, эти заголовки перестанут считаться задачами со статусом.
      </ConfirmDialog>
    {/if}

    {#if ed.confirmDelete}
      <ConfirmDialog label="Удаление статуса" title="{ed.confirmDelete.s.keyword} используется в {ed.confirmDelete.count} заголовках" onclose={() => (ed.confirmDelete = null)} actions={[{ label: 'Удалить', kind: 'danger', run: ed.doDelete }]}>
        Файлы не изменятся: слово останется в тексте, но перестанет считаться статусом.
      </ConfirmDialog>
    {/if}

<style>
  .body { flex: 1; min-height: 0; display: flex; }
  aside { flex: 0 0 270px; border-right: 1px solid var(--line); background: var(--side); padding: 14px 10px; overflow: auto; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--fg2); padding: 0 6px 6px; }
  .wfrow.over { box-shadow: inset 0 2px 0 var(--acc); }
  .wfend { height: 6px; }
  .wfend.over { box-shadow: inset 0 2px 0 var(--acc); }
  .wf { display: block; width: 100%; text-align: left; border: 0; background: transparent; border-radius: 8px; padding: 8px 10px; margin-bottom: 2px; }
  .wf.on { background: var(--sel); }
  .wfh { display: flex; gap: 8px; align-items: center; }
  .wfgrip { color: var(--fg3); cursor: grab; letter-spacing: -2px; }
  .wfn { font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 5px 0 0 22px; }
  .chip { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
  .add { width: 100%; margin-top: 4px; height: 30px; border: 1px dashed var(--line); background: transparent; border-radius: 7px; color: var(--acc); }
  .help { font-size: 12px; line-height: 1.5; color: var(--fg2); padding: 10px 6px; }
  /* a macOS switch */

  section { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 24px; display: flex; flex-direction: column; gap: 14px; }
  .head { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 200px; }
  .field > span { font-size: 12px; color: var(--fg2); }
  .field input, .field select { height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); font-size: 13.5px; font-weight: 600; -webkit-user-select: text; user-select: text; }
  .tools { margin-left: auto; display: flex; gap: 6px; }
  .tools button { height: 28px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--field); }
  .tools button:disabled { opacity: 0.4; }
  .danger { color: var(--todo); }

  /* one grid for the header and every row, so columns line up at any width */
  .table { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; flex: 0 0 auto; }
  section > * { flex-shrink: 0; }
  .grid { display: grid; grid-template-columns: 24px 56px minmax(120px, 1.1fr) minmax(150px, 1.2fr) 76px 40px; column-gap: 12px; align-items: center; padding: 0 10px; }
  .th { height: 30px; background: var(--side); font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .th span { text-align: left; }
  .lockh, .edith { display: inline-flex; align-items: center; gap: 5px; }
  .edith { color: var(--fg); }
  .srow { min-height: 44px; border-top: 1px solid var(--line); background: var(--bg); outline: none; }
  .srow:focus-visible { box-shadow: inset 0 0 0 2px var(--acc); }
  .srow.over, .sep.over, .addrow.over { box-shadow: inset 0 2px 0 var(--acc); }
  .grip { color: var(--fg3); cursor: grab; letter-spacing: -2px; -webkit-user-select: none; user-select: none; }
  .colorcell { display: flex; align-items: center; }
  .swatch { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 5px 0 0; border: 0; border-radius: 7px; background: transparent; color: var(--fg3); }
  .swatch:hover { background: var(--field); }
  .swatch:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
  .dot { width: 16px; height: 16px; border-radius: 8px; box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg) 18%, transparent); }
  /* the name as a capsule, like the chips in the list of workflows */
  .name { justify-self: start; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
  .name.chip { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; padding: 3px 9px; border-radius: 6px; }
  .name.empty { color: var(--fg3); font-family: var(--mono); font-size: 12.5px; }
  .kw { width: 100%; height: 28px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); font-family: var(--mono); font-size: 12.5px; -webkit-user-select: text; user-select: text; }
  .kw:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 25%, transparent); }
  .kw.red { border-color: var(--todo); box-shadow: 0 0 0 3px color-mix(in srgb, var(--todo) 20%, transparent); }
  .qk { width: 44px; height: 28px; padding: 0; text-align: center; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); font-family: var(--mono); font-size: 12.5px; -webkit-user-select: text; user-select: text; }
  .qk.auto { color: var(--fg2); }
  .qk:disabled { background: transparent; border-color: transparent; }
  .qk:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 25%, transparent); }
  .qk.red { border-color: var(--todo); }
  .acts { display: flex; justify-content: flex-end; }
  .x { width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: var(--fg3); font-size: 16px; }
  .x:hover:not(:disabled) { background: var(--field); color: var(--todo); }
  .x:disabled { opacity: 0.3; }
  .hint { padding: 3px 12px 8px 128px; font-size: 12px; color: var(--fg2); background: var(--bg); }
  .hint.err { color: var(--todo); }
  .sep { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px; font-size: 12px; color: var(--fg2); background: var(--side); border-top: 1px solid var(--line); }
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
  .err.banner { padding: 8px 12px; border-radius: 6px; background: color-mix(in srgb, var(--todo) 12%, transparent); }
</style>
