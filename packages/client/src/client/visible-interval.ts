type VisibilityPage = Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
>;

export function visibleInterval(
  run: () => void,
  ms: number,
  page: VisibilityPage | undefined = typeof document === 'undefined' ? undefined : document,
): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let hidden = page?.visibilityState === 'hidden';
  const start = (): void => {
    clearInterval(timer);
    timer = hidden ? undefined : setInterval(run, ms);
  };
  const changed = (): void => {
    const next = page?.visibilityState === 'hidden';
    if (next === hidden) return;
    hidden = next;
    if (!hidden) run();
    start();
  };
  page?.addEventListener?.('visibilitychange', changed);
  start();
  return () => {
    clearInterval(timer);
    page?.removeEventListener?.('visibilitychange', changed);
  };
}
