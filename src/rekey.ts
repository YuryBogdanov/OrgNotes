// The memories kept by a file's name or path (its view, its folds and caret — fix-49-2) follow a rename or a move, and
// go with the file to the Trash.

/** `rec` with its keys mapped (`null`: the key dropped; a key mapped onto one already there wins over it); null when
 *  nothing changed. */
export function rekey<T>(rec: Record<string, T>, map: (key: string) => string | null): Record<string, T> | null {
  let changed = false;
  const out: Record<string, T> = {};
  const moved: [string, T][] = [];
  for (const [k, v] of Object.entries(rec)) {
    const n = map(k);
    if (n === k) out[k] = v;
    else {
      changed = true;
      if (n !== null) moved.push([n, v]);
    }
  }
  for (const [k, v] of moved) out[k] = v;
  return changed ? out : null;
}
