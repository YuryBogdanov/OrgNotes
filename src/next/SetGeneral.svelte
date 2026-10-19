<script lang="ts">
  import { store } from '../store.svelte';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Segments from './ui/Segments.svelte';
  import Button from './ui/Button.svelte';

  // «Настройки → Основные» of the new interface (ТЗ 54 §3): the notes folder with how many files and how big, the
  // interface, the headings' levels, the links. The old interface's own («заголовки в навигаторе», «Оформленный
  // текст», the line numbers) are not here; the text's font, width, «Структура» and the drawers are in «Оформление».
  const plural = (n: number, a: string, b: string, c: string) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c);
  const bytes = $derived(store.files.reduce((n, f) => n + new TextEncoder().encode(f.text).length, 0));
  const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} МБ` : b >= 1024 ? `${Math.round(b / 1024)} КБ` : `${b} Б`);
  const n = $derived(store.files.length);
  const folder = $derived(store.dir ? store.dir.replace(/^\/Users\/[^/]+/, '~') : 'Не выбрана');
  const LINKS: { value: 'id' | 'title'; label: string }[] = [
    { value: 'id', label: 'По ID' },
    { value: 'title', label: 'По названию' },
  ];
  const STEPS = [
    { value: 1, label: 'Меньше' },
    { value: 2, label: 'Обычный' },
    { value: 3, label: 'Больше' },
    { value: 4, label: 'Крупный' },
  ];
</script>

<Group caption="Рабочая папка">
  <Row label={folder} hint={store.dir ? `${n} ${plural(n, 'файл', 'файла', 'файлов')} · ${size(bytes)}` : undefined}>
    <!-- the settings close: what they show belongs to the folder being left -->
    <Button onclick={() => { store.closeSettings(); void store.changeFolder(); }}>Изменить…</Button>
  </Row>
</Group>
<Group caption="Интерфейс">
  <Row label="Новый интерфейс" hint="Переключение перезагрузит окно" id="set-next">
    <Toggle checked={store.nextUi} labelledby="set-next" onchange={() => void store.setInterface(!store.nextUi)} />
  </Row>
</Group>
<Group caption="Заголовки">
  <Row label="Одна звёздочка на уровень" hint="Как org-odd-levels-only в Emacs" id="set-star">
    <Toggle checked={store.levels.oneStar} labelledby="set-star" onchange={() => store.setLevels({ oneStar: !store.levels.oneStar })} />
  </Row>
  <Row label="Сдвигать текст по уровню" id="set-indent">
    <Toggle checked={store.levels.indent} labelledby="set-indent" onchange={() => store.setLevels({ indent: !store.levels.indent })} />
  </Row>
  <Row label="Шаг отступа" id="set-step">
    <Segments value={store.levels.step} options={STEPS} labelledby="set-step" onchange={(v) => store.setLevels({ step: v })} />
  </Row>
</Group>
<Group caption="Ссылки">
  <Row label="Ссылки на заголовки" id="set-links"
    hint={store.linkFormat === 'id' ? 'По ID ссылка не ломается, если заголовок переименовать' : 'По названию файл не меняется, но ссылка ломается при переименовании'}>
    <Segments value={store.linkFormat} options={LINKS} labelledby="set-links" onchange={(v) => store.setLinkFormat(v)} />
  </Row>
</Group>
