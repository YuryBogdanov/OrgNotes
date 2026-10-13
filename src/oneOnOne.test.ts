import { describe, expect, it } from 'vitest';
import { parseHeadings, DEFAULT_WORKFLOW } from './org';
import { everyWords, initialsOf, nameOf, newMeeting, oneOnOnes } from './oneOnOne';
import type { TFile } from './today';

const file = (name: string, text: string): TFile => ({ name, path: '/n/' + name, text, wf: DEFAULT_WORKFLOW, headings: parseHeadings(text, DEFAULT_WORKFLOW) });
const PETROV = [
  '#+TITLE: Петров Алексей', '',
  '* 1-1                                                  :1on1:', '<2026-09-30 Ср 15:00-15:45 +2w>',
  '** [2026-09-30 Ср]', '*** TODO Прислать план онбординга', '*** TODO Договориться про дежурства', '*** DONE Сделано',
  '** [2026-09-16 Ср]', '*** TODO Старое',
  '* Другое',
].join('\n');
const DAY = new Date(2026, 9, 14); // Wednesday, two weeks after 30 Sep

describe('1-1', () => {
  it('a card on the day of the repeat: name, time, how often, the last meeting, its open agreements', () => {
    const [c, ...rest] = oneOnOnes([file('people/petrov.org', PETROV)], DAY, '1on1');
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ name: 'Петров Алексей', initials: 'ПА', time: '15:00', end: '15:45', every: 'каждые 2 недели', open: 2, today: null, file: 'people/petrov.org' });
    expect(c.last).toEqual(new Date(2026, 8, 30));
    expect(oneOnOnes([file('people/petrov.org', PETROV)], new Date(2026, 9, 7), '1on1')).toEqual([]); // not a day of it
    expect(oneOnOnes([file('people/petrov.org', PETROV)], DAY, 'other')).toEqual([]);
  });
  it('the name falls back to the file; how often in words', () => {
    expect(nameOf({ name: 'people/maria.org', text: '* x' })).toBe('maria');
    expect(initialsOf('Мария')).toBe('М');
    expect(['+1w', '+2w', '+1m', '+3d', '+5w', '+1y'].map(everyWords)).toEqual(['каждую неделю', 'каждые 2 недели', 'каждый месяц', 'каждые 3 дня', 'каждые 5 недель', 'каждый год']);
  });
  it('«Новая встреча»: today\'s subheading first, an empty line under it; then the card knows it', () => {
    const f = file('people/petrov.org', PETROV);
    const r = newMeeting(f.text, f.headings, 2, DAY)!;
    expect(r.text.split('\n').slice(2, 7)).toEqual(['* 1-1                                                  :1on1:', '<2026-09-30 Ср 15:00-15:45 +2w>', '** [2026-10-14 Ср]', '', '** [2026-09-30 Ср]']);
    expect(r.line).toBe(5);
    expect(oneOnOnes([file('people/petrov.org', r.text)], DAY, '1on1')[0]).toMatchObject({ today: 4, open: 2 });
    const bare = file('p.org', '* 1-1 :1on1:\n<2026-10-14 Ср +1w>\n\n* Next');
    expect(newMeeting(bare.text, bare.headings, 0, DAY)!.text).toBe('* 1-1 :1on1:\n<2026-10-14 Ср +1w>\n** [2026-10-14 Ср]\n\n\n* Next');
  });
});
