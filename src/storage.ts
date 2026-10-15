// localStorage of this Mac (the window's own preferences): never throws — a private window or a full disk only
// loses the preference.

export const lsGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
export const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
export const lsDel = (k: string) => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
};
/** A JSON value; null when it is not there or unreadable. */
export function lsGetJson<T>(k: string): T | null {
  try {
    return JSON.parse(lsGet(k) ?? 'null');
  } catch {
    return null;
  }
}
