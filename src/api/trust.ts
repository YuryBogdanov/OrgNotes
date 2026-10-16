// The plugins the user has let in, on this Mac (tech sprint 3.1, from the host): each with the rights it had then — a
// plugin that asks for more is asked about again. And the rights in words.

import type { Manifest } from './manifest';

const TRUST_KEY = 'plugins:trusted';
const rightsOf = (m: Manifest) => JSON.stringify([[...m.permissions].sort(), [...m.net].sort()]);
function trustedMap(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(TRUST_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export const trusted = (m: Manifest) => trustedMap()[m.id] === rightsOf(m);
export function trust(m: Manifest) {
  try {
    localStorage.setItem(TRUST_KEY, JSON.stringify({ ...trustedMap(), [m.id]: rightsOf(m) }));
  } catch {
    /* asked again next time */
  }
}
/** The rights in words, for the sheet and the list. */
export const RIGHTS: Record<string, string> = {
  'index.read': 'чтение заметок', 'index.touch': 'отметка «Осмотрено»', 'files.read': 'чтение файлов заметок', 'files.edit': 'правка заметок',
  clipboard: 'запись в буфер обмена', net: 'сеть', process: 'запуск процессов',
};
export const rightsText = (m: Manifest) =>
  m.permissions.map((p) => (p === 'net' && m.net.length ? `${RIGHTS.net} (${m.net.join(', ')})` : (RIGHTS[p] ?? p))).join(', ');
