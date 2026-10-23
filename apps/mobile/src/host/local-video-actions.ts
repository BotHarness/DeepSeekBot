import type {
  LocalVideoClient,
  LocalVideoClientState,
} from '../../../../packages/computer/src/local-video-client';
import type { ConnectionState } from './client';

export function localVideoActions({
  state,
  connection,
}: {
  state: LocalVideoClientState;
  connection: ConnectionState;
}): {
  handBack: boolean;
  recovery: 'host' | 'video' | 'pair' | undefined;
} {
  const reconnectVideo =
    state.status === 'unavailable' ||
    state.status === 'idle' ||
    (state.host?.binding !== undefined &&
      (state.host.media.status === 'stalled' ||
        !state.presenting ||
        state.code === 'media-not-live'));
  return {
    handBack: state.host?.paused === true || state.host?.grant !== undefined,
    recovery:
      connection.status === 'refused'
        ? 'pair'
        : connection.status === 'unreachable' || connection.status === 'reconnecting'
          ? 'host'
          : connection.status === 'connected' && reconnectVideo
            ? 'video'
            : undefined,
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
