// What a heading's status or priority may become (the menu behind a drawn capsule, ТЗ 19; the new interface's status
// menu and «Сменить статус ›», ТЗ 44 §3.2): the states of the heading's set — the open ones, then the done ones — the
// current one marked. How a choice is written: headingWrite.ts.

import { sequenceFor, type Workflow } from './org';

export interface StatusChoice {
  name: string;
  done: boolean;
  current: boolean;
}
/** The states of the set the keyword is in (the file's first set for none): open, then done. */
export function statusChoices(wf: Workflow, keyword: string | null): { open: StatusChoice[]; done: StatusChoice[]; set: string } {
  const seq = sequenceFor(wf, keyword);
  const ch = (s: { name: string; done?: boolean }): StatusChoice => ({ name: s.name, done: !!s.done, current: s.name === keyword });
  return { open: seq.states.filter((s) => !s.done).map(ch), done: seq.states.filter((s) => s.done).map(ch), set: seq.name };
}
export const PRIORITIES = ['A', 'B', 'C'] as const;

