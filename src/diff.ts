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
