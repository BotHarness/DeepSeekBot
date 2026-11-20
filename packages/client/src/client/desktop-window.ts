export const DESKTOP_WINDOW_PATH = '/api/botharness/desktop-window';

export function revealDesktopWindow(
  fetcher: typeof fetch = (...args) => fetch(...args),
  focus: () => void = () => globalThis.focus?.(),
): void {
  focus();
  if (!('dshDesktop' in globalThis)) return;
  void fetcher(`.${DESKTOP_WINDOW_PATH}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'reveal' }),
  }).catch(() => undefined);
}
