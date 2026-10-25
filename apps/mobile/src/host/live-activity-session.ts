import { ActivityRequestFailed, type HostActivity } from './live-activity';
import type { SavedHost } from './hosts';

export interface ActivityTarget {
  hostId: string;
  channelId: string;
  messageId: string;
  botSlug: string;
}
export interface ActivityDisplay {
  state: 'working' | 'completed' | 'failed' | 'unknown';
  source: string;
  updatedAt: string;
  locale: 'en' | 'zh';
}
export interface NativeRequestActivity {
  id: string;
  token(): Promise<string>;
  onToken(listener: (token: string) => void): () => void;
  end(): Promise<void>;
}
interface StoredTarget extends ActivityTarget {
  clientActivityId: string;
  linkId: string;
  expiresAt: number;
}
export interface ActivitySessionSnapshot {
  ready: boolean;
  busy: boolean;
  tracking: boolean;
  pendingStop: boolean;
  target?: StoredTarget;
}
const parse = (input: unknown): StoredTarget | undefined => {
  if (!input || typeof input !== 'object') return undefined;
  const value = input as Record<string, unknown>;
  if (
    !['hostId', 'channelId', 'messageId', 'botSlug', 'clientActivityId', 'linkId'].every(
      (key) => typeof value[key] === 'string' && String(value[key]).length <= 128,
    ) ||
    typeof value['expiresAt'] !== 'number'
  )
    return undefined;
  return {
    hostId: String(value['hostId']),
    channelId: String(value['channelId']),
    messageId: String(value['messageId']),
    botSlug: String(value['botSlug']),
    clientActivityId: String(value['clientActivityId']),
    linkId: String(value['linkId']),
    expiresAt: value['expiresAt'],
  };
};

export function createActivitySession(options: {
  native: {
    supported(): boolean;
    start(content: ActivityDisplay, url: string): Promise<NativeRequestActivity>;
    instances(): Promise<NativeRequestActivity[]>;
  };
  remote: HostActivity;
  storage: { read(): Promise<unknown>; write(value: unknown): Promise<void> };
  host(hostId: string): SavedHost | undefined;
  currentHostId(): string | undefined;
  bundleIdentifier: string;
  locale(): 'en' | 'zh';
  url(linkId: string): string;
  id(): string;
}) {
  let state: ActivitySessionSnapshot = {
    ready: false,
    busy: false,
    tracking: false,
    pendingStop: false,
  };
  const listeners = new Set<() => void>();
  const publish = (next: ActivitySessionSnapshot) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const save = () =>
    options.storage.write({
      target: state.target,
      tracking: state.tracking,
      pendingStop: state.pendingStop,
    });
  let queue: Promise<unknown> = Promise.resolve();
  let offToken: (() => void) | undefined;
  let boundId: string | undefined;
  let stopRetries = 0;
  let nextStopRetry = 0;
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };
  const ready = options.storage
    .read()
    .then((value) => {
      const stored = value as
        | { target?: unknown; tracking?: unknown; pendingStop?: unknown }
        | undefined;
      const target = parse(stored?.target);
      publish({
        ...state,
        ready: true,
        tracking: target !== undefined && stored?.tracking === true,
        pendingStop: stored?.pendingStop === true,
        ...(target ? { target } : {}),
      });
    })
    .catch(() => {
      publish({ ...state, ready: true });
    });
  const scopedHost = (target: ActivityTarget) => {
    const host = options.host(target.hostId);
    if (!host || options.currentHostId() !== target.hostId)
      throw new ActivityRequestFailed('activity-source-changed');
    return host;
  };
  const register = async (target: StoredTarget, token: string) => {
    const host = scopedHost(target);
    return options.remote.request(host, 'register', {
      clientActivityId: target.clientActivityId,
      token,
      bundleIdentifier: options.bundleIdentifier,
      channelId: target.channelId,
      messageId: target.messageId,
      locale: options.locale(),
    });
  };
  const stop = async (removedHost?: SavedHost) => {
    offToken?.();
    offToken = undefined;
    boundId = undefined;
    const target = state.target;
    publish({ ...state, tracking: false, pendingStop: target !== undefined });
    const persisted = save().catch(() => undefined);
    for (const activity of await options.native.instances())
      await activity.end().catch(() => undefined);
    await persisted;
    if (!target) return;
    const host = removedHost?.hostId === target.hostId ? removedHost : options.host(target.hostId);
    if (!host) return;
    stopRetries += 1;
    nextStopRetry = Date.now() + 60_000;
    await options.remote.request(host, 'stop', { clientActivityId: target.clientActivityId });
    publish({ ...state, pendingStop: false });
    await save();
  };
  const registrationFailed = async (error: unknown) => {
    if (
      error instanceof ActivityRequestFailed &&
      [
        'activity-source-changed',
        'device-revoked',
        'activity-ended',
        'activity-not-found',
        'activity-request-not-found',
        'activity-app-unsupported',
      ].includes(error.code)
    ) {
      await stop().catch(() => undefined);
      return;
    }
    offToken?.();
    offToken = undefined;
    boundId = undefined;
  };
  const bind = (activity: NativeRequestActivity, target: StoredTarget) => {
    offToken?.();
    boundId = activity.id;
    offToken = activity.onToken((token) => {
      void serial(async () => {
        if (!state.tracking || state.target?.clientActivityId !== target.clientActivityId) return;
        try {
          await register(target, token);
        } catch (error) {
          await registrationFailed(error);
        }
      });
    });
  };
  let syncing: Promise<void> | undefined;
  const owner = {
    ready,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    settled: () => queue,
    target(linkId: string): ActivityTarget | undefined {
      return state.target?.linkId === linkId && state.target.expiresAt > Date.now()
        ? state.target
        : undefined;
    },
    start: async (target: ActivityTarget) => {
      await ready;
      return serial(async () => {
        if (!options.native.supported())
          throw new ActivityRequestFailed('activity-native-unavailable');
        if (state.tracking) throw new ActivityRequestFailed('activity-already-tracked');
        publish({ ...state, busy: true });
        try {
          if (state.pendingStop) await stop();
          const host = scopedHost(target);
          const prepared = await options.remote.request(host, 'prepare', {
            channelId: target.channelId,
            messageId: target.messageId,
            bundleIdentifier: options.bundleIdentifier,
          });
          scopedHost(target);
          const progress = prepared['progress'] as
            | { state?: unknown; terminal?: unknown; updatedAt?: unknown }
            | undefined;
          if (
            prepared['bundleIdentifier'] !== options.bundleIdentifier ||
            progress?.state !== 'working' ||
            progress.terminal !== false ||
            typeof progress.updatedAt !== 'string' ||
            typeof prepared['source'] !== 'string'
          )
            throw new ActivityRequestFailed('activity-request-unavailable');
          const linkId = options.id();
          const activity = await options.native.start(
            {
              state: 'working',
              updatedAt: progress.updatedAt,
              source: prepared['source'],
              locale: options.locale(),
            },
            options.url(linkId),
          );
          const current = {
            ...target,
            linkId,
            clientActivityId: activity.id,
            expiresAt: Date.now() + 8 * 60 * 60_000,
          };
          publish({ ...state, tracking: true, pendingStop: false, target: current });
          await save();
          bind(activity, current);
          const token = await activity.token();
          const registered = await register(current, token);
          scopedHost(target);
          if (typeof registered['expiresAt'] !== 'number')
            throw new ActivityRequestFailed('activity-protocol-error');
          publish({ ...state, target: { ...current, expiresAt: registered['expiresAt'] } });
          await save();
          stopRetries = 0;
        } catch (error) {
          if (state.tracking) await stop().catch(() => undefined);
          throw error;
        } finally {
          publish({ ...state, busy: false });
        }
      });
    },
    async stop() {
      await ready;
      stopRetries = 0;
      return serial(async () => {
        publish({ ...state, busy: true });
        try {
          await stop();
        } finally {
          publish({ ...state, busy: false });
        }
      });
    },
    async forget(host: SavedHost) {
      await ready;
      return serial(async () => {
        if (state.target?.hostId === host.hostId) await stop(host);
      });
    },
    sync(): Promise<void> {
      if (syncing) return syncing;
      syncing = ready
        .then(() =>
          serial(async () => {
            if (options.currentHostId() === undefined) return;
            const target = state.target;
            const instances = await options.native.instances();
            if (!state.tracking || !target) {
              for (const activity of instances) await activity.end().catch(() => undefined);
              if (state.pendingStop && stopRetries < 3 && Date.now() >= nextStopRetry) await stop();
              return;
            }
            const activity = instances.find((item) => item.id === target.clientActivityId);
            if (
              !activity ||
              target.expiresAt <= Date.now() ||
              options.currentHostId() !== target.hostId ||
              !options.host(target.hostId)
            ) {
              await stop();
              return;
            }
            if (boundId !== activity.id) {
              bind(activity, target);
              try {
                await register(target, await activity.token());
              } catch (error) {
                await registrationFailed(error);
              }
            }
          }),
        )
        .finally(() => {
          syncing = undefined;
        });
      return syncing;
    },
  };
  return owner;
}
