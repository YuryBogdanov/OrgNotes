// Notes for the search: a work file with «бюджет» in headings, text and a folded drawer; a second file; a big one.
export const WORK = [
  '#+TITLE: Работа',
  '* Q4 2026',
  '** TODO Подготовить бюджет 2027 :budget:',
  ':PROPERTIES:',
  ':NOTE: бюджет в свойствах',
  ':END:',
  'Свести заявки и показать бюджет CTO.',
  '*** DONE Собрать заявки',
  '*** NEXT Бюджетный план по направлениям',
  'Бюджет на ёлку и подарки.',
  '* Найм',
  '** NEXT План найма на Q4',
  'Согласовать бюджет найма.',
  'Кандидаты на бюджет 2027.',
  '',
].join('\n');
export const FILES = () => ({
  '/mock/work.org': WORK,
  '/mock/Работа/finance.org': '* Бюджеты\n** Бюджет 2026\nИтоги по бюджету.\n',
  '/mock/journal.org': '* Октябрь\nНичего про деньги.\n',
});
