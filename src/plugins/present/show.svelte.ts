// «Презентация», the show (ТЗ 59 §8): `ui.present` gives a window a screen — the slides to the audience (fitted to the
// screen on black, the cursor hidden after 2 s still, no transitions), and with two screens the presenter's view on
// the screen of the app (Presenter.svelte). The keys from either window; the timer; «B» a black screen, «S» the screens
// changed over, digits and ↩ a slide by its number, Esc the end — back in the editor on the slide shown last. The show
// changes nothing in the file.

import { mount, unmount } from 'svelte';
import { present } from './state.svelte';
import { FIELD, fit, slideEl, type Look } from './render';
import Presenter from './Presenter.svelte';

class Show {
  on = $state(false);
  path = $state('');
  index = $state(0);
  black = $state(false);
  screens = $state<1 | 2>(1);
  /** When it began; the time paused so far; paused since (null — running). */
  began = $state(0);
  pausedFor = $state(0);
  pausedAt = $state<number | null>(null);
  now = $state(Date.now());
  digits = $state('');
  private handle: { swap(): void; end(): void } | null = null;
  private tick: ReturnType<typeof setInterval> | undefined;

  get deck() {
    return present.files.get(this.path)?.deck ?? null;
  }
  get count() {
    return this.deck?.slides.length ?? 0;
  }
  /** The time since it began, the pauses aside (ms). */
  get elapsed() {
    return Math.max(0, (this.pausedAt ?? this.now) - this.began - this.pausedFor);
  }

  async start(path: string, from: number) {
    if (this.on) return;
    const f = present.files.get(path) ?? (await present.read(path));
    if (!f || !f.deck.slides.length) return;
    this.path = path;
    this.index = Math.max(0, Math.min(from, f.deck.slides.length - 1));
    this.black = false;
    this.digits = '';
    this.began = this.now = Date.now();
    this.pausedFor = 0;
    this.pausedAt = null;
    this.on = true;
    this.tick = setInterval(() => (this.now = Date.now()), 500);
    try {
      const h = await present.ctx.ui.present({
        audience: (el) => audience(el),
        presenter: (el) => {
          const app = mount(Presenter, { target: el });
          return () => void unmount(app);
        },
        onKey: (e) => this.key(e),
        onEnd: () => this.ended(),
      });
      this.handle = h;
      this.screens = h.screens;
    } catch {
      this.ended();
    }
  }
  private ended() {
    if (!this.on) return;
    this.on = false;
    this.handle = null;
    clearInterval(this.tick);
    present.choose(this.path, this.index); // back in the editor on the slide shown last
  }
  end() {
    this.handle?.end();
  }
  go(i: number) {
    this.index = Math.max(0, Math.min(i, this.count - 1));
  }
  pause() {
    if (this.pausedAt === null) this.pausedAt = Date.now();
    else {
      this.pausedFor += Date.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }
  /** The keys of the show (§8): true — taken. */
  private act(k: string): boolean {
    if (/^[0-9]$/.test(k)) {
      this.digits = (this.digits + k).slice(-3);
      return true;
    }
    if (k === 'Enter' && this.digits) {
      this.go(Number(this.digits) - 1);
      this.digits = '';
      return true;
    }
    this.digits = '';
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(k)) this.go(this.index + 1);
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) this.go(this.index - 1);
    else if (k === 'Home') this.go(0);
    else if (k === 'End') this.go(this.count - 1);
    else if (/^[bBиИ]$/.test(k)) this.black = !this.black;
    else if (/^[sSыЫ]$/.test(k)) this.handle?.swap();
    else if (k === 'Escape') this.end();
    else return false;
    return true;
  }
  key(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (this.act(e.key)) e.preventDefault();
  }
}

export const show = new Show();

/** The look of a slide drawn in the show's windows (its images from the main window's URLs: the same origin). */
export const showLook = (): Look => ({ file: show.path, image: (p) => present.image(p) });

/** A slide drawn into `box` at `width` (its field scaled), fitted; returns it. */
export function drawSlide(box: HTMLElement, i: number, width: number): HTMLElement | null {
  const d = show.deck;
  const s = d?.slides[i];
  if (!d || !s) {
    box.replaceChildren();
    return null;
  }
  const f = FIELD[d.ratio];
  const k = width / f.w;
  const el = slideEl(s, d, showLook());
  const vars = present.slideVars();
  if (vars) el.style.cssText += ';' + vars;
  Object.assign(el.style, { transform: `scale(${k})`, transformOrigin: '0 0', position: 'absolute', left: '0', top: '0' });
  box.style.width = `${width}px`;
  box.style.height = `${f.h * k}px`;
  box.replaceChildren(el);
  fit(el);
  return el;
}

/** The audience's window: the slide shown, fitted to the screen on black; black on «B»; the cursor hidden when still. */
function audience(root: HTMLElement): () => void {
  const win = root.ownerDocument.defaultView ?? window;
  root.classList.add('pr-show');
  const stage = root.ownerDocument.createElement('div');
  stage.className = 'pr-show-slide';
  root.append(stage);
  let hide: ReturnType<typeof setTimeout> | undefined;
  const still = () => {
    root.style.cursor = '';
    clearTimeout(hide);
    hide = setTimeout(() => (root.style.cursor = 'none'), 2000);
  };
  still();
  win.addEventListener('mousemove', still);
  const stop = $effect.root(() => {
    let size = $state({ w: win.innerWidth, h: win.innerHeight });
    const onResize = () => (size = { w: win.innerWidth, h: win.innerHeight });
    win.addEventListener('resize', onResize);
    $effect(() => {
      const d = show.deck;
      const i = show.index;
      void present.theme;
      if (!d) return;
      const f = FIELD[d.ratio];
      const w = Math.min(size.w, (size.h * f.w) / f.h);
      drawSlide(stage, i, w);
      stage.style.visibility = show.black ? 'hidden' : '';
    });
    return () => win.removeEventListener('resize', onResize);
  });
  return () => {
    stop();
    clearTimeout(hide);
    win.removeEventListener('mousemove', still);
  };
}
