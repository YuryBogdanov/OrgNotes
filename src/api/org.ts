// @panopticon/api/org (ТЗ 27 §2.1): Org as a library — pure functions on text, no state of the core. A plugin bundles
// it with itself (so it stays with an isolated plugin too) and uses it where it works on its own structure in a file:
// inside `tx.update(path, fn)`, or on the text of `files.read`. The core uses the same code.

export { parseHeadings, setKeyword, setPriority, headingLines, inactiveStamp, sequenceFor, type Heading, type Workflow, type OrgDate } from '../org';
export { setPlanning, setTags, splitTags, parseDate, weekdayNames } from '../edits';
export { stampText, shiftDate, longDate } from '../calendar';
export { listEnter, listIndent, type Edit } from '../textList';
export { setProperty, insertHeading, replaceBody, treeOf } from '../orgOps';
export { relevel, place, moveTo, moveWithin } from '../refile';
// the index of dated entries (ТЗ 24): what the calendar shows, by day — the core's month under a review's card too
export {
  LAYERS, isoDay, fromIso, hasDated, entriesIn, sortDay, byDay, undated, monthWeeks, weekDays, weekNumber, monthTitle, monthSub, weekSub,
  dayTitle, dayShort, weekdayShort, entriesWord, layoutEvents, type Layer, type CalFile, type CalEntry,
} from '../calIndex';

/** The workflow `parseHeadings` needs, from the keywords of `index.workflow(path)` (and its sets, for `sequenceFor`). */
export const workflow = (w: { open: string[]; done: string[]; sets?: { name: string; states: { name: string; done: boolean }[] }[] }) => ({
  open: [...w.open],
  done: [...w.done],
  ...(w.sets?.length ? { sequences: w.sets.map((s) => ({ name: s.name, states: s.states.map((x) => ({ name: x.name, done: !!x.done })) })) } : {}),
});
