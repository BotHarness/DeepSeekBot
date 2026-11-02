import type { LocalVideoClientState } from '../../../../../packages/computer/src/local-video-client';

export function computerHeaderState(connected: boolean, state: LocalVideoClientState) {
  const current = connected && (state.status === 'observing' || state.status === 'controlling');
  const host = current ? state.host : undefined;
  const signal =
    !connected || state.status === 'unavailable' || state.status === 'unsupported'
      ? 'offline'
      : host?.media.status === 'live' && host.media.captureAlive && state.presenting
        ? 'live'
        : 'waiting';
  const controller =
    host === undefined ? 'unknown' : host.controlHeld ? 'human' : host.paused ? 'paused' : 'bot';
  return { signal, controller } as const;
}
