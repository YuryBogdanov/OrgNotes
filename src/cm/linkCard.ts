// The card over a link in the new interface (ТЗ 42 §5.6): after half a second, 400 pt — a heading's path, its status
// and title, two lines of its body; a file's name and #+TITLE; an address; «Не найдено» and «Исправить…». The footer:
// how to open it, the link's ID or path monospaced.

import type { LinkPreview } from '../linkEdit';

const el = (tag: string, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function linkCard(p: LinkPreview, fix: () => void): HTMLElement {
  const card = el('div', 'cm-lcard');
  const foot = el('div', 'lc-foot');
  const open = (what: string) => {
    foot.append(el('span', 'lc-k', `⌘-клик — ${what}`));
  };
  if (p.kind === 'heading') {
    card.append(el('div', 'lc-path', p.crumb));
    const t = el('div', 'lc-title');
    if (p.keyword) {
      const k = el('span', 'lc-kw', p.keyword);
      k.setAttribute('style', p.tone);
      t.append(k);
    }
    t.append(p.title);
    card.append(t);
    if (p.body.length) card.append(el('div', 'lc-body', p.body.join(' ')));
    open('открыть');
    foot.append(el('span', 'lc-k off', '⌘⌥-клик — рядом'), el('span', 'lc-ref', p.ref));
  } else if (p.kind === 'file') {
    card.append(el('div', 'lc-path', p.crumb), el('div', 'lc-title', p.title));
    open('открыть');
    foot.append(el('span', 'lc-ref', p.ref));
  } else if (p.kind === 'url') {
    card.append(el('div', 'lc-url', p.url));
    open('открыть в браузере');
  } else {
    card.append(el('div', 'lc-miss', 'Не найдено'), el('div', 'lc-body', p.text));
    const b = el('button', 'lc-fix', 'Исправить…') as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', fix);
    foot.append(b);
  }
  card.append(foot);
  return card;
}
