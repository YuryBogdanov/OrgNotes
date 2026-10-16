import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';
import { addNote, lastNote, notesOf } from './logbook';

// ТЗ 40 §3: the status of a matter as a note of Org in :LOGBOOK:, and the last one read back.

const NOW = new Date(2026, 9, 16, 11, 20);
const hs = (t: string) => parseHeadings(t, DEFAULT_WORKFLOW);

describe('a note into :LOGBOOK:', () => {
  it('on top of the drawer, as C-c C-z writes it', () => {
    const t = '* WAIT Миграция\n:LOGBOOK:\n- State "WAIT"       from "NEXT"       [2026-10-02 Чт 11:20]\n:END:\nтело\n';
    expect(addNote(t, hs(t)[0], 'бизнес ответил: стартуем после релиза 4.2', NOW)).toBe(
      '* WAIT Миграция\n:LOGBOOK:\n- Note taken on [2026-10-16 Пт 11:20] \\\\\n  бизнес ответил: стартуем после релиза 4.2\n- State "WAIT"       from "NEXT"       [2026-10-02 Чт 11:20]\n:END:\nтело\n',
    );
  });
  it('no drawer: made after the properties (or the planning)', () => {
    const t = '* Найм\nSCHEDULED: <2026-10-20 Вт>\n:PROPERTIES:\n:ID: x\n:END:\nтело\n';
    expect(addNote(t, hs(t)[0], 'две строки\nвторая', NOW)).toBe(
      '* Найм\nSCHEDULED: <2026-10-20 Вт>\n:PROPERTIES:\n:ID: x\n:END:\n:LOGBOOK:\n- Note taken on [2026-10-16 Пт 11:20] \\\\\n  две строки\n  вторая\n:END:\nтело\n',
    );
  });
});

describe('the last note', () => {
  const T = [
    '* WAIT Миграция',
    ':LOGBOOK:',
    '- State "WAIT"       from "NEXT"       [2026-10-12 Пн 09:00] \\\\',
    '  ждём бизнес',
    '- Note taken on [2026-10-02 Чт 11:20] \\\\',
    '  черновик у Глеба',
    '  до пятницы',
    '- State "NEXT"       from "TODO"       [2026-10-14 Ср 10:00]',
    'CLOCK: [2026-10-15 Чт 10:00]--[2026-10-15 Чт 11:00] =>  1:00',
    ':END:',
    'тело',
    '** TODO Подзадача',
    ':LOGBOOK:',
    '- Note taken on [2026-10-15 Чт 12:00] \\\\',
    '  это заметка подзадачи',
    ':END:',
  ].join('\n');
  it('the newest by its date; the words after a change of status count; a change without words does not', () => {
    expect(lastNote(T.split('\n'), hs(T)[0])).toEqual({ at: new Date(2026, 9, 12, 9, 0), text: 'ждём бизнес' });
  });
  it('a note of several lines is one line; the child has its own', () => {
    const t = T.replace('[2026-10-12 Пн 09:00]', '[2026-09-12 Сб 09:00]');
    expect(lastNote(t.split('\n'), hs(t)[0])).toEqual({ at: new Date(2026, 9, 2, 11, 20), text: 'черновик у Глеба до пятницы' });
    expect(lastNote(T.split('\n'), hs(T)[1])!.text).toBe('это заметка подзадачи');
  });
  it('all of them, the newest first (the popover shows three)', () => {
    expect(notesOf(T.split('\n'), hs(T)[0]).map((n) => n.text)).toEqual(['ждём бизнес', 'черновик у Глеба до пятницы']);
  });
  it('two notes of the same minute: the upper one is the newer', () => {
    const t = addNote(addNote('* A\n', hs('* A\n')[0], 'первая', NOW), hs(addNote('* A\n', hs('* A\n')[0], 'первая', NOW))[0], 'вторая', NOW);
    expect(notesOf(t.split('\n'), hs(t)[0]).map((n) => n.text)).toEqual(['вторая', 'первая']);
  });
  it('none: null', () => {
    expect(lastNote(['* A', 'тело'], hs('* A\nтело')[0])).toBeNull();
  });
});
