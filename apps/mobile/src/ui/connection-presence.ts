import type { ConnectionState } from '../host/client';

export const CONNECTION_QUIET_MS = 4_000;
export const CONNECTION_OFFLINE_MS = 15_000;

export type ConnectionPresence = { progress?: 'connecting' | 'reconnecting'; offline: boolean };

export function connectionPresence(
  status: ConnectionState['status'] | undefined,
  interrupted: boolean,
  disruptedFor: number | undefined,
): ConnectionPresence {
  if (disruptedFor === undefined || disruptedFor < CONNECTION_QUIET_MS) return { offline: false };
  if (
    (status === 'unreachable' || status === 'reconnecting') &&
    disruptedFor >= CONNECTION_OFFLINE_MS
  )
    return { offline: true };
  if (status === 'connecting') return { progress: 'connecting', offline: false };
  if (
    status === 'reconnecting' ||
    status === 'unreachable' ||
    (status === 'connected' && interrupted)
  )
    return { progress: 'reconnecting', offline: false };
  return { offline: false };
}

export const connectionDisrupted = (
  status: ConnectionState['status'] | undefined,
  interrupted: boolean,
): boolean =>
  status === 'connecting' ||
  status === 'reconnecting' ||
  status === 'unreachable' ||
  (status === 'connected' && interrupted);
