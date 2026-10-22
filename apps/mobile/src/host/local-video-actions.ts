import type { LocalVideoClientState } from '../../../../packages/computer/src/local-video-client';

/** Grant ownership survives a stall; input eligibility does not. */
export function localVideoActions(state: LocalVideoClientState): { release: boolean; reconnect: boolean } {
  return {
    release: state.host?.binding !== undefined && state.host.grant !== undefined,
    reconnect: state.status === 'unavailable' || state.status === 'idle' ||
      (state.host?.binding !== undefined &&
        (state.host.media.status === 'stalled' || !state.presenting || state.code === 'media-not-live')),
  };
}
