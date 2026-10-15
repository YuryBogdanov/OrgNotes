// What fits in a pane's bottom bars (tech sprint 4.1, from Pane.svelte). `tw` measures a text in the bar's font; null
// before the font is known — then everything is shown.

export type Measure = (text: string) => number;

const GAP = 16; // .status gap

/**
 * The status bar of a file: its path, «Org», «UTF-8», the caret, the saved state. When the bar is narrow, the folders
 * of the path go first, from the start («…/tail»), then «UTF-8», then «Org».
 */
export function fitStatus(parts: string[], width: number, cursor: string, saved: string, tw: Measure | null): { org: boolean; utf: boolean; path: string } {
  const name = parts[parts.length - 1] ?? '';
  if (!tw) return { org: true, utf: true, path: parts.join('/') };
  const fixed = 28 + tw(cursor) + tw(saved) + 2 * GAP; // padding, cursor, saved, the gaps around the path
  const room = (org: boolean, utf: boolean) => width - fixed - (org ? tw('Org') + GAP : 0) - (utf ? tw('UTF-8') + GAP : 0);
  const org = tw(name) <= room(true, false);
  const utf = tw(name) <= room(true, true);
  const r = room(org, utf);
  let path = name;
  for (let k = 0; k < parts.length - 1; k++) {
    const tail = parts.slice(k).join('/');
    const t = k ? '…/' + tail : tail;
    if (tw(t) <= r) {
      path = t;
      break;
    }
  }
  return { org, utf, path };
}

export const UNTITLED_HINT = 'Файл появится на диске после «Сохранить как…»';

/** The bar of a new note: «Не сохранено», the button, its key, the hint; the hint goes first, then the key. */
export function fitUntitledBar(width: number, buttonW: number, key: string, tw: Measure | null): { keys: boolean; hint: boolean } {
  if (!tw) return { keys: true, hint: true };
  // dot 7 + gap + "Не сохранено" + gap + the button, inside 12 px padding
  const fixed = 24 + 7 + 10 + tw('Не сохранено') + 10 + buttonW;
  const keys = tw(key) + 8;
  return { keys: fixed + keys <= width, hint: fixed + keys + 10 + tw(UNTITLED_HINT) + 10 <= width };
}
