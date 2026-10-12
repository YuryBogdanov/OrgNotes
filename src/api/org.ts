// @panopticon/api/org (ТЗ 27 §2.1): Org as a library — pure functions on text, no state of the core. A plugin bundles
// it with itself (so it stays with an isolated plugin too) and uses it where it works on its own structure in a file:
// inside `tx.update(path, fn)`, or on the text of `files.read`. The core uses the same code.

export { parseHeadings, setKeyword, setPriority, headingLines, inactiveStamp, type Heading, type Workflow, type OrgDate } from '../org';
export { setPlanning, setTags, splitTags, parseDate, weekdayNames } from '../edits';
export { stampText } from '../calendar';
export { listEnter, listIndent, type Edit } from '../textList';
export { setProperty, insertHeading, replaceBody, treeOf } from '../orgOps';
export { relevel, place, moveTo, moveWithin } from '../refile';

/** The workflow `parseHeadings` needs, from the keywords of `index.workflow(path)`. */
export const workflow = (w: { open: string[]; done: string[] }) => ({ open: [...w.open], done: [...w.done] });
