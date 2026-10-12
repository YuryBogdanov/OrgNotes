// «Настройки → Календарь» (ТЗ 24) as a schema (roadmap 0.6): what new entries go to and get — in the notes folder;
// the look and the moves — on this Mac. The core draws it (SchemaSettings.svelte).

import { store } from '../store.svelte';
import { calendar } from './calendar.svelte';
import type { CalSettings } from '../calEdit';
import type { Opt, Schema, Values } from '../settingsSchema';

const fileShown = (rel: string | null) => {
  if (!rel) return store.inboxCfg.file ? `Inbox — ${store.inboxCfg.file.split('/').join(' / ')}` : 'Inbox (файл не выбран)';
  return rel.split('/').join(' / ') + (store.files.some((f) => f.name === rel) ? '' : ' — не найден');
};
/** The open statuses of the folder's sets (a set the feature registered included). */
const openStates = () => [...new Set(store.config.workflows.flatMap((sq) => sq.states.filter((x) => !x.done).map((x) => x.name)))];
const opts = (list: [Opt['value'], string][]): Opt[] => list.map(([value, label]) => ({ value, label }));
const heading = (s: string) => s.replace(/^\*+\s*/, '').trim();
const headHint = (k: 'taskHeading' | 'eventHeading') => (v: Values) =>
  v[k] ? 'Запись добавляется в конец этого заголовка; если его нет, он будет создан' : 'Без заголовка — в начало или конец файла, как в Inbox';
const hours = (from: number, n: number, off: (h: number) => boolean): Opt[] =>
  Array.from({ length: n }, (_, i) => from + i).map((h) => ({ value: h, label: `${h}:00`, disabled: off(h) }));

export const calendarSchema: Schema = {
  id: 'cal',
  label: 'Календарь',
  values: () => calendar.cfg as unknown as Values,
  set: (patch) => calendar.setCfg(patch as Partial<CalSettings>),
  groups: [
    {
      caption: 'КУДА СОХРАНЯЮТСЯ НОВЫЕ ЗАПИСИ',
      fields: [
        { key: 'pick', type: 'choice', look: 'segments', where: 'folder', label: 'Выбор файла', hint: 'Для кнопок «+ Задача» и «+ Событие» и двойного клика по дню',
          options: opts([['default', 'По умолчанию'], ['ask', 'Спрашивать'], ['last', 'Как в прошлый раз']]) },
        { key: 'taskFile', type: 'file', where: 'folder', label: 'Файл для задач', show: fileShown, clear: 'как Inbox' },
        { key: 'taskHeading', type: 'text', where: 'folder', label: 'Заголовок для задач', placeholder: 'Без заголовка', clean: heading, hint: headHint('taskHeading') },
        { key: 'eventFile', type: 'file', where: 'folder', label: 'Файл для событий', show: fileShown, clear: 'как Inbox' },
        { key: 'eventHeading', type: 'text', where: 'folder', label: 'Заголовок для событий', placeholder: 'Без заголовка', clean: heading, hint: headHint('eventHeading') },
      ],
      help: 'Файл не выбран — записи идут в файл Inbox. Заголовок — первого уровня, без звёздочки.',
    },
    {
      caption: 'ЧТО СОЗДАЁТСЯ',
      fields: [
        { key: 'taskStatus', type: 'choice', look: 'menu', where: 'folder', label: 'Статус новой задачи',
          options: () => [{ value: null, label: 'Начальный статус набора' }, ...openStates().map((s) => ({ value: s, label: s }))] },
        { key: 'eventStatus', type: 'choice', look: 'menu', where: 'folder', label: 'Статус нового события',
          options: (v) => {
            const all = openStates();
            const cur = v.eventStatus as string;
            return [{ value: '', label: 'Без статуса' }, ...(cur && !all.includes(cur) ? [cur, ...all] : all).map((s) => ({ value: s, label: s }))];
          } },
        { key: 'dateKind', type: 'choice', look: 'segments', where: 'folder', label: 'Дата, если создаёте по дню',
          options: opts([['SCHEDULED', 'SCHEDULED'], ['DEADLINE', 'DEADLINE'], ['plain', 'Просто дата']]) },
        { key: 'minutes', type: 'choice', look: 'menu', where: 'folder', label: 'Длительность события',
          options: opts([[30, '30 минут'], [60, '1 час'], [90, '1,5 часа'], [120, '2 часа']]) },
      ],
      help: 'Статус события ставится, если он есть в наборах файла; иначе событие создаётся без статуса. Длительность — для события со временем.',
    },
    {
      caption: 'ВИД',
      fields: [
        { key: 'view', type: 'choice', look: 'segments', where: 'local', label: 'Вид по умолчанию', options: opts([['month', 'Месяц'], ['week', 'Неделя']]) },
        { key: 'from', key2: 'to', type: 'pair', where: 'local', label: 'Часы в недельном виде', labels: ['С', 'До'],
          options: (v) => [hours(0, 13, (h) => h >= (v.to as number)), hours(12, 13, (h) => h <= (v.from as number))] },
        { key: 'weekNumbers', type: 'switch', where: 'local', label: 'Номера недель' },
        { key: 'weekends', type: 'switch', where: 'local', label: 'Показывать выходные' },
        { key: 'undated', type: 'switch', where: 'local', label: 'Блок «Без даты» в боковой панели' },
      ],
    },
    {
      caption: 'ПЕРЕНОС МЫШЬЮ',
      fields: [
        { key: 'keepDeadline', type: 'switch', where: 'local', label: 'Не менять дедлайн при переносе задачи',
          hint: (v) => (v.keepDeadline ? 'Меняется только дата SCHEDULED' : 'DEADLINE сдвигается на столько же дней') },
        { key: 'askRepeat', type: 'switch', where: 'local', label: 'Спрашивать при переносе повторяющейся записи', hint: 'Повтор переносится целиком: следующие пойдут от новой даты' },
      ],
      help: 'Перетащите плашку на другой день, в неделе — и на время. ⌘Z в календаре отменяет последний перенос.',
    },
  ],
};
