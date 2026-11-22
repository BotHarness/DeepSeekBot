import type { HostSocket } from '@botharness/host-protocol/carrier';
import {
  isConnectRoute,
  isDeviceRoute,
  isEncryptedRoute,
  isLanRoute,
  socketOrigin,
} from '@botharness/host-protocol/route';
import {
  REMOTE_STREAM_MUX_PATH,
  type ActivityLiveFrame,
  type MuxClientFrame,
  type MuxServerFrame,
  type RosterLiveFrame,
  type RosterResourceChange,
} from '@botharness/host-protocol/wire';
import {
  APP_VERSION_HEADER,
  MIN_HOST_VERSION,
  belowMinimum,
} from '../../core/src/devices/client-compat';
import { listBots } from './bots';
import type {
  ConnectionState,
  HostClient,
  HostClientOptions,
  HostCompatibility,
  HostSnapshot,
  StreamHandlers,
} from './client-contract';
import {
  CredentialRefused,
  MethodRefused,
  Unreachable,
  hostKeyRejected,
  hostLacksMethod,
} from './client-errors';
import { createHostRequests } from './client-requests';
import { createHostResources } from './client-resources';
import { createHostRoster } from './client-roster';
import { createRosterView } from './client-roster-view';
import { createHostSnapshotSharing } from './client-snapshot-sharing';
import { id, record } from './client-wire';
import { readComputerAvailability } from './computer-availability';
import { ConnectRefused, encryptedCarrier } from './encrypted-carrier';
import { learnedRoutes, preferredRoutes } from './learned-routes';
import { DEVICE_PREFIX } from './pairing';

export type {
  ConnectionState,
  RosterBot,
  RosterHuman,
  RosterChannel,
  RosterSection,
  TopOrderEntry,
  RosterArrangement,
  RosterView,
  HostCompatibility,
  HostSnapshot,
  RemoteSource,
  StreamHandlers,
  HostClient,
  HostApiInit,
  HostApiAnswer,
  HostClientOptions,
} from './client-contract';
export { deviceRefusal, MethodRefused, type DeviceRefusal } from './client-errors';
export { REUSE_ON_RECONNECT_MS } from './client-roster';
export { arrangementOf } from './client-roster-view';

interface Follower {
  endpoint: string;
  args: Record<string, unknown>;
  handlers: StreamHandlers;
  streamId?: string | undefined;
  reopen?: ReturnType<typeof setTimeout> | undefined;
}

export const MAX_RECONNECT_DELAY_MS = 30_000;
export const HOST_KEY_REJECTION_LIMIT = 3;
export const STABLE_CONNECTION_MS = 60_000;
export const defaultBackoff = (attempt: number): number =>
  Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** (attempt - 1));

export function createHostClient(options: HostClientOptions): HostClient {
  const carrier = encryptedCarrier({
    raw: options.carrier,
    ...(options.member ? { trustedHttpsOrigins: options.routes } : {}),
    hostId: options.hostId ?? '',
    credential: options.credential,
    ...(options.encryption === undefined ? {} : { encryption: options.encryption }),
  });
  let routes = preferredRoutes(options.routes);
  let routePreference = options.routePreference;
  let changingPreference = false;
  let preferenceRevision = 0;
  let routeChangePending = false;
  const routeChecks = new Map<string, 'verified' | 'unreachable'>();
  const authorization = { authorization: `Device ${options.credential}` };
  const appVersion = options.appVersion ?? options.carrier.appVersion;
  const jsonAuthorization = {
    ...authorization,
    'content-type': 'application/json',
    ...(appVersion === undefined ? {} : { [APP_VERSION_HEADER]: appVersion }),
  };
  let compatibility: HostCompatibility | undefined;
  const setCompatibility = (next: HostCompatibility): void => {
    if (JSON.stringify(next) === JSON.stringify(compatibility ?? {})) return;
    compatibility = next;
    publish();
  };
  let route = routePreference ?? options.routes[0] ?? '';
  const backoff = options.backoff ?? defaultBackoff;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const listeners = new Set<() => void>();
  const liveListeners = new Set<(source: 'roster' | 'activity') => void>();
  const skillListeners = new Set<(channelIds: readonly string[]) => void>();
  const resourceListeners = new Set<
    (resource: string | undefined, change?: RosterResourceChange) => void
  >();
  const resourceChanged = (change?: RosterResourceChange): void => {
    for (const listener of [...resourceListeners]) listener(change?.resource, change);
  };
  const purgeListeners = new Set<(placements: unknown) => void>();
  let snapshot: HostSnapshot = {
    connection: { status: 'stopped', route },
    ...(routePreference === undefined ? {} : { routePreference }),
  };
  let computerAvailable: boolean | undefined;
  let running = false;
  let everConnected = false;
  let attempt = 0;
  let rejections = 0;
  let generation = 0;
  let connectionSequence = 0;
  let socket: HostSocket | undefined;
  let wake: (() => void) | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let disconnectCurrent: ((reason: string) => void) | undefined;
  let activeRequests = 0;
  let resumeRequested = false;
  let cancelResumeProbe: (() => void) | undefined;
  let checkingPreferred = false;
  let preferredSwitchAt = 0;
  const followers = new Set<Follower>();
  let liveSocket: { generation: number; send(frame: MuxClientFrame): void } | undefined;
  let streams = new Map<string, { item(value: unknown): void; end(frame: MuxServerFrame): void }>();

  const { share, shareRoster } = createHostSnapshotSharing();

  const publish = (connection?: ConnectionState): void => {
    const nextRoutes: NonNullable<HostSnapshot['routes']> = routes.map((url) => ({
      url,
      status: routeChecks.get(url) ?? 'unchecked',
    }));
    const roster =
      rosterState.bots === undefined
        ? undefined
        : shareRoster(view(rosterState.bots), snapshot.roster);
    const status = (connection ?? snapshot.connection).status;
    const disruptedSince =
      status === 'connecting' || status === 'reconnecting' || status === 'unreachable'
        ? (snapshot.disruptedSince ?? Date.now())
        : undefined;
    const next: HostSnapshot = {
      ...(routePreference === undefined ? {} : { routePreference }),
      ...(routeChangePending ? { routeChangePending: true } : {}),
      routes:
        snapshot.routes !== undefined &&
        JSON.stringify(nextRoutes) === JSON.stringify(snapshot.routes)
          ? snapshot.routes
          : nextRoutes,
      connection: connection ?? snapshot.connection,
      ...(rosterState.feedRead === undefined ? {} : { feedRead: rosterState.feedRead }),
      ...(disruptedSince === undefined ? {} : { disruptedSince }),
      activity: share('activity', [...rosterState.rawStates.values()]),
      ...(computerAvailable === undefined ? {} : { computerAvailable }),
      ...(compatibility === undefined ? {} : { compatibility }),
      ...(roster === undefined ? {} : { roster }),
    };
    const unchanged =
      connection === undefined &&
      Object.keys(next).length === Object.keys(snapshot).length &&
      (Object.keys(next) as (keyof HostSnapshot)[]).every((key) => next[key] === snapshot[key]);
    if (unchanged) return;
    snapshot = next;
    if (connection !== undefined)
      options.telemetry?.update(
        connection.status,
        'attempt' in connection ? connection.attempt : 0,
        connection.status === 'refused' ? connection.code : 'none',
      );
    for (const listener of listeners) listener();
  };

  const refusedBy = (error: unknown): void => {
    if (error instanceof CredentialRefused && running) {
      running = false;
      generation += 1;
      disconnectCurrent?.(error.message);
      interruptFollowers(error.message);
      clearTimeout(retryTimer);
      rosterState.clearSmoothing();
      wake?.();
      socket?.close();
      socket = undefined;
      carrier.close?.();
      resources.clear();
      options.telemetry?.dispose();
      publish({
        status: 'refused',
        route,
        code: error.code,
        reason: error.message,
      });
    }
  };

  const discoverComputer = async (): Promise<void> => {
    const currentRoute = route;
    const currentGeneration = generation;
    if (isEncryptedRoute(route, options.encryption) && !isLanRoute(route)) {
      computerAvailable = false;
      return;
    }
    try {
      const available = await readComputerAvailability(api, isLanRoute(route));
      if (currentRoute === route && currentGeneration === generation && available !== undefined) {
        computerAvailable = available;
        publish();
      }
    } catch (error) {
      if (currentRoute === route && currentGeneration === generation) refusedBy(error);
    }
  };

  const notifyLive = (source: 'roster' | 'activity'): void => {
    for (const listener of liveListeners) listener(source);
  };

  const pickRoute = async (): Promise<void> => {
    let failure: unknown;
    const revision = preferenceRevision;
    routeChangePending = false;
    resumeRequested = false;
    if (routePreference !== undefined) {
      route = routePreference;
      if (!routes.includes(routePreference))
        throw new Unreachable('The selected route is no longer available.');
    }
    for (const candidate of routePreference === undefined ? routes : [routePreference]) {
      try {
        await listBots(hostVia(candidate));
        if (revision !== preferenceRevision) throw new Unreachable('The route preference changed.');
        routeChecks.set(candidate, 'verified');
        route = candidate;
        routeChangePending = false;
        return;
      } catch (error) {
        if (revision !== preferenceRevision) throw error;
        routeChecks.set(candidate, 'unreachable');
        if (
          isConnectRoute(candidate) ||
          error instanceof ConnectRefused ||
          error instanceof CredentialRefused ||
          error instanceof MethodRefused
        )
          throw error;
        failure = error;
      }
    }
    throw failure instanceof Error ? failure : new Unreachable('The Host could not be reached.');
  };

  let learningRoutes = false;
  const discoverRoutes = async (): Promise<void> => {
    if (!options.hostId || learningRoutes) return;
    learningRoutes = true;
    const current = generation;
    try {
      const answer = await api('/api/botharness/devices');
      if (answer.status !== 200 || !running || current !== generation) return;
      const next = learnedRoutes(
        {
          hostId: options.hostId,
          routes,
          ...(options.encryption ? { encryption: options.encryption } : {}),
        },
        answer.body,
      );
      if (JSON.stringify(next) === JSON.stringify(routes)) return;
      await options.onRoutesChanged?.(next);
      if (!running || current !== generation) return;
      routes = next;
      publish();
    } catch (error) {
      refusedBy(error);
    } finally {
      learningRoutes = false;
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
          follower.handlers.refused({
            code: frame.error.code,
            message: frame.error.message,
          });
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
    cancelResumeProbe?.();
    for (const follower of followers) {
      clearTimeout(follower.reopen);
      if (follower.streamId === undefined) continue;
      follower.streamId = undefined;
      follower.handlers.interrupted(reason);
    }
  };

  const connectOnce = async (current: number): Promise<void> => {
    const sequence = ++connectionSequence;
    await pickRoute();
    if (!running || current !== generation) return;
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
    const disconnect = (reason: string): void => {
      interruptFollowers(reason);
      socket?.close();
      carrier.close?.();
      resolveClosed(reason);
    };
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
      const frame: MuxClientFrame = {
        type: 'open',
        streamId,
        endpoint,
        payload: { args: {} },
      };
      socket?.send(JSON.stringify(frame));
    };
    socket = carrier.openSocket(
      socketOrigin(route) + DEVICE_PREFIX + REMOTE_STREAM_MUX_PATH,
      {
        open: () => {
          if (current !== generation || sequence !== connectionSequence) return;
          opened = true;
          const carrier = socket;
          liveSocket = {
            generation: current,
            send: (frame) => carrier?.send(JSON.stringify(frame)),
          };
          follow('botharness/followRoster', (value) => {
            const frame = value as RosterLiveFrame;
            if (frame.type === 'baseline' || frame.type === 'purged') {
              options.onPurged?.(frame.placements);
              for (const listener of purgeListeners) listener(frame.placements);
            }
            if (frame.type === 'baseline') {
              baselines.roster = true;
              resourceChanged(undefined);
              if (baselines.activity) resolveReady();
            } else {
              applyRoster(frame);
              if (frame.type !== 'resource') notifyLive('roster');
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
          if (current !== generation || sequence !== connectionSequence) return;
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
          if (current === generation && sequence === connectionSequence)
            interruptFollowers(reason || 'The live connection closed.');
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
      if (!opened) await listBots(host);
      throw error;
    } finally {
      clearTimeout(deadline);
    }
    rosterState.reuseOnNextReload();
    pingAvailable = true;
    setCompatibility({});
    void readCompatibility().catch(() => undefined);
    await reload();
    if (current !== generation) return;
    const stable = setTimeout(() => {
      attempt = 0;
    }, STABLE_CONNECTION_MS);
    everConnected = true;
    rejections = 0;
    disconnectCurrent = disconnect;
    publish({ status: 'connected', route });
    if (routeChangePending) resumeLive();
    const health = setInterval(() => {
      void discoverRoutes();
      void refreshConnected(probeHost).catch(() => undefined);
    }, 20_000);
    try {
      await closed;
    } finally {
      clearTimeout(stable);
      clearInterval(health);
      if (disconnectCurrent === disconnect) disconnectCurrent = undefined;
    }
  };

  let pingAvailable = true;
  const readCompatibility = async (): Promise<unknown> => {
    const current = generation;
    const sequence = connectionSequence;
    const currentRoute = route;
    const currentSocket = liveSocket;
    const isCurrent = () =>
      currentSocket !== undefined &&
      currentSocket === liveSocket &&
      running &&
      current === generation &&
      sequence === connectionSequence &&
      currentRoute === route;
    try {
      const answer = record(await call<unknown>('ping'));
      if (!isCurrent()) return undefined;
      const version = typeof answer['version'] === 'string' ? answer['version'] : undefined;
      const minAppVersion = answer['minAppVersion'];
      setCompatibility({
        ...(version === undefined ? {} : { hostVersion: version }),
        ...(version !== undefined && belowMinimum(version, MIN_HOST_VERSION)
          ? { update: 'host' as const }
          : typeof minAppVersion === 'string' && belowMinimum(appVersion, minAppVersion)
            ? { update: 'app' as const }
            : {}),
      });
      return answer;
    } catch (error) {
      if (
        !hostLacksMethod(error) &&
        !(error instanceof MethodRefused && error.code === 'gateway/method-not-found')
      )
        throw error;
      if (!isCurrent()) return undefined;
      pingAvailable = false;
      setCompatibility({ update: 'host' });
      return undefined;
    }
  };
  const probeHost = async (): Promise<unknown> => {
    if (pingAvailable) {
      const answer = await readCompatibility();
      if (pingAvailable) return answer;
    }
    return listBots(host);
  };
  const refreshConnected = async (read: () => Promise<unknown> = reload): Promise<void> => {
    const disconnect = disconnectCurrent;
    try {
      await read();
      await recoverPreferred();
    } catch (error) {
      if (running && disconnect !== undefined && disconnect === disconnectCurrent) {
        refusedBy(error);
        if (running && error instanceof Unreachable) {
          const reason = error instanceof Error ? error.message : 'The Host could not be reached.';
          publish({
            status: 'unreachable',
            route,
            attempt: Math.max(1, attempt),
            reason,
          });
          disconnect(reason);
        }
      }
      throw error;
    }
  };

  const recoverPreferred = async (): Promise<void> => {
    if (
      routePreference !== undefined ||
      routeChangePending ||
      checkingPreferred ||
      activeRequests > 0 ||
      Date.now() - preferredSwitchAt < 60_000
    )
      return;
    const revision = preferenceRevision;
    const previous = route;
    const disconnect = disconnectCurrent;
    const current = generation;
    checkingPreferred = true;
    try {
      for (const candidate of routes.slice(0, routes.indexOf(previous))) {
        try {
          await listBots(hostVia(candidate));
          routeChecks.set(candidate, 'verified');
        } catch {
          routeChecks.set(candidate, 'unreachable');
          continue;
        }
        if (
          !running ||
          revision !== preferenceRevision ||
          current !== generation ||
          route !== previous ||
          disconnect !== disconnectCurrent ||
          activeRequests > 0
        )
          return;
        preferredSwitchAt = Date.now();
        disconnect?.('A preferred connection is available.');
        return;
      }
    } finally {
      checkingPreferred = false;
    }
  };

  const loop = async (current: number): Promise<void> => {
    while (running && current === generation) {
      let retryDelay: number | undefined;
      try {
        await connectOnce(current);
        if (!running || current !== generation) return;
        attempt += 1;
        publish({ status: 'reconnecting', route, attempt });
      } catch (error) {
        if (!running || current !== generation) return;
        socket?.close();
        if (error instanceof CredentialRefused) {
          refusedBy(error);
          return;
        }
        rejections = hostKeyRejected(error) ? rejections + 1 : 0;
        if (rejections >= HOST_KEY_REJECTION_LIMIT) {
          refusedBy(new CredentialRefused('host-key-changed'));
          return;
        }
        attempt += 1;
        retryDelay = backoff(attempt);
        publish({
          status: 'unreachable',
          route,
          attempt,
          reason: error instanceof Error ? error.message : 'The Host could not be reached.',
          retryDelay,
        });
      }
      if (resumeRequested) {
        resumeRequested = false;
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
        retryTimer = setTimeout(resolve, retryDelay ?? backoff(attempt));
      });
      wake = undefined;
    }
  };

  const probeResume = (): void => {
    if (cancelResumeProbe !== undefined) return;
    const currentSocket = liveSocket;
    const current = generation;
    if (currentSocket === undefined) {
      resumeRequested = true;
      resumeLive();
      return;
    }
    const streamId = id();
    const currentStreams = streams;
    const finish = (healthy: boolean): void => {
      if (cancelResumeProbe !== cancel) return;
      cancelResumeProbe = undefined;
      clearTimeout(timer);
      currentStreams.delete(streamId);
      if (currentSocket === liveSocket) {
        try {
          currentSocket.send({ type: 'cancel', streamId });
        } catch {}
      }
      if (healthy && running && currentSocket === liveSocket) {
        options.telemetry?.update('connected');
        void probeHost()
          .then(async () => {
            if (!running || currentSocket !== liveSocket) return;
            await reload();
            if (running && currentSocket === liveSocket) await recoverPreferred();
          })
          .catch((error: unknown) => {
            if (!running || currentSocket !== liveSocket || current !== generation) return;
            refusedBy(error);
            if (running && error instanceof Unreachable) {
              resumeRequested = true;
              resumeLive();
            }
          });
      }
      if (!healthy && running && current === generation && currentSocket === liveSocket) {
        resumeRequested = true;
        resumeLive();
      }
    };
    const cancel = () => finish(false);
    const timer = setTimeout(cancel, Math.min(timeoutMs, 1_500));
    cancelResumeProbe = cancel;
    currentStreams.set(streamId, {
      item: (value) => {
        if (record(value)['type'] === 'baseline') finish(true);
      },
      end: () => finish(false),
    });
    try {
      currentSocket.send({
        type: 'open',
        streamId,
        endpoint: 'botharness/followRoster',
        payload: { args: {} },
      });
    } catch {
      finish(false);
    }
  };

  const resumeLive = (): void => {
    if (
      !resumeRequested ||
      !running ||
      activeRequests > 0 ||
      snapshot.connection.status !== 'connected'
    )
      return;
    const disconnect = disconnectCurrent;
    disconnectCurrent = undefined;
    publish({ status: 'reconnecting', route, attempt: Math.max(attempt, 1) });
    disconnect?.('resuming');
  };

  const connection = {
    get route() {
      return route;
    },
    get running() {
      return running;
    },
  };
  const { withDeadline, call, hostVia, host, upload, api } = createHostRequests(
    options,
    carrier,
    authorization,
    jsonAuthorization,
    timeoutMs,
    connection,
  );
  const resources = createHostResources(
    options,
    carrier,
    authorization,
    timeoutMs,
    connection,
    publish,
  );
  const rosterState = createHostRoster({
    options,
    host,
    call,
    carrier,
    jsonAuthorization,
    withDeadline,
    connection,
    publish,
    discoverComputer,
    discoverRoutes,
    skillListeners,
    resourceChanged,
  });
  const { reload, paintStoredChannels, applyActivity, applyRoster } = rosterState;
  const view = createRosterView(options, resources.avatar, {
    get route() {
      return route;
    },
    get channels() {
      return rosterState.channels;
    },
    get states() {
      return rosterState.states;
    },
    get arrangement() {
      return rosterState.arrangement;
    },
    get sorting() {
      return rosterState.sorting;
    },
  });

  return {
    async setRoutePreference(next) {
      if (changingPreference) throw new Error('connection-preference-busy');
      if (next !== undefined && !routes.includes(next)) throw new Error('connection-route-unknown');
      if (next === routePreference) return;
      changingPreference = true;
      try {
        await options.onRoutePreferenceChanged?.(next);
        routePreference = next;
        preferenceRevision++;
        routeChangePending = running;
        preferredSwitchAt = Date.now();
        publish();
        if (running) {
          resumeRequested = true;
          resumeLive();
          clearTimeout(retryTimer);
          wake?.();
        }
      } finally {
        changingPreference = false;
      }
    },
    updateRoutes(next, encryption, saved) {
      if (encryption) {
        const current = options.encryption;
        if (
          !current ||
          current.hostKey !== encryption.hostKey ||
          current.deviceKey !== encryption.deviceKey
        )
          throw new Error('host-key-mismatch');
        if (encryption.privateRelay) current.privateRelay = encryption.privateRelay;
        else delete current.privateRelay;
        if (encryption.loopback) current.loopback = encryption.loopback;
        else delete current.loopback;
      }
      const previous = routes;
      routes = preferredRoutes(next);
      const preferenceChanged = saved !== undefined && saved.routePreference !== routePreference;
      if (preferenceChanged) {
        routePreference = saved.routePreference;
        preferenceRevision++;
        routeChangePending = running;
        preferredSwitchAt = Date.now();
      }
      publish();
      if (running && preferenceChanged) {
        resumeRequested = true;
        resumeLive();
        clearTimeout(retryTimer);
        wake?.();
      } else if (
        running &&
        snapshot.connection.status !== 'connected' &&
        routes.some((candidate) => !previous.includes(candidate))
      ) {
        clearTimeout(retryTimer);
        wake?.();
      }
    },
    async testRoute(url) {
      if (!routes.includes(url)) return false;
      try {
        await listBots(hostVia(url));
        routeChecks.set(url, 'verified');
        publish();
        return true;
      } catch {
        routeChecks.set(url, 'unreachable');
        publish();
        return false;
      }
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (running) return;
      running = true;
      resumeRequested = false;
      generation += 1;
      publish(
        everConnected
          ? { status: 'reconnecting', route, attempt: Math.max(attempt, 1) }
          : { status: 'connecting', route },
      );
      void paintStoredChannels();
      void loop(generation);
    },
    stop() {
      running = false;
      resumeRequested = false;
      disconnectCurrent?.('stopped');
      interruptFollowers('stopped');
      generation += 1;
      clearTimeout(retryTimer);
      rosterState.clearSmoothing();
      wake?.();
      socket?.close();
      socket = undefined;
      carrier.close?.();
      resources.clear();
      publish({ status: 'stopped', route });
      options.telemetry?.dispose();
    },
    retryNow(trigger = 'manual_retry', retryOptions) {
      if (!running) return;
      if (
        trigger === 'resume' &&
        retryOptions?.preserveConnected === true &&
        snapshot.connection.status === 'connected'
      ) {
        resumeRequested = false;
        return;
      }
      if (trigger === 'manual_retry') {
        rosterState.clearFetchedSorting();
      }
      options.telemetry?.begin(trigger);
      if (snapshot.connection.status === 'connected') {
        if (trigger === 'resume') {
          probeResume();
          return;
        }
        void refreshConnected().then(
          () => {
            if (running && snapshot.connection.status === 'connected')
              options.telemetry?.update('connected');
          },
          () => {},
        );
      }
      clearTimeout(retryTimer);
      wake?.();
    },
    async refresh() {
      if (snapshot.connection.status === 'connected') await refreshConnected();
      else this.retryNow();
    },
    async call<T>(method: string, args: Record<string, unknown> = {}) {
      activeRequests += 1;
      try {
        return await call<T>(method, args);
      } catch (error) {
        refusedBy(error);
        throw error;
      } finally {
        activeRequests -= 1;
        resumeLive();
      }
    },
    async api(path, init) {
      activeRequests += 1;
      try {
        return await api(path, init);
      } catch (error) {
        refusedBy(error);
        throw error;
      } finally {
        activeRequests -= 1;
        resumeLive();
      }
    },
    async upload(name, data) {
      activeRequests += 1;
      try {
        return await upload(name, data);
      } catch (error) {
        refusedBy(error);
        throw error;
      } finally {
        activeRequests -= 1;
        resumeLive();
      }
    },
    resource: resources.resource,
    secretInputAllowed: () =>
      isDeviceRoute(route, options.encryption) &&
      (!isEncryptedRoute(route, options.encryption) || options.encryption !== undefined),
    onLive(listener) {
      liveListeners.add(listener);
      return () => liveListeners.delete(listener);
    },
    onPurged(listener) {
      purgeListeners.add(listener);
      return () => purgeListeners.delete(listener);
    },
    onSkills(listener) {
      skillListeners.add(listener);
      return () => skillListeners.delete(listener);
    },
    onResource(listener) {
      resourceListeners.add(listener);
      return () => resourceListeners.delete(listener);
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
