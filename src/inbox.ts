// Inbox: one chosen .org file where tasks are put quickly, to be sorted out later. The core keeps the quick entry and
// the file (standard Org: a task goes to a file); the list and its review are the plugin «inbox» (ТЗ 28). Pure
// functions on its text, so the quick entry and the tests share them.

import { headingLines, inactiveStamp, type Heading } from './org';

/** The project's Inbox settings of the core (`inbox` in .orgnotes/config.json): they belong to the notes folder. */
export interface InboxConfig {
  file: string | null; // relative path of the Inbox file; null = not set up yet
  status: string | null; // status of a new task; null = the first open status of the file
  created: boolean; // write :CREATED:
  add: 'top' | 'end'; // where a new task goes: the top of the file (after its preamble) or its end
  confirm: boolean; // «Добавлено в Inbox» after a quick entry
}
export const DEFAULT_INBOX: InboxConfig = { file: null, status: null, created: true, add: 'top', confirm: true };

export function readInbox(raw: unknown): InboxConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bool = (k: keyof InboxConfig) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : (DEFAULT_INBOX[k] as boolean));
  return {
    file: typeof v.file === 'string' && v.file.trim() ? v.file.trim() : null,
    status: typeof v.status === 'string' && v.status.trim() ? v.status.trim() : null,
    created: bool('created'),
    add: v.add === 'end' ? 'end' : 'top',
    confirm: bool('confirm'),
  };
}
/** config.json with the core's Inbox settings replaced; every other key stays (in `inbox` too: the list's and the
 *  review's of before ТЗ 28, until the plugin moves them). */
export function withInbox(raw: string | null, c: InboxConfig): string {
  let base: Record<string, unknown> = {};
  try {
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === 'object' && !Array.isArray(p)) base = p;
  } catch {
    /* an unreadable file is replaced */
  }
  const out: Record<string, unknown> = { version: base.version ?? 1, ...base };
  const old = base.inbox && typeof base.inbox === 'object' && !Array.isArray(base.inbox) ? (base.inbox as Record<string, unknown>) : {};
  const keep: Record<string, unknown> = { ...old };
  for (const [k, d] of Object.entries(DEFAULT_INBOX)) {
    if (c[k as keyof InboxConfig] !== d) keep[k] = c[k as keyof InboxConfig];
    else delete keep[k];
  }
  if (Object.keys(keep).length) out.inbox = keep;
  else delete out.inbox;
  return JSON.stringify(out, null, 2) + '\n';
}

// ---- writing ---------------------------------------------------------------------------------------------------

/** A new task as it goes into the file: `* TODO Title`, :CREATED:, the details (a line that would read as a
 *  heading is escaped with «,», as Org does in blocks). */
export function entry(title: string, details: string, status: string, created: Date | null): string {
  const t = title.replace(/\s+/g, ' ').trim();
  const out = [`* ${status} ${t}`];
  if (created) out.push(':PROPERTIES:', `:CREATED: ${inactiveStamp(created)}`, ':END:');
  const d = details.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  if (d.trim()) for (const l of d.split('\n')) out.push(/^\*+\s/.test(l) ? ',' + l : l);
  return out.join('\n');
}
/**
 * The file with a task added at its top: after the preamble (#+TITLE and the like, kept as it is), before the first
 * heading, with one blank line between the task and the heading below it, so the newest is seen first on opening.
 */
export function prepend(text: string, task: string): string {
  const lines = text.split('\n');
  const first = Math.min(...headingLines(lines));
  if (!isFinite(first)) {
    const body = text.replace(/\n\s*$/, '');
    return (body.trim() ? body + '\n\n' : '') + task + '\n';
  }
  const rest = lines.slice(first).join('\n');
  return lines.slice(0, first).map((l) => l + '\n').join('') + task + '\n\n' + (rest.endsWith('\n') ? rest : rest + '\n');
}

/** The file with a task added at its end, one blank line before it so the tasks don't stick together. */
export function append(text: string, task: string): string {
  const body = text.replace(/\n\s*$/, '');
  return (body.trim() ? body + '\n\n' : '') + task + '\n';
}

/** The file without a heading and everything under it. */
export function remove(text: string, h: Heading): string {
  const lines = text.split('\n');
  lines.splice(h.line, h.end - h.line);
  return lines.join('\n');
}
