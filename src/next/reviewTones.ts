// The colours and words of a card's outcome in a review in the file (ТЗ 46 §3, ТЗ 41 §3): its segment of the
// progress, its dot in the queue, its figure in the summary.

import type { ReviewTone } from '../api/index';

export const TONE: Record<ReviewTone, string> = {
  done: 'var(--done)',
  cancel: 'var(--ink3)',
  moved: 'color-mix(in srgb, var(--done) 60%, transparent)',
  later: 'var(--next)',
  skip: 'var(--wait)',
  wait: 'var(--wait)',
  seen: 'var(--ink2)',
  arch: 'var(--plug)',
};
export { TONE_WORD } from '../reviewSums';
