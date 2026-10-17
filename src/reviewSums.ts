// The figures of a review's summary (ТЗ 41 §4, ТЗ 46 §5): the outcomes by the word they are counted under — the
// plugin's (`ReviewMark.group`), else their tone's —, the ones that are not nil, in the plugin's order (`endOrder`),
// else the tones'. Both shells draw them (next/SessionCard, PluginReview).

import type { ReviewMark, ReviewTone } from './api/index';

export const TONE_ORDER: ReviewTone[] = ['done', 'cancel', 'moved', 'later', 'wait', 'seen', 'arch', 'skip'];
export const TONE_WORD: Record<ReviewTone, string> = {
  done: 'выполнено',
  cancel: 'отменено',
  moved: 'перенесено',
  later: 'отложено',
  skip: 'пропущено',
  wait: 'ждём',
  seen: 'осмотрено',
  arch: 'в архив',
};

export function sumsOf(marks: (ReviewMark | null)[], order?: string[]): { word: string; tone: ReviewTone; n: number }[] {
  const n = new Map<string, { tone: ReviewTone; n: number }>();
  for (const m of marks) {
    if (!m) continue;
    const k = m.group ?? TONE_WORD[m.tone];
    const was = n.get(k);
    n.set(k, { tone: was?.tone ?? m.tone, n: (was?.n ?? 0) + 1 });
  }
  const rank = (word: string, tone: ReviewTone) => {
    const i = order?.indexOf(word) ?? -1;
    return i >= 0 ? i : 100 + TONE_ORDER.indexOf(tone);
  };
  return [...n].map(([word, v]) => ({ word, ...v })).sort((a, b) => rank(a.word, a.tone) - rank(b.word, b.tone));
}
