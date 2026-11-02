import type { RemoteHosts } from './remote-hosts.js';
import { AppearanceError, object } from './appearance.js';

export interface ConnectionAttempt {
  attemptId: string;
  state: 'connecting' | 'verify-host' | 'approve-device' | 'connected' | 'failed' | 'cancelled';
  hostId?: string;
  hostName?: string;
  hostFingerprint?: string;
  deviceFingerprint?: string;
  saved: boolean;
  code?: string;
}

interface Attempt {
  snapshot: ConnectionAttempt;
  abort: AbortController;
  timer: ReturnType<typeof setTimeout>;
  link: string;
  confirm: ((value: boolean) => void) | undefined;
}

export function createConnectionControl(
  sources: RemoteHosts,
  local: () => { id?: string; name?: string },
) {
  const attempts = new Map<string, Attempt>();
  let disposed = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const off = sources.subscribe(() => {
    for (const attempt of attempts.values()) {
      if (attempt.snapshot.state !== 'connecting' || !attempt.snapshot.saved) continue;
      const remote = sources
        .getSnapshot()
        .hosts.find((entry) => entry.host.hostId === attempt.snapshot.hostId);
      if (
        remote?.snapshot.connection.status === 'connected' &&
        remote.snapshot.roster !== undefined
      ) {
        attempt.snapshot = { ...attempt.snapshot, state: 'connected' };
        clearTimeout(attempt.timer);
        notify();
      }
    }
  });
  const cancel = (attempt: Attempt) => {
    attempt.abort.abort();
    attempt.confirm?.(false);
    attempt.confirm = undefined;
    clearTimeout(attempt.timer);
    if (!['connected', 'failed', 'cancelled'].includes(attempt.snapshot.state)) {
      attempt.snapshot = { ...attempt.snapshot, state: 'cancelled' };
      notify();
    }
  };
  const bindDelivery = (attempt: Attempt, signal: AbortSignal) => {
    const abort = () => cancel(attempt);
    signal.addEventListener('abort', abort, { once: true });
    attempt.abort.signal.addEventListener(
      'abort',
      () => signal.removeEventListener('abort', abort),
      { once: true },
    );
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(attemptId: string) {
      return attempts.get(attemptId)?.snapshot;
    },
    execute(raw: unknown, request: { expiresAt: number; signal: AbortSignal }): ConnectionAttempt {
      if (disposed || request.signal.aborted) throw new AppearanceError('connection-cancelled');
      if (!Number.isFinite(request.expiresAt) || Date.now() >= request.expiresAt)
        throw new AppearanceError('connection-request-stale');
      const input = object(raw);
      if (typeof input.attemptId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/u.test(input.attemptId))
        throw new AppearanceError('connection-attempt-required');
      let attempt = attempts.get(input.attemptId);
      if (input.action === 'start') {
        if (typeof input.link !== 'string' || input.link.length > 3200)
          throw new AppearanceError('connection-link-invalid');
        if (attempt) {
          if (attempt.link !== input.link) throw new AppearanceError('connection-attempt-conflict');
          return attempt.snapshot;
        }
        if (attempts.size >= 16) throw new AppearanceError('connection-attempt-limit');
        const abort = new AbortController();
        const entry: Attempt = {
          snapshot: {
            attemptId: input.attemptId,
            state: 'connecting',
            saved: false,
          },
          abort,
          timer: setTimeout(() => cancel(entry), 300_000),
          link: input.link,
          confirm: undefined,
        };
        attempts.set(input.attemptId, entry);
        bindDelivery(entry, request.signal);
        const current = local();
        void sources
          .pair(input.link, `Browser on ${current.name ?? 'Host'}`, current.id, {
            signal: abort.signal,
            confirmFingerprint: (fingerprint, hostName) =>
              new Promise<boolean>((resolve) => {
                if (abort.signal.aborted) {
                  resolve(false);
                  return;
                }
                entry.confirm = resolve;
                entry.snapshot = {
                  ...entry.snapshot,
                  state: 'verify-host',
                  hostName,
                  hostFingerprint: fingerprint,
                };
                notify();
              }),
            onPending: (fingerprint) => {
              if (abort.signal.aborted) return;
              entry.snapshot = {
                ...entry.snapshot,
                state: 'approve-device',
                deviceFingerprint: fingerprint,
              };
              notify();
            },
          })
          .then(
            (result) => {
              if (!result.ok) {
                if (!abort.signal.aborted)
                  entry.snapshot = { ...entry.snapshot, state: 'failed', code: result.code };
                clearTimeout(entry.timer);
              } else {
                const remote = sources
                  .getSnapshot()
                  .hosts.find((item) => item.host.hostId === result.host.hostId);
                const connected =
                  remote?.snapshot.connection.status === 'connected' &&
                  remote.snapshot.roster !== undefined;
                entry.snapshot = {
                  ...entry.snapshot,
                  hostId: result.host.hostId,
                  hostName: result.host.hostName,
                  saved: true,
                  state: abort.signal.aborted
                    ? 'cancelled'
                    : connected
                      ? 'connected'
                      : 'connecting',
                };
                if (connected) clearTimeout(entry.timer);
              }
              notify();
            },
            () => {
              if (!abort.signal.aborted)
                entry.snapshot = { ...entry.snapshot, state: 'failed', code: 'connection-failed' };
              clearTimeout(entry.timer);
              notify();
            },
          );
        notify();
        return entry.snapshot;
      }
      if (!attempt) throw new AppearanceError('connection-attempt-unknown');
      if (input.action === 'cancel') cancel(attempt);
      else if (input.action === 'confirm') {
        if (
          input.confirm !== true ||
          input.fingerprint !== attempt.snapshot.hostFingerprint ||
          !attempt.confirm ||
          attempt.snapshot.state !== 'verify-host'
        )
          throw new AppearanceError('connection-confirmation-required');
        const confirm = attempt.confirm;
        bindDelivery(attempt, request.signal);
        attempt.confirm = undefined;
        attempt.snapshot = { ...attempt.snapshot, state: 'connecting' };
        confirm(true);
        notify();
      } else if (input.action !== 'status') throw new AppearanceError('connection-invalid-action');
      return attempt.snapshot;
    },
    dispose() {
      disposed = true;
      for (const attempt of attempts.values()) cancel(attempt);
      off();
      listeners.clear();
    },
  };
}
