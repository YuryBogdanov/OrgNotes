// Line diff for «Сравнение версий»: what is on disk (−) against the tab's text (+).

export type Op = { kind: ' ' | '-' | '+'; text: string; a?: number; b?: number }; // a: line on disk, b: in my version (1-based)
export type View = { kind: ' ' | '-' | '+'; text: string; n: number } | { kind: 'gap'; n: number };

/** Myers' O((N+M)·D) diff of two line lists. */
export function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[max + k - 1] < v[max + k + 1]) ? v[max + k + 1] : v[max + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) x++, y++;
      v[max + k] = x;
      if (x >= n && y >= m) break outer;
    }
  }
  // walk back through the saved frontiers
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const t = trace[d];
    const k = x - y;
    const down = k === -d || (k !== d && t[max + k - 1] < t[max + k + 1]);
    const pk = down ? k + 1 : k - 1;
    const px = t[max + pk];
    const py = px - pk;
    while (x > px && y > py) ops.push({ kind: ' ', text: a[--x], a: x + 1, b: --y + 1 });
    if (d === 0) break;
    if (down) ops.push({ kind: '+', text: b[--y], b: y + 1 });
    else ops.push({ kind: '-', text: a[--x], a: x + 1 });
  }
  while (x > 0 && y > 0) ops.push({ kind: ' ', text: a[--x], a: x + 1, b: --y + 1 });
  return ops.reverse();
}

/**
 * What the sheet shows: changes with `context` unchanged lines around each, longer unchanged runs folded into
 * «… N строк без изменений». `fragments` counts the groups of changes next to each other.
 */
export function compare(disk: string, mine: string, context = 3): { rows: View[]; fragments: number } {
  const ops = diffLines(disk.split('\n'), mine.split('\n'));
  let fragments = 0;
  ops.forEach((o, i) => {
    if (o.kind !== ' ' && (i === 0 || ops[i - 1].kind === ' ')) fragments++;
  });
  const near = ops.map(() => false);
  ops.forEach((o, i) => {
    if (o.kind === ' ') return;
    for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) near[j] = true;
  });
  const rows: View[] = [];
  let skipped = 0;
  ops.forEach((o, i) => {
    if (!near[i]) return void skipped++;
    if (skipped) rows.push({ kind: 'gap', n: skipped });
    skipped = 0;
    rows.push({ kind: o.kind, text: o.text, n: (o.kind === '-' ? o.a : o.b)! });
  });
  if (skipped) rows.push({ kind: 'gap', n: skipped });
  return { rows, fragments };
}

const HEAD = /^(\*+)\s+(?:([A-ZА-ЯЁ][A-ZА-ЯЁ0-9_-]*)\s+)?(?:\[#[A-Z]\]\s+)?(.*?)(?:\s+:[\w@#%:]+:)?\s*$/u;
const titleOf = (line: string) => {
  const m = HEAD.exec(line);
  return m ? { kw: m[2] ?? null, title: m[3] } : null;
};
const lines = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'строка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'строки' : 'строк'}`;

/**
 * The sheet «Файл изменён другой программой» (ТЗ 44 §4): a line for each version about how it differs — the first
 * differences by heading: «+3 строки в «Переезд хранилища»», «статус «Миграция биллинга» → NEXT». `mine` — what my
 * version has that the disk's has not, `disk` — the other way round.
 */
export function diffSummary(disk: string, mine: string): { mine: string[]; disk: string[] } {
  const ops = diffLines(disk.split('\n'), mine.split('\n'));
  const out = { mine: [] as string[], disk: [] as string[] };
  let under = ''; // the heading the changes are under
  for (let i = 0; i < ops.length; ) {
    if (ops[i].kind === ' ') {
      const h = titleOf(ops[i].text);
      if (h) under = h.title;
      i++;
      continue;
    }
    let j = i;
    while (j < ops.length && ops[j].kind !== ' ') j++;
    const group = ops.slice(i, j);
    const minus = group.filter((o) => o.kind === '-');
    const plus = group.filter((o) => o.kind === '+');
    const a = minus.length === 1 && plus.length === 1 ? titleOf(minus[0].text) : null;
    const b = minus.length === 1 && plus.length === 1 ? titleOf(plus[0].text) : null;
    if (a && b && a.title === b.title && a.kw !== b.kw) {
      // only the heading's status differs
      out.mine.push(`статус «${b.title}» → ${b.kw ?? 'без статуса'}`);
      out.disk.push(`статус «${a.title}» → ${a.kw ?? 'без статуса'}`);
      under = b.title;
    } else {
      const where = under ? ` в «${under}»` : ' в начале файла';
      if (plus.length) out.mine.push(`+${lines(plus.length)}${where}`);
      if (minus.length) out.disk.push(`+${lines(minus.length)}${where}`);
      const last = [...plus].reverse().map((o) => titleOf(o.text)).find(Boolean);
      if (last) under = last.title;
    }
    i = j;
  }
  return out;
}
