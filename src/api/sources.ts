// Where an installed plugin came from (ТЗ 37): `.source.json` beside it — the catalog (a GitHub release) or a git
// link — and what its updates are compared by. Pure: no Tauri.

export type Source =
  | { kind: 'catalog'; repo: string; version: string }
  | { kind: 'git'; url: string; track: 'tag' | 'branch'; ref: string; commit: string; checkUpdates: boolean };

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The text of `.source.json`; null — none, or not ours (a plugin put there by hand). */
export function parseSource(text: string | null | undefined): Source | null {
  if (!text) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (o?.kind === 'catalog' && str(o.repo)) return { kind: 'catalog', repo: str(o.repo)!, version: str(o.version) ?? '' };
  if (o?.kind === 'git' && str(o.url) && str(o.ref))
    return { kind: 'git', url: str(o.url)!, track: o.track === 'branch' ? 'branch' : 'tag', ref: str(o.ref)!, commit: str(o.commit) ?? '', checkUpdates: o.checkUpdates !== false };
  return null;
}

/** «v1.2.3» → [1, 2, 3, release]; a tag that is not a version — null. A pre-release («-beta») is below its release. */
export function versionOf(v: string): [number, number, number, number] | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(-[\w.]+)?$/.exec(v.trim());
  return m ? [+m[1], +(m[2] ?? 0), +(m[3] ?? 0), m[4] ? 0 : 1] : null;
}
/** < 0: `a` is older. A version that is not one counts as the oldest. */
export function cmpVersion(a: string, b: string): number {
  const [x, y] = [versionOf(a), versionOf(b)];
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
/** The newest release tag (no pre-releases) newer than the installed version; null — none. */
export function newerTag(tags: [string, string][], installed: string): string | null {
  const best = tags.filter(([t]) => versionOf(t)?.[3] === 1).sort((a, b) => cmpVersion(b[0], a[0]))[0];
  return best && cmpVersion(best[0], installed) > 0 ? best[0] : null;
}

/** «git@git.company.local:team/okr.git» → «git.company.local/team/okr»: a link as the list shows it. */
export function shortUrl(url: string): string {
  return url
    .trim()
    .replace(/^[a-z+]+:\/\//, '')
    .replace(/^[^@/]+@/, '')
    .replace(/^([^/:]+):(?!\d+\/)/, '$1/')
    .replace(/^([^/:]+):\d+\//, '$1/')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
}
/** The grey line by a plugin's version: «из каталога», the link it came from, «из папки». */
export function sourceLabel(s: Source | null | undefined): string {
  if (!s) return 'из папки';
  return s.kind === 'catalog' ? 'из каталога' : shortUrl(s.url);
}
/** «Исходный код ↗»: the repository's page, when it has a web one (https, or ssh to a host that has). */
export function codeUrl(s: Source | null | undefined): string | null {
  if (!s) return null;
  if (s.kind === 'catalog') return `https://github.com/${s.repo}`;
  if (s.url.startsWith('file://')) return null;
  return 'https://' + shortUrl(s.url);
}
