import type { LocalVideoClientState } from '../../../../../packages/computer/src/local-video-client';
import type { ConnectionState } from '../../host/client';

export function computerVideoStatus(state: LocalVideoClientState, connection: ConnectionState) {
  const connected = connection.status === 'connected';
  const active = state.status === 'observing' || state.status === 'controlling';
  const live =
    connected &&
    active &&
    state.presenting &&
    state.host?.media.status === 'live' &&
    state.host.media.captureAlive;
  const failed =
    (!connected && connection.status !== 'connecting') || state.status === 'unavailable';
  return {
    connection: live ? 'live' : failed ? 'disconnected' : 'waiting',
    control:
      !connected || !active || state.busy || !state.host
        ? 'unknown'
        : state.status === 'controlling' && state.host.controller && state.host.grant
          ? 'human'
          : state.host.controller
            ? 'unknown'
            : state.host.controlHeld
              ? 'other-human'
              : state.host.paused
                ? 'paused'
                : 'bot',
  } as const;
}
