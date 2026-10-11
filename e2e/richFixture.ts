// A file like the mockup of «Оформленный текст»: every drawn element once.
const d = (n: number) => {
  const x = new Date();
  x.setDate(x.getDate() + n);
  const p = (k: number) => String(k).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][x.getDay()]}`;
};
export const WORK = () =>
  [
    '#+TITLE: Работа',
    '#+FILETAGS: :work:',
    '',
    '* Q4 2026 :planning:',
    '** TODO [#A] Подготовить бюджет 2027 [1/3] :budget:finance:',
    `DEADLINE: <${d(13)}> SCHEDULED: <${d(3)}>`,
    ':PROPERTIES:',
    ':Effort:   6:00',
    ':END:',
    'Свести заявки *пяти команд* и показать CTO до конца месяца. Шаблон — =budget.xlsx=.',
    '*** DONE Собрать заявки от тимлидов',
    `CLOSED: [${d(-3)} 18:20]`,
    '*** NEXT Свести расходы по направлениям [1/3]',
    `SCHEDULED: <${d(1)}>`,
    '- [X] инфраструктура',
    '- [ ] найм',
    '- [ ] /обучение/ — уточнить у финансов',
    '*** TODO Согласовать с финансами',
    '** WAIT Ответ CTO по архитектуре :cto:',
    `DEADLINE: <${d(-2)}>`,
    'Черновик: [[file:arch.org][Архитектура 2027]]',
    '** NEXT План найма на Q4 :hr:',
    '- встреча с HR',
    '* Тимлиды',
    '| Команда   | Заявка   |',
    '|-----------+----------|',
    '| Платформа | получена |',
    '| Мобайл    | в работе |',
    '#+BEGIN_SRC org',
    '* TODO не заголовок',
    '#+END_SRC',
    '',
  ].join('\n');
export const FILES = () => ({ '/mock/work.org': WORK(), '/mock/arch.org': '* A\n' });
