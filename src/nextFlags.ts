// Switches of the new interface (fix-49). `RICH_ENABLED`: «Оформление» — the editor's rich mode, its tab buttons,
// ⌃⌘E, the menu's and the palette's items, the text's font (Cormorant) of the themes and the plugins (`--font-text`).
// Off for now: the new interface's editor is always «Исходник». The code stays — one line brings it back. Outside
// `next/`: the menu bar and the palette (the old code) read it too. The old interface is not touched.
export const RICH_ENABLED = false;
