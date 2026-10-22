import type {
  LocalVideoClient,
  LocalVideoClientState,
} from '../../../../packages/computer/src/local-video-client';

export function localVideoActions(state: LocalVideoClientState): {
  release: boolean;
  reconnect: boolean;
} {
  return {
    release: state.host?.binding !== undefined && state.host.grant !== undefined,
    reconnect:
      state.status === 'unavailable' ||
      state.status === 'idle' ||
      (state.host?.binding !== undefined &&
        (state.host.media.status === 'stalled' ||
          !state.presenting ||
          state.code === 'media-not-live')),
  };
}

export function watchLocalVideoForeground(
  viewer: Pick<LocalVideoClient, 'start' | 'stop'>,
  initiallyActive: boolean,
  subscribe: (listener: (active: boolean) => void) => () => void,
): () => void {
  let disposed = false;
  let active = false;
  const update = (next: boolean) => {
    if (disposed || next === active) return;
    active = next;
    if (next) void viewer.start();
    else void viewer.stop();
  };
  const unsubscribe = subscribe(update);
  update(initiallyActive);
  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    void viewer.stop();
  };
}
