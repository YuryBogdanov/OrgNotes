// The app only works with .org files, so the extension is never shown: "Планёрка тимлидов", not "Планёрка тимлидов.org".
// It stays where the real file is meant: "Скопировать путь", the tab tooltip, the text of the files.

/** "Команда/report.v2.org" → "report.v2": the last segment without its final ".org". */
export const displayName = (rel: string) => noOrg(rel.split('/').pop() ?? rel);
export const noOrg = (s: string) => s.replace(/\.org$/i, '');
/** An archive of a note as Emacs makes them («platform.org_archive», ТЗ 33): in the navigator, not in the agenda. */
export const isArchive = (rel: string) => /\.org_archive$/i.test(rel);
/** "Команда/Рост/Сергей Белов.org" → ["Команда", "Рост", "Сергей Белов"]. */
export const displayPath = (rel: string) => {
  const parts = rel.split('/');
  parts[parts.length - 1] = noOrg(parts[parts.length - 1]);
  return parts;
};
/** What "Сохранить как…" writes: ".org" is added unless the name already ends with it ("Привет.org" stays). */
export const withOrg = (name: string) => (/\.org$/i.test(name) ? name : name + '.org');

/**
 * The name of a note that has no file yet: its first non-empty line without the heading stars, at most 40
 * characters ("…" when cut). Used in the close dialog and as the suggested name in "Сохранить как".
 */
export function noteName(text: string, max = 40) {
  const line = text.split('\n').map((l) => l.replace(/^\*+\s*/, '').trim()).find((l) => l) ?? '';
  if (!line) return 'Без названия';
  const chars = [...line];
  return chars.length > max ? chars.slice(0, max - 1).join('').trimEnd() + '…' : line;
}

/** "в 2 вкладках", "в 21 вкладке". */
export const inTabs = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'вкладке' : 'вкладках'}`;
