// The keys of a sheet that asks (ТЗ 44 §4, as ТЗ 07 and 10): the window behind does not react — ⌘ and the rest are
// stopped, Tab goes round the sheet's buttons; the sheet's own keys first.

export function sheetKeys(sheet: () => HTMLElement | undefined, own: (e: KeyboardEvent) => boolean) {
  return (e: KeyboardEvent) => {
    if (own(e)) return void e.preventDefault();
    if (e.key === 'Tab') {
      e.preventDefault();
      const bs = [...(sheet()?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const i = bs.indexOf(document.activeElement as HTMLButtonElement);
      bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length]?.focus();
    } else if (e.metaKey) e.preventDefault();
  };
}
