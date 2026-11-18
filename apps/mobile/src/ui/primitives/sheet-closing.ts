const CLOSE_FALLBACK_MS = 3000;

let closing = 0;
const waiting = new Set<() => void>();

export function sheetClosing(): () => void {
  closing += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(fallback);
    closing -= 1;
    if (closing > 0) return;
    const ready = [...waiting];
    waiting.clear();
    for (const run of ready) run();
  };
  const fallback = setTimeout(release, CLOSE_FALLBACK_MS);
  return release;
}

export function afterSheetsClose(run: () => void): () => void {
  if (closing === 0) {
    run();
    return () => {};
  }
  waiting.add(run);
  return () => {
    waiting.delete(run);
  };
}
