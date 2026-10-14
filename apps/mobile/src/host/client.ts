import type { BotPrimaryColor } from '../../../../packages/core/src/bots/primary-color';
import type { HostCarrier, HostSocket } from './carrier';
import { DEVICE_PREFIX } from './pairing';
import { socketOrigin } from './route';
import {
  REMOTE_STREAM_MUX_PATH,
  type ActivityLiveFrame,
  type AttachmentRef,
  type AggregatedState,
  type ChannelListItem,
  type ClientRequest,
  type MuxClientFrame,
  type MuxServerFrame,
  type PersonaBotSummary,
  type RosterLiveFrame,
} from './wire';

export type ConnectionState =
  | { status: 'connecting'; route: string }
  | { status: 'connected'; route: string }
  | { status: 'reconnecting'; route: string; attempt: number }
  | { status: 'unreachable'; route: string; attempt: number; reason: string }
  | { status: 'refused'; route: string; code: DeviceRefusal; reason: string }
  | { status: 'stopped'; route: string };

export interface RosterBot {
  slug: string;
  displayName: string;
  avatarUrl?: string;
  avatarHeaders?: Record<string, string>;
  appearance?: unknown;
  avatarSeed?: 2;
  primaryColor?: BotPrimaryColor;
  state: AggregatedState;
  paused: boolean;
  dmChannelId?: string;
  preview?: string;
  previewAt?: string;
}

export interface RosterChannel {
  id: string;
  name: string;
  memberCount: number;
  preview?: string;
  previewAt?: string;
}

export interface RosterView {
  bots: RosterBot[];
  channels: RosterChannel[];
}

export interface HostSnapshot {
  connection: ConnectionState;
  roster?: RosterView;
}

export interface RemoteSource {
  uri: string;
  headers: Record<string, string>;
}

export interface StreamHandlers {
  item(value: unknown): void;
  interrupted(reason: string): void;
  refused(error: { code: string; message: string }): void;
}

export interface HostClient {
  getSnapshot(): HostSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
  retryNow(): void;
  refresh(): Promise<void>;
  call<T>(method: string, args?: Record<string, unknown>): Promise<T>;
  upload(name: string, data: Blob): Promise<AttachmentRef>;
  resource(path: string): RemoteSource;
  onLive(listener: (source: 'roster' | 'activity') => void): () => void;
  follow(endpoint: string, args: Record<string, unknown>, handlers: StreamHandlers): () => void;
}

export interface HostClientOptions {
  routes: string[];
  credential: string;
  carrier: HostCarrier;
  backoff?: (attempt: number) => number;
  timeoutMs?: number;
}

export type DeviceRefusal = 'device-revoked' | 'device-unknown' | 'device-credential-missing';

const REFUSALS: Record<DeviceRefusal, string> = {
  'device-revoked': 'This phone was removed from the paired devices on your computer.',
  'device-unknown': 'Your computer no longer knows this phone.',
  'device-credential-missing': 'This phone has no pairing for your computer.',
};

class CredentialRefused extends Error {
  constructor(readonly code: DeviceRefusal) {
    super(REFUSALS[code]);
  }
}

function refusalOf(text: string): DeviceRefusal | undefined {
  try {
    const code = record(JSON.parse(text))['code'];
    return typeof code === 'string' && code in REFUSALS ? (code as DeviceRefusal) : undefined;
  } catch {
    return undefined;
  }
}

class Unreachable extends Error {}

const UPLOAD_TOO_LARGE = 'The file is larger than the Host accepts.';
const uploadTimeoutMs = 120_000;

export class MethodRefused extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Follower {
  endpoint: string;
  args: Record<string, unknown>;
  handlers: StreamHandlers;
  streamId?: string | undefined;
  reopen?: ReturnType<typeof setTimeout> | undefined;
}

const defaultBackoff = (attempt: number): number => Math.min(15_000, 500 * 2 ** (attempt - 1));

function id(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function previewOf(channel: ChannelListItem | undefined): { preview?: string; previewAt?: string } {
  const message = channel?.latestMessage;
  if (message === undefined) return {};
  return {
    preview: message.body.replace(/\s+/gu, ' ').trim().slice(0, 140),
    previewAt: message.at,
  };
}

export function createHostClient(options: HostClientOptions): HostClient {
  const routes = options.routes;
  const authorization = { authorization: `Device ${options.credential}` };
  let route = routes[0] ?? '';
  const backoff = options.backoff ?? defaultBackoff;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const listeners = new Set<() => void>();
  const liveListeners = new Set<(source: 'roster' | 'activity') => void>();
  let snapshot: HostSnapshot = { connection: { status: 'stopped', route } };
  let bots: PersonaBotSummary[] | undefined;
  let channels = new Map<string, ChannelListItem>();
  let states = new Map<string, AggregatedState>();
  let running = false;
  let everConnected = false;
  let attempt = 0;
  let generation = 0;
  let socket: HostSocket | undefined;
  let wake: (() => void) | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let reloading: Promise<void> | undefined;
  let reloadAgain = false;
  const followers = new Set<Follower>();
  let liveSocket: { generation: number; send(frame: MuxClientFrame): void } | undefined;
  let streams = new Map<string, { item(value: unknown): void; end(frame: MuxServerFrame): void }>();

  const publish = (connection: ConnectionState = snapshot.connection): void => {
    snapshot = {
      connection,
      ...(bots === undefined ? {} : { roster: view(bots) }),
    };
    for (const listener of listeners) listener();
  };

  const view = (list: PersonaBotSummary[]): RosterView => {
    const dms = new Map<string, ChannelListItem>();
    const groups: RosterChannel[] = [];
    for (const channel of channels.values()) {
      if (channel.deletedAt !== undefined) continue;
      if (channel.type === 'dm' && channel.botSlug !== undefined) dms.set(channel.botSlug, channel);
      else if (channel.type === 'group')
        groups.push({
          id: channel.id,
          name: channel.name,
          memberCount: channel.members.length,
          ...previewOf(channel),
        });
    }
    groups.sort((a, b) => (b.previewAt ?? '').localeCompare(a.previewAt ?? ''));
    return {
      bots: list
        .filter((bot) => bot.deleted !== true)
        .map((bot) => {
          const dm = dms.get(bot.slug);
          return {
            slug: bot.slug,
            displayName: bot.displayName,
            ...(bot.avatar === undefined
              ? {}
              : { avatarUrl: absolute(bot.avatar), avatarHeaders: authorization }),
            ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
            ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
            ...(bot.primaryColor === undefined ? {} : { primaryColor: bot.primaryColor }),
            state: states.get(bot.slug) ?? bot.aggregateState,
            paused: bot.paused === true,
            ...(dm === undefined ? {} : { dmChannelId: dm.id }),
            ...previewOf(dm),
          };
        }),
      channels: groups,
    };
  };

  const absolute = (path: string): string =>
    path.startsWith('/') ? `${route}${DEVICE_PREFIX}${path}` : path;

  const reloadInBackground = (): void => {
    reload().catch(() => {});
  };

  const withDeadline = async <T>(
    work: (signal: AbortSignal) => Promise<T>,
    ms: number = timeoutMs,
  ): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await work(controller.signal);
    } catch (error) {
      if (
        error instanceof CredentialRefused ||
        error instanceof Unreachable ||
        error instanceof MethodRefused
      )
        throw error;
      throw new Unreachable(
        controller.signal.aborted
          ? 'The Host did not answer in time.'
          : 'The Host could not be reached.',
      );
    } finally {
      clearTimeout(timer);
    }
  };

  const call = <T>(
    method: string,
    args: Record<string, unknown> = {},
    via: string = route,
  ): Promise<T> =>
    withDeadline(async (signal) => {
      const name = `botharness/${method}`;
      const request: ClientRequest = {
        type: 'client-request',
        rpcId: id(),
        method: name,
        payload: { args },
      };
      const response = await options.carrier.request(`${via}${DEVICE_PREFIX}/api/${name}`, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: authorization,
        signal,
      });
      if (response.status === 401) {
        const code = refusalOf(await response.text());
        if (code !== undefined) throw new CredentialRefused(code);
      }
      if (response.status >= 400) throw new Unreachable(`The Host answered ${response.status}.`);
      let envelope: Record<string, unknown>;
      try {
        envelope = record(JSON.parse(await response.text()));
      } catch {
        throw new Unreachable('The Host did not return a JSON response.');
      }
      const result = record(envelope['result']);
      if (envelope['type'] !== 'server-response' || result['ok'] !== true) {
        const error = record(result['error']);
        throw new MethodRefused(
          typeof error['code'] === 'string' ? error['code'] : 'refused',
          typeof error['message'] === 'string' ? error['message'] : `${name} was refused.`,
        );
      }
      return result['value'] as T;
    });

  const upload = (name: string, data: Blob): Promise<AttachmentRef> =>
    withDeadline(async (signal) => {
      const response = await options.carrier.request(
        `${route}${DEVICE_PREFIX}/api/botharness/attachment/upload?${new URLSearchParams({ name })}`,
        {
          method: 'POST',
          body: data,
          headers: { ...authorization, 'content-type': 'application/octet-stream' },
          signal,
        },
      );
      if (response.status === 401) {
        const code = refusalOf(await response.text());
        if (code !== undefined) throw new CredentialRefused(code);
      }
      if (response.status === 413) throw new MethodRefused('too-large', UPLOAD_TOO_LARGE);
      if (response.status >= 400) throw new Unreachable(`The Host answered ${response.status}.`);
      let attachment: unknown;
      try {
        attachment = record(JSON.parse(await response.text()))['attachment'];
      } catch {
        throw new Unreachable('The Host did not return a JSON response.');
      }
      const ref = record(attachment);
      if (typeof ref['name'] !== 'string' || typeof ref['mime'] !== 'string')
        throw new Unreachable('The Host did not accept the attachment.');
      return attachment as AttachmentRef;
    }, uploadTimeoutMs);

  const reloadOnce = async (): Promise<void> => {
    const [list, channelList] = await Promise.all([
      call<{ bots: PersonaBotSummary[] }>('list'),
      call<{ channels: ChannelListItem[] }>('channels'),
    ]);
    bots = list.bots;
    channels = new Map(channelList.channels.map((channel) => [channel.id, channel]));
    publish();
  };

  const reload = (): Promise<void> => {
    if (reloading !== undefined) {
      reloadAgain = true;
      return reloading;
    }
    reloading = (async () => {
      try {
        do {
          reloadAgain = false;
          await reloadOnce();
        } while (reloadAgain);
      } finally {
        reloading = undefined;
      }
    })();
    return reloading;
  };

  const notifyLive = (source: 'roster' | 'activity'): void => {
    for (const listener of liveListeners) listener(source);
  };

  const applyActivity = (frame: ActivityLiveFrame): void => {
    states = new Map(frame.snapshot.bots.map((bot) => [bot.slug, bot.state]));
    const known = new Set(bots?.map((bot) => bot.slug));
    if (bots !== undefined && frame.snapshot.bots.some((bot) => !known.has(bot.slug)))
      reloadInBackground();
    publish();
  };

  const applyRoster = (frame: RosterLiveFrame): void => {
    if (frame.type === 'latest') {
      const channel = channels.get(frame.channelId);
      if (channel === undefined) {
        reloadInBackground();
        return;
      }
      channels.set(frame.channelId, { ...channel, latestMessage: frame.message });
      publish();
    } else if (frame.type === 'changed' || frame.type === 'purged') {
      reloadInBackground();
    }
  };

  const pickRoute = async (): Promise<void> => {
    let failure: unknown;
    for (const candidate of routes) {
      try {
        await call('list', {}, candidate);
        route = candidate;
        return;
      } catch (error) {
        if (error instanceof CredentialRefused) throw error;
        failure = error;
      }
    }
    throw failure instanceof Error ? failure : new Unreachable('The Host could not be reached.');
  };

  const openFollower = (follower: Follower): void => {
    const carrier = liveSocket;
    if (carrier === undefined || carrier.generation !== generation) return;
    const streamId = id();
    follower.streamId = streamId;
    streams.set(streamId, {
      item: (value) => follower.handlers.item(value),
      end: (frame) => {
        follower.streamId = undefined;
        if (!followers.has(follower)) return;
        if (frame.type === 'error') {
          followers.delete(follower);
          follower.handlers.refused({ code: frame.error.code, message: frame.error.message });
          return;
        }
        follower.handlers.interrupted('stream ended');
        follower.reopen = setTimeout(() => {
          follower.reopen = undefined;
          if (followers.has(follower) && follower.streamId === undefined) openFollower(follower);
        }, 1_000);
      },
    });
    carrier.send({
      type: 'open',
      streamId,
      endpoint: follower.endpoint,
      payload: { args: follower.args },
    });
  };

  const interruptFollowers = (reason: string): void => {
    liveSocket = undefined;
    for (const follower of followers) {
      clearTimeout(follower.reopen);
      if (follower.streamId === undefined) continue;
      follower.streamId = undefined;
      follower.handlers.interrupted(reason);
    }
  };

  const connectOnce = async (current: number): Promise<void> => {
    await pickRoute();
    const baselines = { roster: false, activity: false };
    let resolveReady: () => void = () => {};
    let rejectReady: (error: Error) => void = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    let resolveClosed: (reason: string) => void = () => {};
    const closed = new Promise<string>((resolve) => {
      resolveClosed = resolve;
    });
    let opened = false;
    streams = new Map();
    const endCore = (frame: MuxServerFrame): void => {
      const reason =
        frame.type === 'error' ? `${frame.error.code}: ${frame.error.message}` : 'stream ended';
      rejectReady(new Unreachable(reason));
      socket?.close();
      resolveClosed(reason);
    };
    const follow = (endpoint: string, onItem: (value: unknown) => void): void => {
      const streamId = id();
      streams.set(streamId, { item: onItem, end: endCore });
      const frame: MuxClientFrame = { type: 'open', streamId, endpoint, payload: { args: {} } };
      socket?.send(JSON.stringify(frame));
    };
    socket = options.carrier.openSocket(
      socketOrigin(route) + DEVICE_PREFIX + REMOTE_STREAM_MUX_PATH,
      {
        open: () => {
          if (current !== generation) return;
          opened = true;
          const carrier = socket;
          liveSocket = {
            generation: current,
            send: (frame) => carrier?.send(JSON.stringify(frame)),
          };
          follow('botharness/followRoster', (value) => {
            const frame = value as RosterLiveFrame;
            if (frame.type === 'baseline') {
              baselines.roster = true;
              if (baselines.activity) resolveReady();
            } else {
              applyRoster(frame);
              notifyLive('roster');
            }
          });
          follow('botharness/followActivity', (value) => {
            const frame = value as ActivityLiveFrame;
            if (frame.type !== 'baseline' && frame.type !== 'changed') return;
            applyActivity(frame);
            if (frame.type === 'changed') notifyLive('activity');
            if (frame.type === 'baseline') {
              baselines.activity = true;
              if (baselines.roster) resolveReady();
            }
          });
          for (const follower of followers) openFollower(follower);
        },
        message: (text) => {
          if (current !== generation) return;
          let frame: MuxServerFrame;
          try {
            frame = JSON.parse(text) as MuxServerFrame;
          } catch {
            return;
          }
          const stream = streams.get(frame.streamId);
          if (stream === undefined) return;
          if (frame.type === 'item') stream.item(frame.value);
          else {
            streams.delete(frame.streamId);
            stream.end(frame);
          }
        },
        closed: (reason) => {
          if (current === generation) interruptFollowers(reason || 'The live connection closed.');
          rejectReady(new Unreachable(reason || 'The live connection closed.'));
          resolveClosed(reason);
        },
      },
      authorization,
    );
    const deadline = setTimeout(
      () => rejectReady(new Unreachable('The live connection did not open in time.')),
      timeoutMs,
    );
    try {
      await ready;
    } catch (error) {
      socket?.close();
      if (!opened) await call('list');
      throw error;
    } finally {
      clearTimeout(deadline);
    }
    await reload();
    if (current !== generation) return;
    attempt = 0;
    everConnected = true;
    publish({ status: 'connected', route });
    await closed;
  };

  const loop = async (current: number): Promise<void> => {
    while (running && current === generation) {
      try {
        await connectOnce(current);
        if (!running || current !== generation) return;
        attempt += 1;
        publish({ status: 'reconnecting', route, attempt });
      } catch (error) {
        if (!running || current !== generation) return;
        socket?.close();
        if (error instanceof CredentialRefused) {
          running = false;
          publish({ status: 'refused', route, code: error.code, reason: error.message });
          return;
        }
        attempt += 1;
        publish({
          status: 'unreachable',
          route,
          attempt,
          reason: error instanceof Error ? error.message : 'The Host could not be reached.',
        });
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
        retryTimer = setTimeout(resolve, backoff(attempt));
      });
      wake = undefined;
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (running) return;
      running = true;
      generation += 1;
      publish(
        everConnected
          ? { status: 'reconnecting', route, attempt: Math.max(attempt, 1) }
          : { status: 'connecting', route },
      );
      void loop(generation);
    },
    stop() {
      running = false;
      interruptFollowers('stopped');
      generation += 1;
      clearTimeout(retryTimer);
      wake?.();
      socket?.close();
      socket = undefined;
      publish({ status: 'stopped', route });
    },
    retryNow() {
      if (!running) return;
      clearTimeout(retryTimer);
      wake?.();
    },
    async refresh() {
      if (snapshot.connection.status === 'connected') await reload();
      else this.retryNow();
    },
    async call<T>(method: string, args: Record<string, unknown> = {}) {
      try {
        return await call<T>(method, args);
      } catch (error) {
        if (error instanceof CredentialRefused && running) {
          running = false;
          generation += 1;
          socket?.close();
          publish({ status: 'refused', route, code: error.code, reason: error.message });
        }
        throw error;
      }
    },
    upload,
    resource: (path) => ({ uri: absolute(path), headers: authorization }),
    onLive(listener) {
      liveListeners.add(listener);
      return () => liveListeners.delete(listener);
    },
    follow(endpoint, args, handlers) {
      const follower: Follower = { endpoint, args, handlers };
      followers.add(follower);
      openFollower(follower);
      return () => {
        if (!followers.delete(follower)) return;
        clearTimeout(follower.reopen);
        const streamId = follower.streamId;
        if (streamId === undefined) return;
        streams.delete(streamId);
        liveSocket?.send({ type: 'cancel', streamId });
      };
    },
  };
}
