// The app only works with .org files, so the extension is never shown: "Планёрка тимлидов", not "Планёрка тимлидов.org".
// It stays where the real file is meant: "Скопировать путь", the tab tooltip, the text of the files.

/** "Команда/report.v2.org" → "report.v2": the last segment without its final ".org". */
export const displayName = (rel: string) => noOrg(rel.split('/').pop() ?? rel);
export const noOrg = (s: string) => s.replace(/\.org$/i, '');
/** "Команда/Рост/Сергей Белов.org" → ["Команда", "Рост", "Сергей Белов"]. */
export const displayPath = (rel: string) => {
  const parts = rel.split('/');
  parts[parts.length - 1] = noOrg(parts[parts.length - 1]);
  return parts;
};
/** What "Сохранить как…" writes: ".org" is added unless the name already ends with it ("Привет.org" stays). */
export const withOrg = (name: string) => (/\.org$/i.test(name) ? name : name + '.org');
