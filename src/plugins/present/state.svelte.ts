// What «Презентация» sees of the notes, through the API only (ТЗ 59): the files shown as slides (their text, headings
// and deck), read again when they change; the tab shown; the slide chosen per file; the images' URLs; the setting
// «Тема слайдов»; the edits of the slides as transactions (one step of ⌘Z each).

import { SvelteMap } from 'svelte/reactivity';
import type { Ctx, HeadingRef } from '@panopticon/api';
import { readOrg, type Heading } from '@panopticon/api/org';
import { deckOf, gridBoxes, imageLink, type Deck, type Layout, type Slide } from './model';

export const VIEW = 'present.slides';

export interface PFile {
  path: string;
  text: string;
  headings: Heading[];
  deck: Deck;
}

class Present {
  ctx!: Ctx;
  files = new SvelteMap<string, PFile>();
  active = $state<{ path: string | null; view: string | null }>({ path: null, view: null });
  /** The slide chosen in each file (its index in the deck). */
  current = new SvelteMap<string, number>();
  /** «Тема слайдов»: 'app' — the app's theme; 'light' / 'dark' — the theme of that place. */
  theme = $state<'app' | 'light' | 'dark'>('app');
  private urls = new Map<string, Promise<string | null>>();

  readSettings() {
    const v = this.ctx.settings.values().theme;
    this.theme = v === 'light' || v === 'dark' ? v : 'app';
  }
  /** The variables a slide is drawn with ('' — the view's own, the app's theme). */
  slideVars(): string {
    return this.theme === 'app' ? '' : this.ctx.ui.themeVars(this.theme);
  }

  async read(path: string): Promise<PFile | null> {
    const o = await readOrg(this.ctx, path);
    if (!o) {
      this.files.delete(path);
      return null;
    }
    const f: PFile = { path, text: o.text, headings: o.headings, deck: deckOf(o.text, o.headings) };
    this.files.set(path, f);
    const n = this.current.get(path) ?? 0;
    if (n >= f.deck.slides.length) this.current.set(path, Math.max(0, f.deck.slides.length - 1));
    return f;
  }
  refresh(path: string) {
    if (this.files.has(path)) void this.read(path);
  }
  /** An image of the notes folder as a URL (null — no such file), kept while the plugin runs. */
  image(path: string): Promise<string | null> {
    let u = this.urls.get(path);
    if (!u) {
      u = this.ctx.files!.imageUrl(path).catch(() => null);
      this.urls.set(path, u);
      // not there now: asked again next time (it may be copied meanwhile)
      void u.then((x) => x === null && this.urls.delete(path));
    }
    return u;
  }
  forgetImage(path: string) {
    const u = this.urls.get(path);
    this.urls.delete(path);
    void u?.then((x) => x && this.ctx.files!.revoke(x));
  }

  slide(path: string): Slide | null {
    const f = this.files.get(path);
    return f?.deck.slides[this.current.get(path) ?? 0] ?? null;
  }
  choose(path: string, i: number) {
    const f = this.files.get(path);
    if (!f || !f.deck.slides.length) return;
    this.current.set(path, Math.max(0, Math.min(i, f.deck.slides.length - 1)));
  }
  step(path: string, d: 1 | -1) {
    this.choose(path, (this.current.get(path) ?? 0) + d);
  }
  ref(path: string, s: { line: number; title: string }): HeadingRef {
    return { path, line: s.line, title: s.title };
  }

  // ---- edits ----
  private tx(label: string, fn: Parameters<NonNullable<Ctx['edit']>['transaction']>[1]) {
    return this.ctx.edit!.transaction(label, fn);
  }
  /** §4.2: `:LAYOUT:` written; into `free`, the blocks with no `:BOX:` get one (laid out). */
  setLayout(path: string, s: Slide, layout: Layout) {
    return this.tx('Раскладка слайда', (tx) => {
      tx.setProperty(this.ref(path, s), 'LAYOUT', layout);
      if (layout === 'free') {
        const none = s.boxes.filter((b) => !b.box);
        const at = gridBoxes(none.length);
        none.forEach((b, i) => tx.setProperty({ path, line: b.line, title: b.title }, 'BOX', at[i].join(' ')));
      }
    });
  }
  /** §4.3: the slide `from` dropped before the slide `to` (`to` = the count: after the last). */
  moveSlide(path: string, from: number, to: number) {
    const f = this.files.get(path);
    if (!f || from === to || from + 1 === to) return;
    const ss = f.deck.slides;
    const s = ss[from];
    void this.tx('Переместить слайд', (tx) => {
      if (to >= ss.length) tx.move(this.ref(path, s), { after: this.ref(path, ss[ss.length - 1]) });
      else tx.move(this.ref(path, s), { before: this.ref(path, ss[to]) });
    }).then((r) => r === 'ok' && this.current.set(path, to > from ? to - 1 : to));
  }
  newSlide(path: string, after?: Slide) {
    const org = '* Новый слайд\n:PROPERTIES:\n:LAYOUT: text\n:END:\n';
    const f = this.files.get(path);
    const n = after ? (f?.deck.slides.indexOf(after) ?? -1) + 1 : (f?.deck.slides.length ?? 0);
    void this.tx('Новый слайд', (tx) => void tx.insertHeading(after ? { after: this.ref(path, after) } : { file: path, position: 'end' }, org)).then((r) => r === 'ok' && this.current.set(path, n));
  }
  duplicate(path: string, s: Slide) {
    const f = this.files.get(path);
    if (!f) return;
    const org = f.text.split('\n').slice(s.line, s.end).join('\n').replace(/\n*$/, '\n');
    const n = f.deck.slides.indexOf(s) + 1;
    void this.tx('Дублировать слайд', (tx) => void tx.insertHeading({ after: this.ref(path, s) }, org)).then((r) => r === 'ok' && this.current.set(path, n));
  }
  remove(path: string, s: Slide) {
    return this.tx('Удалить слайд', (tx) => tx.remove(this.ref(path, s)));
  }
  /** §6: an image put on a slide (dropped from Finder, pasted): copied into `img/` beside the file (`-2`, `-3` when
   *  the name is taken), its link where the layout shows images — the first image replaced in `text-image` and
   *  `image`, at the end of the text with the layout made `text-image` in the others, a new block at `at` (% of the
   *  slide) in `free`. One step «Вставить картинку» (the file copied stays when it is undone). */
  async insertImage(path: string, s: Slide, f: { name: string; base64: string }, at?: { x: number; y: number }): Promise<boolean> {
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const m = /^(.*?)(?:\.([A-Za-z0-9]+))?$/.exec(f.name.split('/').pop() ?? '')!;
    const stem = (m[1] || 'image').replace(/[\\/:]/g, '-').replace(/^\.+/, '').trim() || 'image';
    const ext = (m[2] || 'png').toLowerCase();
    let name = '';
    for (let n = 1; n <= 30 && !name; n++) {
      const tryName = n === 1 ? `${stem}.${ext}` : `${stem}-${n}.${ext}`;
      try {
        await this.ctx.edit!.writeBytes(`${dir}img/${tryName}`, f.base64);
        name = tryName;
      } catch {
        // taken: the next name
      }
    }
    if (!name) return false;
    const link = `[[file:img/${name}]]`;
    const ref = this.ref(path, s);
    const r = await this.tx('Вставить картинку', (tx) => {
      if (s.layout === 'free') {
        const x = Math.round(Math.min(Math.max(0, (at?.x ?? 50) - 20), 60));
        const y = Math.round(Math.min(Math.max(0, (at?.y ?? 50) - 15), 70));
        tx.insertHeading({ under: ref, position: 'last' }, `** Картинка\n:PROPERTIES:\n:BOX: ${x} ${y} 40 30\n:END:\n${link}\n`);
        return;
      }
      const lines = (tx.body(ref) ?? '').replace(/\n+$/, '').split('\n').filter((l, i, a) => l || i < a.length - 1);
      const i = s.layout === 'text-image' || s.layout === 'image' ? lines.findIndex((l) => imageLink(l)) : -1;
      if (i >= 0) lines[i] = link;
      else lines.push(link);
      tx.replaceBody(ref, lines.join('\n') + '\n');
      if (s.layout !== 'text-image' && s.layout !== 'image') tx.setProperty(ref, 'LAYOUT', 'text-image');
    });
    return r === 'ok';
  }
  /** The notes of a slide typed where there were none: its subheading «Заметки» made last, with that text. */
  async startNotes(path: string, s: Slide, text: string): Promise<boolean> {
    if (s.notes) return false;
    const body = text.replace(/\n+$/, '');
    return (await this.tx('Заметки докладчика', (tx) => void tx.insertHeading({ under: this.ref(path, s), position: 'last' }, `** Заметки\n${body}\n`))) === 'ok';
  }
}

export const present = new Present();
