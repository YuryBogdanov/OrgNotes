// Fuzzy matching for the command palette: the letters of the query appear in the text in order, not
// necessarily together. Case is ignored and «ё» equals «е».

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
const isWordStart = (t: string, i: number) => i === 0 || /[\s\-_/.,:;()«»"'[\]]/.test(t[i - 1]);

export interface Match {
  /** indexes into the text of the matched characters (for bold) */
  at: number[];
  /** lower is better: 0 when the match starts a word, then the span it covers */
  wordStart: boolean;
  span: number;
}

/** The best match of `query` in `text`, or null: a match that starts a word wins, then the most compact one. */
export function fuzzy(query: string, text: string): Match | null {
  const q = norm(query.trim());
  if (!q) return { at: [], wordStart: true, span: 0 };
  const t = norm(text);
  let best: Match | null = null;
  for (let s = t.indexOf(q[0]); s >= 0; s = t.indexOf(q[0], s + 1)) {
    const at = [s];
    let j = s + 1;
    for (let k = 1; k < q.length; k++) {
      // a space in the query matches nothing in particular: the next letter may be anywhere after
      if (q[k] === ' ') continue;
      // prefer the next letter at a word start, else the nearest
      let next = t.indexOf(q[k], j);
      if (next < 0) break;
      if (k > 0 && q[k - 1] === ' ') {
        for (let w = next; w >= 0; w = t.indexOf(q[k], w + 1)) if (isWordStart(t, w)) { next = w; break; }
      }
      at.push(next);
      j = next + 1;
    }
    if (at.length !== q.replace(/ /g, '').length) continue;
    const m: Match = { at, wordStart: isWordStart(t, s), span: at[at.length - 1] - at[0] };
    if (!best || better(m, best)) best = m;
  }
  return best;
}

export const better = (a: Match, b: Match) => (a.wordStart !== b.wordStart ? a.wordStart : a.span < b.span);

/** Text cut into runs for rendering, matched characters marked. */
export function runs(text: string, at: number[]): { s: string; hit: boolean }[] {
  const hits = new Set(at);
  const out: { s: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i);
    if (out.length && out[out.length - 1].hit === hit) out[out.length - 1].s += text[i];
    else out.push({ s: text[i], hit });
  }
  return out;
}
