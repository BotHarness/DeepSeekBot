import type { BotPrimaryColor } from '../../../../packages/core/src/bots/primary-color';
import type { HostCarrier, HostSocket } from './carrier';
import { socketOrigin } from './route';
import {
  REMOTE_STREAM_MUX_PATH,
  type ActivityLiveFrame,
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
  | { status: 'refused'; route: string; reason: string }
  | { status: 'stopped'; route: string };

export interface RosterBot {
  slug: string;
  displayName: string;
  avatarUrl?: string;
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
  onLive(listener: (source: 'roster' | 'activity') => void): () => void;
  follow(endpoint: string, args: Record<string, unknown>, handlers: StreamHandlers): () => void;
}

export interface HostClientOptions {
  route: string;
  token: string;
  carrier: HostCarrier;
  backoff?: (attempt: number) => number;
  timeoutMs?: number;
}

class CredentialRefused extends Error {
  constructor(readonly stage: 'login' | 'session') {
    super(
      stage === 'login'
        ? 'The Host refused this launch token. Pair again or paste a fresh token.'
        : 'The Host refused this session.',
    );
  }
}

class Unreachable extends Error {}

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
  const route = options.route;
  const backoff = options.backoff ?? defaultBackoff;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const listeners = new Set<() => void>();
  const liveListeners = new Set<(source: 'roster' | 'activity') => void>();
  let snapshot: HostSnapshot = { connection: { status: 'stopped', route } };
  let bots: PersonaBotSummary[] | undefined;
  let channels = new Map<string, ChannelListItem>();
  let states = new Map<string, AggregatedState>();
  let session = false;
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
            ...(bot.avatar === undefined ? {} : { avatarUrl: absolute(bot.avatar) }),
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

  const absolute = (path: string): string => (path.startsWith('/') ? route + path : path);

  const reloadInBackground = (): void => {
    reload().catch(() => {});
  };

  const withDeadline = async <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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

  const login = (): Promise<void> =>
    withDeadline(async (signal) => {
      const url = `${route}/?token=${encodeURIComponent(options.token)}`;
      const response = await options.carrier.request(url, { method: 'GET', signal });
      if (response.status === 401 || response.status === 403) throw new CredentialRefused('login');
      if (response.status >= 400) throw new Unreachable(`The Host answered ${response.status}.`);
      session = true;
    });

  const call = <T>(method: string, args: Record<string, unknown> = {}): Promise<T> =>
    withDeadline(async (signal) => {
      const name = `botharness/${method}`;
      const request: ClientRequest = {
        type: 'client-request',
        rpcId: id(),
        method: name,
        payload: { args },
      };
      const response = await options.carrier.request(`${route}/api/${name}`, {
        method: 'POST',
        body: JSON.stringify(request),
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        session = false;
        throw new CredentialRefused('session');
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
    if (!session) await login();
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
    socket = options.carrier.openSocket(socketOrigin(route) + REMOTE_STREAM_MUX_PATH, {
      open: () => {
        if (current !== generation) return;
        opened = true;
        const carrier = socket;
        liveSocket = { generation: current, send: (frame) => carrier?.send(JSON.stringify(frame)) };
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
    });
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
    let reloggedIn = false;
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
          if (error.stage === 'session' && !reloggedIn) {
            reloggedIn = true;
            continue;
          }
          running = false;
          publish({ status: 'refused', route, reason: error.message });
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
      reloggedIn = false;
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
        if (!(error instanceof CredentialRefused) || error.stage !== 'session') throw error;
        await login();
        return await call<T>(method, args);
      }
    },
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
