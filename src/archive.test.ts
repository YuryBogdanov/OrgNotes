import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';
import { archiveEntry, archivePath, archiveTarget, categoryOf, readLocation } from './archive';

describe('the archive, as Emacs keeps it', () => {
  it('where: «<file>_archive» next to it, else «#+ARCHIVE:»', () => {
    expect(archivePath('* x', 'work/platform.org')).toBe('work/platform.org_archive');
    expect(archivePath('#+ARCHIVE: %s_old::\n* x', 'work/platform.org')).toBe('work/platform.org_old');
    expect(archivePath('#+ARCHIVE: ../archive/all.org::* Из платформы\n* x', 'work/platform.org')).toBe('archive/all.org');
    expect(archivePath('* x\n#+ARCHIVE: no.org::', 'p.org')).toBe('p.org_archive'); // only the header's
  });
  it('the category: #+CATEGORY, else the file\'s name', () => {
    expect(categoryOf('#+CATEGORY: infra\n* x', 'work/platform.org')).toBe('infra');
    expect(categoryOf('* x', 'work/platform.org')).toBe('platform');
  });
  it('what: the subtree with ARCHIVE_TIME, _FILE, _CATEGORY, _TODO; the old properties kept', () => {
    const T = '* TODO Обновить Kafka :infra:\nSCHEDULED: <2026-10-12 Пн>\n:PROPERTIES:\n:ID: k1\n:END:\nтекст\n** подзадача\n\n* Дальше\n';
    const hs = parseHeadings(T, DEFAULT_WORKFLOW);
    const e = archiveEntry(T, hs[0], DEFAULT_WORKFLOW, { now: new Date(2026, 9, 14, 9, 5), file: '/notes/work/platform.org', category: 'platform' });
    expect(e).toBe([
      '* TODO Обновить Kafka :infra:', 'SCHEDULED: <2026-10-12 Пн>', ':PROPERTIES:', ':ID: k1',
      ':ARCHIVE_TIME: 2026-10-14 Ср 09:05', ':ARCHIVE_FILE: /notes/work/platform.org', ':ARCHIVE_CATEGORY: platform', ':ARCHIVE_TODO: TODO',
      ':END:', 'текст', '** подзадача',
    ].join('\n'));
  });
  it('where a heading goes (ТЗ 41 §7): its «:ARCHIVE:», an ancestor\'s, the file\'s, else «%s_archive::» at the top level', () => {
    const T = ['#+ARCHIVE: old/%s::', '* Проекты', ':PROPERTIES:', ':ARCHIVE: done.org::* Закрытые', ':END:', '** TODO Kafka', '* Прочее', '** Задача', ''].join('\n');
    const hs = parseHeadings(T, DEFAULT_WORKFLOW);
    const at = (title: string) => archiveTarget(T, hs, hs.find((h) => h.title === title)!, 'work/platform.org');
    expect(at('Kafka')).toEqual({ file: 'work/done.org', heading: 'Закрытые' }); // the ancestor's property
    expect(at('Задача')).toEqual({ file: 'work/old/platform.org', heading: null }); // the file's
    const plain = parseHeadings('* x\n', DEFAULT_WORKFLOW);
    expect(archiveTarget('* x\n', plain, plain[0], 'inbox.org')).toEqual({ file: 'inbox.org_archive', heading: null });
    expect(readLocation('::* Архив', 'a/b.org')).toEqual({ file: 'a/b.org', heading: 'Архив' }); // the same file
  });
});
