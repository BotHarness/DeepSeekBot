import {
  durationBucket,
  isUuid,
  record,
  sanitizeEvent,
  type ConnectionTrigger,
  type ConnectionOutcome,
  type ConnectionReason,
  type ActivationStep,
  type ChannelKind,
  type EventProperties,
  type PairingMethod,
  type PairingOutcome,
  type PairingReason,
  type TelemetryContext,
  type TelemetryEvent,
} from './schema';
export type { TelemetryContext, TelemetryEvent } from './schema';

export interface TelemetryOptions {
  collect?: boolean;
  resetSender?(): Promise<void>;
  storage: { read(): Promise<unknown>; write(value: unknown): void };
  sender(batch: readonly TelemetryEvent[], signal: AbortSignal): Promise<void>;
  uuid(): string;
  now(): number;
  monotonic(): number;
  context: TelemetryContext;
}
const TTL = 24 * 60 * 60 * 1000;

export function createMobileTelemetry(options: TelemetryOptions) {
  let enabled = false;
  let loaded = false;
  let noticeSeen = false;
  let disposed = false;
  let identity: string | undefined;
  let session: string | undefined;
  let active = false;
  let hostCount = 0;
  let backgroundAt: number | undefined;
  let everOpened = false;
  let queue: TelemetryEvent[] = [];
  const steps = new Set<ActivationStep>();
  let generation = 0;
  let controller: AbortController | undefined;
  let flushing = false;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const backgroundListeners = new Set<() => void>();
  let snapshot = { loaded, enabled, noticeOpen: false, storageError: false };
  const publish = (storageError = false) => {
    snapshot = { loaded, enabled, noticeOpen: loaded && enabled && !noticeSeen, storageError };
    for (const listener of listeners) listener();
  };
  const prune = () => {
    const now = options.now();
    queue = queue.filter(
      (event) => Date.parse(event.timestamp) > now - TTL && Date.parse(event.timestamp) <= now,
    );
    while (queue.length > 100 || JSON.stringify(queue).length > 256 * 1024) queue.shift();
  };
  const persist = (): boolean => {
    prune();
    try {
      options.storage.write(
        enabled
          ? {
              version: 1,
              enabled,
              identity,
              queue,
              steps: [...steps],
              ...(noticeSeen ? { noticeSeen } : {}),
            }
          : { version: 1, enabled: false, ...(noticeSeen ? { noticeSeen } : {}) },
      );
      return true;
    } catch {
      enabled = false;
      identity = undefined;
      session = undefined;
      queue = [];
      generation += 1;
      controller?.abort();
      clearTimeout(timer);
      timer = undefined;
      publish(true);
      return false;
    }
  };
  const schedule = (delay = 2000) => {
    if (disposed || !enabled || queue.length === 0 || timer !== undefined || flushing) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delay);
  };
  const capture = <E extends keyof EventProperties>(
    event: E,
    properties: EventProperties[E],
    foregroundSession = session,
  ): boolean => {
    if (
      options.collect === false ||
      !enabled ||
      disposed ||
      identity === undefined ||
      session === undefined
    )
      return false;
    const safe = sanitizeEvent({
      uuid: options.uuid(),
      distinct_id: identity,
      timestamp: new Date(options.now()).toISOString(),
      event,
      properties: { ...options.context, foreground_session_id: foregroundSession, ...properties },
    });
    if (safe === undefined) return false;
    queue.push(safe);
    if (!persist()) return false;
    schedule();
    return true;
  };
  async function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    if (options.collect === false || !enabled || disposed || flushing) return;
    if (!persist() || queue.length === 0) return;
    flushing = true;
    const current = generation;
    const batch = [...queue];
    const abort = new AbortController();
    controller = abort;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        options.sender(batch, abort.signal),
        new Promise<never>((_, reject) => {
          const cancel = () => reject(new Error('Statistics send cancelled'));
          abort.signal.addEventListener('abort', cancel, { once: true });
          timeout = setTimeout(() => abort.abort(), 8000);
        }),
      ]);
      if (current !== generation) return;
      const sent = new Set(batch.map((event) => event.uuid));
      queue = queue.filter((event) => !sent.has(event.uuid));
      retry = 0;
      persist();
    } catch {
      if (current === generation) retry = Math.min(retry + 1, 6);
    } finally {
      clearTimeout(timeout);
      flushing = false;
      if (controller === abort) controller = undefined;
      schedule(Math.min(60_000, 1000 * 2 ** retry));
    }
  }
  function activation(
    step: ActivationStep,
    channel_kind: ChannelKind | 'none' = 'none',
    foregroundSession = session,
  ): void {
    if (
      options.collect === false ||
      !enabled ||
      (!active && step !== 'message_accepted') ||
      session === undefined ||
      steps.has(step)
    )
      return;
    steps.add(step);
    if (!capture('mobile_activation_step', { step, channel_kind }, foregroundSession))
      steps.delete(step);
  }
  function foreground(next: boolean, count: number): void {
    hostCount = count;
    if (!next) {
      if (active) backgroundAt = options.monotonic();
      active = false;
      for (const listener of backgroundListeners) listener();
      return;
    }
    active = true;
    if (!enabled) return;
    if (
      session !== undefined &&
      (backgroundAt === undefined || options.monotonic() - backgroundAt < 30 * 60_000)
    ) {
      backgroundAt = undefined;
      return;
    }
    backgroundAt = undefined;
    session = options.uuid();
    capture('mobile_app_opened', {
      launch_kind: everOpened ? 'resume' : 'cold',
      paired_host_count_bucket: count === 0 ? '0' : count === 1 ? '1' : '2plus',
    });
    everOpened = true;
  }
  let readFailed = false;
  const ready = options.storage
    .read()
    .catch(() => {
      readFailed = true;
      return undefined;
    })
    .then((value) => {
      if (disposed) return;
      const saved = record(value);
      noticeSeen = saved['noticeSeen'] === true;
      if (readFailed) {
        enabled = false;
        loaded = true;
        publish(true);
        return;
      }
      enabled = false;
      if (value === undefined) {
        enabled = true;
        identity = options.uuid();
        persist();
      } else if (saved['version'] === 1 && saved['enabled'] === true && isUuid(saved['identity'])) {
        enabled = true;
        identity = saved['identity'];
        for (const step of ['host_ready', 'message_accepted', 'bot_message_observed'] as const)
          if (Array.isArray(saved['steps']) && saved['steps'].includes(step)) steps.add(step);
        queue = (Array.isArray(saved['queue']) ? saved['queue'] : []).flatMap((entry) => {
          const safe = sanitizeEvent(entry);
          return safe !== undefined && safe.distinct_id === identity ? [safe] : [];
        });
        persist();
      }
      loaded = true;
      publish(snapshot.storageError);
      foreground(active, hostCount);
      schedule();
    });
  return {
    ready,
    async dismissNotice(): Promise<void> {
      await ready;
      if (disposed) return;
      noticeSeen = true;
      if (persist()) publish();
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async setEnabled(next: boolean): Promise<boolean> {
      await ready;
      if (disposed) return false;
      if (next === enabled && !snapshot.storageError) return true;
      generation += 1;
      controller?.abort();
      void options.resetSender?.().catch(() => {});
      clearTimeout(timer);
      timer = undefined;
      enabled = next;
      identity = next ? options.uuid() : undefined;
      session = undefined;
      queue = [];
      steps.clear();
      retry = 0;
      const saved = persist();
      if (saved) {
        publish();
        foreground(active, hostCount);
      }
      return saved;
    },
    foreground,
    pairing(method: PairingMethod) {
      const current = generation;
      const allowed = enabled;
      const start = options.monotonic();
      const attempt_id = options.uuid();
      let finished = false;
      capture('mobile_pairing_started', { method, attempt_id });
      return {
        finish(outcome: PairingOutcome, reason: PairingReason = 'none') {
          if (finished || !allowed || current !== generation) return;
          finished = true;
          capture('mobile_pairing_result', {
            method,
            attempt_id,
            outcome,
            reason,
            duration_bucket: durationBucket(options.monotonic() - start),
          });
        },
      };
    },
    isActive: () => active,
    onBackground(listener: () => void) {
      backgroundListeners.add(listener);
      return () => {
        backgroundListeners.delete(listener);
      };
    },
    connection(trigger: ConnectionTrigger) {
      const current = generation;
      const allowed = enabled && active;
      const attempt_id = options.uuid();
      const start = options.monotonic();
      let finished = false;
      return {
        finish(outcome: ConnectionOutcome, retries = 0, reason: ConnectionReason = 'none') {
          if (finished || !allowed || current !== generation) return;
          finished = true;
          capture('mobile_connection_result', {
            trigger,
            outcome,
            reason,
            attempt_id,
            duration_bucket: durationBucket(options.monotonic() - start),
            retry_count_bucket:
              retries === 0 ? '0' : retries === 1 ? '1' : retries <= 3 ? '2-3' : '4plus',
          });
          if (outcome === 'ready') activation('host_ready');
        },
      };
    },
    activation,
    send(kind: ChannelKind) {
      const current = generation;
      const fromSession = session;
      const allowed = enabled && active;
      let accepted = false;
      const valid = () => allowed && enabled && !disposed && current === generation;
      return {
        accepted(): boolean {
          if (!valid()) return false;
          accepted = true;
          activation('message_accepted', kind, fromSession);
          return true;
        },
        observed() {
          if (accepted && valid() && active && fromSession === session)
            activation('bot_message_observed', kind);
        },
      };
    },
    flush,
    dispose() {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
    },
  };
}
export type MobileTelemetry = ReturnType<typeof createMobileTelemetry>;
