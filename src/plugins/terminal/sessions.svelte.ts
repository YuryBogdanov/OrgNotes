// The sessions of the terminal (ТЗ 55 §2–4): a process and its terminal. Each has its own element (`host`), moved
// into whatever shows it now (the panel, later the tab) — the terminal is not made again and the process lives on.
// A session is alive while its process is; after it ends it stays with its output and «Процесс завершён (код 0) ·
// ↩ — перезапустить» until closed.

import type { Ctx, DrawerHandle, PtyHandle } from '@panopticon/api';
import { makeTerm, OWN_KEYS, themeOf } from './term';

export interface Launch {
  name: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}
/** What the dot says (§4): output in the last 2 s, waiting for input, rung, ended. */
export type Mood = 'busy' | 'idle' | 'bell' | 'ended';

let seq = 0;
export class Session {
  readonly id = `s${++seq}`;
  name = $state('');
  readonly launch: Launch;
  readonly host: HTMLDivElement;
  alive = $state(false);
  code = $state<number | null>(null);
  lastOut = $state(0);
  bell = $state(false);
  findOpen = $state(false);
  private pty: PtyHandle | null = null;
  private t: ReturnType<typeof makeTerm>;
  private opened = false;
  private wantFocus = false;
  private offs: (() => void)[] = [];
  private queued: string[] = [];
  private resizeOb: ResizeObserver | null = null;
  constructor(
    private ctx: Ctx,
    launch: Launch,
    private terms: Terminals,
  ) {
    this.launch = launch;
    this.name = launch.name;
    this.host = document.createElement('div');
    this.host.className = 'tm-host';
    this.host.setAttribute('data-own-keys', OWN_KEYS);
    this.host.setAttribute('data-session', this.id);
    this.t = makeTerm({
      fontSize: 12.5,
      scrollback: 10000,
      optionIsMeta: true,
      onKey: (k) => (k === 'toggle' ? terms.toggle() : void terms.add()),
      onFind: () => (this.findOpen = true),
      copy: (text) => void ctx.clipboard?.write(text),
      openUrl: (url) => void ctx.commands.run('url.open', { url }).catch(() => {}),
      openFile: (path, line) => void ctx.commands.run('file.open', { path, line: Math.max(0, line - 1) }).catch((e) => ctx.ui.notify(String(e?.message ?? e))),
    });
    this.t.term.onData((d) => {
      if (!this.alive) {
        // ended: ↩ starts it again in the same terminal
        if (d === '\r') void this.restart();
        return;
      }
      this.pty?.write(d);
    });
    this.t.term.onBell(() => (this.bell = true));
  }
  get term() {
    return this.t.term;
  }
  get search() {
    return this.t.search;
  }
  get mood(): Mood {
    if (!this.alive) return 'ended';
    if (this.bell) return 'bell';
    return this.terms.now - this.lastOut < 2000 ? 'busy' : 'idle';
  }
  /** Shown in `el` (the panel's body): opened there the first time, the process started once it has a size. */
  attach(el: HTMLElement) {
    if (this.host.parentElement !== el) el.appendChild(this.host);
    if (!this.opened) {
      this.opened = true;
      this.t.term.open(this.host);
      this.recolor();
      this.resizeOb = new ResizeObserver(() => this.fit());
      this.resizeOb.observe(this.host);
    }
    this.fit();
    if (this.wantFocus) this.focus();
    if (!this.alive && this.code === null && !this.pty) void this.start();
  }
  fit() {
    if (!this.host.isConnected || !this.host.clientWidth) return;
    try {
      this.t.fit.fit();
    } catch {
      return;
    }
    this.pty?.resize(this.t.term.cols, this.t.term.rows);
  }
  focus() {
    this.bell = false;
    this.wantFocus = !this.opened; // not opened yet: when it is
    this.t.term.focus();
  }
  recolor() {
    if (this.host.isConnected) this.t.term.options.theme = themeOf(this.host);
  }
  /** Text into the process (a heading's path, 55.6): after it starts if it has not yet. */
  type(text: string) {
    if (this.pty && this.alive) this.pty.write(text);
    else this.queued.push(text);
  }
  async start() {
    const p = this.ctx.process;
    if (!p) return;
    const l = this.launch;
    try {
      const pty = await p.pty({ command: l.command, args: l.args, cwd: l.cwd, env: l.env, cols: this.t.term.cols || 80, rows: this.t.term.rows || 24 });
      this.pty = pty;
      this.alive = true;
      this.code = null;
      this.offs.push(
        pty.onData((d) => {
          this.t.term.write(d);
          this.lastOut = Date.now();
        }),
        pty.onExit((code) => this.ended(code)),
      );
      for (const q of this.queued.splice(0)) pty.write(q);
    } catch (e) {
      this.t.term.write(`\r\n\x1b[31m${String((e as Error)?.message ?? e)}\x1b[0m\r\n`);
      this.ended(null);
    }
  }
  private ended(code: number | null) {
    this.alive = false;
    this.code = code;
    this.pty = null;
    for (const f of this.offs.splice(0)) f();
    this.t.term.write(`\r\n\x1b[2mПроцесс завершён${code === null ? '' : ` (код ${code})`} · ↩ — перезапустить\x1b[0m\r\n`);
  }
  async restart() {
    if (this.alive) this.pty?.kill('TERM');
    this.t.term.reset();
    this.code = null;
    await this.start();
  }
  kill() {
    this.pty?.kill('TERM');
  }
  dispose() {
    this.kill();
    for (const f of this.offs.splice(0)) f();
    this.resizeOb?.disconnect();
    this.t.dispose();
    this.host.remove();
  }
}

/** The plugin's sessions and the one active; the panel's handle. */
export class Terminals {
  list = $state<Session[]>([]);
  activeId = $state<string | null>(null);
  /** A clock for the dots (busy within the last 2 s). */
  now = $state(Date.now());
  drawer: DrawerHandle | null = null;
  ctx!: Ctx;
  private tick: ReturnType<typeof setInterval> | null = null;
  get active() {
    return this.list.find((s) => s.id === this.activeId) ?? this.list[0] ?? null;
  }
  init(ctx: Ctx) {
    this.ctx = ctx;
    this.tick = setInterval(() => (this.now = Date.now()), 1000);
  }
  /** The default launch: the user's shell. */
  shellLaunch(): Launch {
    return { name: 'Оболочка' };
  }
  add(l: Launch = this.shellLaunch()) {
    const s = new Session(this.ctx, { ...l, name: l.name === 'Оболочка' ? 'zsh' : l.name }, this);
    this.list = [...this.list, s];
    this.activeId = s.id;
    this.drawer?.show();
    queueMicrotask(() => s.focus());
    return s;
  }
  pick(id: string) {
    this.activeId = id;
    queueMicrotask(() => this.active?.focus());
  }
  /** «×»: an alive one asks «Завершить процесс?» first. */
  async close(id: string) {
    const s = this.list.find((x) => x.id === id);
    if (!s) return;
    if (s.alive) {
      const r = await this.ctx.ui.sheet({
        title: 'Завершить процесс?',
        buttons: [{ id: 'kill', label: 'Завершить', primary: true }],
        render: (el) => void (el.textContent = `В сессии «${s.name}» процесс ещё работает.`),
      });
      if (r !== 'kill') return;
    }
    const i = this.list.indexOf(s);
    this.list = this.list.filter((x) => x !== s);
    if (this.activeId === id) this.activeId = (this.list[i] ?? this.list[i - 1])?.id ?? null;
    s.dispose();
    if (!this.list.length) this.drawer?.hide();
  }
  /** ⌃`: the panel shown; again — hidden when the focus is in the terminal, else the focus to it. */
  toggle() {
    const d = this.drawer;
    if (!d) return;
    const inside = !!document.activeElement?.closest('.tm-host');
    if (d.shown() && inside) return d.hide();
    d.show();
    if (!this.list.length) this.add();
    else queueMicrotask(() => this.active?.focus());
  }
  recolor() {
    for (const s of this.list) s.recolor();
  }
  dispose() {
    if (this.tick) clearInterval(this.tick);
    for (const s of this.list) s.dispose();
    this.list = [];
  }
}
export const terms = new Terminals();
