// The filters of the tab of the results (ТЗ 53 §4): they choose from what was found, they do not search again. A match
// belongs to the heading nearest above it — its status, its tags with the inherited ones; its file. Files: all on, one
// taken off drops its group; statuses: any of the chosen (ИЛИ), none chosen — no filter; tags: every chosen (И). The
// numbers of a filter are counted over what passes the others, not itself (as a catalogue's facets).

export interface Facet {
  file: string; // the file's path
  status: string; // '' — no status
  tags: string[]; // lower case
}
export interface Filters {
  off: Set<string>; // files taken off
  status: Set<string>;
  tags: Set<string>; // lower case
}
export const noFilters = (): Filters => ({ off: new Set(), status: new Set(), tags: new Set() });
export const anyFilter = (f: Filters) => f.off.size > 0 || f.status.size > 0 || f.tags.size > 0;

type Part = 'file' | 'status' | 'tags';
/** It passes the filters (`skip`: all but that one). */
export function passes(x: Facet, f: Filters, skip?: Part): boolean {
  if (skip !== 'file' && f.off.has(x.file)) return false;
  if (skip !== 'status' && f.status.size && !f.status.has(x.status)) return false;
  if (skip !== 'tags') for (const t of f.tags) if (!x.tags.includes(t)) return false;
  return true;
}
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
/** The numbers by each filter's values, over what passes the others; the matches that pass them all. */
export function facetCounts(all: Facet[], f: Filters): { files: Map<string, number>; status: Map<string, number>; tags: Map<string, number>; shown: number } {
  const files = new Map<string, number>();
  const status = new Map<string, number>();
  const tags = new Map<string, number>();
  let shown = 0;
  for (const x of all) {
    if (passes(x, f, 'file')) bump(files, x.file);
    if (passes(x, f, 'status')) bump(status, x.status);
    if (passes(x, f, 'tags')) for (const t of new Set(x.tags)) bump(tags, t);
    if (passes(x, f)) shown++;
  }
  return { files, status, tags, shown };
}
/** «12 из 48 — с фильтрами». */
export const filteredWord = (shown: number, total: number) => `${shown} из ${total} — с фильтрами`;
