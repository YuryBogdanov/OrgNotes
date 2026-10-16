<script lang="ts">
  import Switch from './Switch.svelte';
  import { store } from './store.svelte';

  // «Настройки → Основные» (tech sprint 4.2, from Settings.svelte): the notes folder, the navigator, the levels of
  // headings, the rich text, the drawers, the links — the view preferences of this Mac.
</script>

<section class="general spage" aria-label="Основные">
  <div class="cap">РАБОЧАЯ ПАПКА</div>
  <div class="opt">
    <div class="folder">
      <span class="fname">{store.dir ? store.dir.split('/').pop() : 'Не выбрана'}</span>
      {#if store.dir}<span class="fpath" title={store.dir}>{store.dir.replace(/^\/Users\/[^/]+/, '~')}</span>{/if}
    </div>
    <!-- the settings close: what they show belongs to the folder being left -->
    <button class="btn" onclick={() => { store.closeSettings(); void store.changeFolder(); }}>Изменить…</button>
  </div>
  <p class="help">Приложение работает с одной папкой: все org-файлы в ней и её подпапках. Сменить её можно и в меню «Файл → Открыть другую папку…».</p>
  <div class="cap">НАВИГАТОР</div>
  <div class="opt">
    <label for="nav-headings">Показывать заголовки в навигаторе</label>
    <Switch id="nav-headings" checked={store.navHeadings} label="Показывать заголовки в навигаторе" onchange={() => store.setNavHeadings(!store.navHeadings)} />
  </div>
  <p class="help">Структура файла всегда есть в инспекторе, на вкладке «Структура», и в командной палитре по «#». Настройка хранится на этом Mac.</p>
  <div class="cap">УРОВНИ ЗАГОЛОВКОВ</div>
  <div class="opts">
    <div class="opt">
      <label for="one-star">Одна звёздочка на уровень</label>
      <Switch id="one-star" checked={store.levels.oneStar} label="Одна звёздочка на уровень" onchange={() => store.setLevels({ oneStar: !store.levels.oneStar })} />
    </div>
    <div class="opt">
      <label for="indent-text">Сдвигать текст по уровню</label>
      <Switch id="indent-text" checked={store.levels.indent} label="Сдвигать текст по уровню" onchange={() => store.setLevels({ indent: !store.levels.indent })} />
    </div>
    <div class="opt">
      <span id="step-l">Шаг отступа</span>
      <div class="stepper" role="group" aria-labelledby="step-l">
        <button aria-label="Меньше" disabled={store.levels.step <= 1} onclick={() => store.setLevels({ step: store.levels.step - 1 })}>−</button>
        <span class="sv" aria-live="polite">{store.levels.step} симв.</span>
        <button aria-label="Больше" disabled={store.levels.step >= 4} onclick={() => store.setLevels({ step: store.levels.step + 1 })}>+</button>
      </div>
    </div>
  </div>
  <p class="help">Только вид в редакторе: звёздочки и пробелы в файлах не меняются. «Вид › Структурный вид» включает и выключает обе настройки сразу. Настройки хранятся на этом Mac.</p>
  <div class="cap">ОФОРМЛЕННЫЙ ТЕКСТ</div>
  <div class="opts">
    <div class="opt">
      <label for="rich-on">Оформленный текст</label>
      <Switch id="rich-on" checked={store.rich} label="Оформленный текст" onchange={() => store.setRich(!store.rich)} />
    </div>
    <div class="opt">
      <label for="rich-nums">Номера строк в оформленном виде</label>
      <Switch id="rich-nums" checked={store.richNumbers} label="Номера строк в оформленном виде" onchange={() => store.setRichNumbers(!store.richNumbers)} />
    </div>
  </div>
  <p class="help">Статусы, приоритеты и теги — капсулами, даты — плашками, заголовки крупнее, разметка без служебных символов. Строка под курсором показывается как есть. Текст файла не меняется. То же — «Вид › Оформленный текст» и переключатель «Текст / Оформление» над редактором. Настройки хранятся на этом Mac.</p>
  <div class="cap">DRAWERS</div>
  <div class="opts">
    <div class="opt">
      <label for="fold-drawers">Сворачивать drawers при открытии файла</label>
      <Switch id="fold-drawers" checked={store.foldDrawers} label="Сворачивать drawers при открытии файла" onchange={() => store.setFoldDrawers(!store.foldDrawers)} />
    </div>
  </div>
  <p class="help">Блоки :PROPERTIES:, :LOGBOOK: и другие показываются одной строкой с «…», в том числе новые — от Inbox и смены статуса. Tab на этой строке или клик по «…» разворачивает. Только вид: файл не меняется. Настройка хранится на этом Mac.</p>
  <div class="cap">ССЫЛКИ</div>
  <div class="opt">
    <span id="links-l">Ссылки на заголовки</span>
    <div class="lseg" role="radiogroup" aria-labelledby="links-l">
      <button role="radio" aria-checked={store.linkFormat === 'id'} class:on={store.linkFormat === 'id'} onclick={() => store.setLinkFormat('id')}>По ID</button>
      <button role="radio" aria-checked={store.linkFormat === 'title'} class:on={store.linkFormat === 'title'} onclick={() => store.setLinkFormat('title')}>По названию</button>
    </div>
  </div>
  <p class="help">{store.linkFormat === 'id' ? 'Ссылка не ломается при переименовании и переносе. К заголовку добавляется свойство :ID:.' : 'Файл не меняется, но ссылка ломается, если заголовок переименовать.'} «Копировать ссылку на заголовок» — ⌃C L; выделите текст и нажмите ⌘V, чтобы сделать его ссылкой. Настройка хранится на этом Mac.</p>
  <div class="cap">ЭКСПЕРИМЕНТАЛЬНОЕ</div>
  <div class="opts">
    <div class="opt">
      <label for="next-ui">Новый интерфейс (бета)</label>
      <Switch id="next-ui" checked={store.nextUi} label="Новый интерфейс (бета)" onchange={() => void store.setInterface(!store.nextUi)} />
    </div>
  </div>
  <p class="help">Окно перезапустится. Файлы, вкладки и настройки общие со старым интерфейсом.</p>
  <div class="cap">КЛАВИШИ</div>
  <div class="opt">
    <div class="folder">
      <span>Сочетания клавиш перенесены в раздел «Клавиши»</span>
      <span class="fpath">Набор «Как в Emacs / Как в macOS» и все команды</span>
    </div>
    <button class="btn" onclick={() => store.showSection('Клавиши')}>Открыть…</button>
  </div>
</section>

<style>
  .stepper { display: flex; align-items: center; gap: 2px; padding: 2px; border-radius: 7px; background: var(--field); }
  .stepper button { width: 24px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; font-size: 14px; }
  .stepper button:hover:not(:disabled) { background: var(--bg); }
  .stepper button:disabled { opacity: 0.35; }
  .stepper button:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
  .sv { min-width: 56px; text-align: center; font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .folder { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
  .fname { font-size: 13px; font-weight: 600; }
  .fpath { font-size: 12px; color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lseg { display: flex; padding: 2px; gap: 2px; border-radius: 7px; background: var(--field); }
  .lseg button { height: 22px; padding: 0 10px; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 12px; }
  .lseg button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); font-weight: 500; }
</style>
