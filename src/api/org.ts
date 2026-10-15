// @panopticon/api/org (ТЗ 27 §2.1): Org as a library — pure functions on text, no state of the core. A plugin bundles
// it with itself (so it stays with an isolated plugin too) and uses it where it works on its own structure in a file:
// inside `tx.update(path, fn)`, or on the text of `files.read`. The core uses the same code.

export { parseHeadings, setKeyword, setPriority, headingLines, inactiveStamp, sequenceFor, startOf, type Heading, type Workflow, type OrgDate } from '../org';
import { parseHeadings, toneFor, type Heading, type Workflow } from '../org';
import type { Ctx } from './index';
import { toneStyle } from '../colors';
export { setPlanning, setTags, splitTags, parseDate, weekdayNames } from '../edits';
export { stampText, shiftDate, longDate, relWords } from '../calendar';
export { listEnter, listIndent, type Edit } from '../textList';
export { setProperty, insertHeading, replaceBody, treeOf } from '../orgOps';
export { relevel, place, moveTo, moveWithin } from '../refile';
// the index of dated entries (ТЗ 24): what the calendar shows, by day — the core's month under a review's card too
export {
  LAYERS, isoDay, fromIso, hasDated, entriesIn, sortDay, byDay, undated, monthWeeks, weekDays, weekNumber, monthTitle, monthSub, weekSub,
  dayTitle, dayShort, weekdayShort, entriesWord, layoutEvents, type Layer, type CalFile, type CalEntry,
} from '../calIndex';

/** The workflow `parseHeadings` needs, from the keywords of `index.workflow(path)` (and its sets, for `sequenceFor`
 *  and the statuses' colours). */
export const workflow = (w: { open: string[]; done: string[]; sets?: { name: string; states: { name: string; done: boolean; color?: string }[] }[] }) => ({
  open: [...w.open],
  done: [...w.done],
  ...(w.sets?.length ? { sequences: w.sets.map((s) => ({ name: s.name, states: s.states.map((x) => ({ name: x.name, done: !!x.done, ...(x.color ? { color: x.color } : {}) })) })) } : {}),
});
/** The colour of a status as the core draws it, for an element with the class `tone-chip` or `var(--tl)` / `var(--td)`
 *  (its light and dark shades): «--tl:…;--td:…». */
export const toneVars = (keyword: string, wf: Workflow) => toneStyle(toneFor(keyword, wf));

/** A file of the notes read as Org (tech sprint 3.3: the loader the plugins had each): its text, its statuses as
 *  `index.workflow` gives them (`info`) and as `parseHeadings` needs them (`wf`), its headings. Null: it is gone. */
export interface OrgFile {
  path: string;
  text: string;
  info: Awaited<ReturnType<NonNullable<Ctx['index']>['workflow']>>;
  wf: Workflow;
  headings: Heading[];
}
export async function readOrg(ctx: Pick<Ctx, 'files' | 'index'>, path: string): Promise<OrgFile | null> {
  try {
    const [text, info] = await Promise.all([ctx.files!.read(path), ctx.index!.workflow(path)]);
    const wf = workflow(info) as Workflow;
    return { path, text, info, wf, headings: parseHeadings(text, wf) };
  } catch {
    return null; // gone meanwhile
  }
}
