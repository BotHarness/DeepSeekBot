export const PRESENCE_RENEW_MS = 30_000;
export const PRESENCE_AWAY_MS = 60_000;
export const PRESENCE_IDLE_MS = 10 * 60_000;
const INPUTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

export interface PresenceReporterDeps {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  send(active: boolean): Promise<void>;
  now?: () => number;
  tickMs?: number;
}

export function presenceActive(
  at: number,
  state: { attentive: boolean; lastInput: number; lastAttentive: number },
): boolean {
  if (at - state.lastInput >= PRESENCE_IDLE_MS) return false;
  return state.attentive || at - state.lastAttentive < PRESENCE_AWAY_MS;
}

export function mountPresenceReporter(deps: PresenceReporterDeps): () => void {
  const now = deps.now ?? Date.now;
  const attentive = () => deps.document.visibilityState === 'visible';
  const start = now();
  const state = {
    attentive: attentive(),
    lastInput: start,
    lastAttentive: start,
  };
  let reported: boolean | undefined;
  let sentAt = 0;
  let disposed = false;
  const tick = () => {
    if (disposed) return;
    const at = now();
    state.attentive = attentive();
    if (state.attentive) state.lastAttentive = at;
    const active = presenceActive(at, state);
    if (active === reported && !(active && at - sentAt >= PRESENCE_RENEW_MS)) return;
    reported = active;
    sentAt = at;
    void deps.send(active).catch(() => {
      if (reported === active) reported = undefined;
    });
  };
  const input = () => {
    const at = now();
    const wasIdle = at - state.lastInput >= PRESENCE_IDLE_MS;
    state.lastInput = at;
    if (wasIdle) tick();
  };
  const timer = setInterval(tick, deps.tickMs ?? 5_000);
  for (const name of INPUTS) deps.window.addEventListener(name, input, { passive: true });
  deps.document.addEventListener('visibilitychange', tick);
  deps.window.addEventListener('focus', input);
  tick();
  return () => {
    disposed = true;
    clearInterval(timer);
    for (const name of INPUTS) deps.window.removeEventListener(name, input);
    deps.document.removeEventListener('visibilitychange', tick);
    deps.window.removeEventListener('focus', input);
    if (reported) void deps.send(false).catch(() => {});
  };
}

export function presenceSender(clientId: string, path = './api/botharness/presence') {
  return async (active: boolean): Promise<void> => {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: !active,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, active }),
    });
    if (!response.ok) throw new Error(`presence-${response.status}`);
  };
}
