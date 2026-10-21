// «Презентация» (fix-59-1 §4): what each layout does and how it is written — the card of the layouts' menu and of the
// «?» by its button. `code` in the words is drawn as code.

import type { Layout } from './model';

/** The scheme of a layout in a box of 32 × 20 (the menu's icon and the card's large one). */
export const SCHEME: Record<Layout, string> = {
  title: 'M4 13h16M4 16h10',
  text: 'M4 5h14M4 9h22M4 12h20M4 15h18',
  'text-image': 'M4 5h10M4 9h12M4 12h11M18 4h10v12H18z',
  two: 'M4 5h14M4 9h10M4 12h9M18 9h10M18 12h9',
  quote: 'M7 8h18M9 11h14M12 15h8',
  image: 'M3 3h26v14H3zM3 13l7-5 6 5 4-3 9 6',
  free: 'M4 4h10M5 8h9v8H5zM18 6h9v5h-9zM18 13h9v3h-9z',
};

export const HINTS: Record<Layout, { words: string; example: string }> = {
  title: { words: 'Название крупно, внизу слайда. Текст под заголовком — подзаголовок.', example: '* Ищем тимлида\nЮрий Богданов' },
  text: { words: 'Название и текст: абзацы, списки, таблицы.', example: '* Этапы\n- Знакомство\n- Интервью' },
  'text-image': { words: 'Текст слева, первая картинка справа. `:IMAGE: left` — картинка слева.', example: '* Кого ищем\n- 6 человек\n[[file:img/team.png]]' },
  two: { words: 'Строка `-----` делит текст на левую и правую колонку. Без неё текст делится пополам по абзацам.', example: '- Планирование\n- Демо по пятницам\n-----\n- Свобода в инструментах' },
  quote: { words: 'Текст между `#+begin_quote` и `#+end_quote` — крупно по центру. Строка после блока — подпись.', example: '#+begin_quote\nНужен человек, который…\n#+end_quote\n— из разговора с командой' },
  image: { words: 'Первая картинка на весь слайд. Название не выводится — оно видно в ленте.', example: '* Схема\n[[file:img/roadmap.png]]' },
  free: { words: 'Каждый подзаголовок слайда — блок. Двигайте и тяните за края мышью, «+ Блок» добавляет новый.', example: '* Что будет делать\n** Люди\n1-1, найм, рост' },
};

/** The words split into text and code (between backticks). */
export const parts = (w: string) => w.split('`').map((t, i) => ({ t, code: i % 2 === 1 }));
