import type { HostCarrier } from '@botharness/host-protocol/carrier';
import type {
  ActivityLiveFrame,
  ChannelListItem,
  PersonaBotSummary,
  RosterLiveFrame,
  RosterResourceChange,
  WireBotActivity,
} from '@botharness/host-protocol/wire';
import { listBots } from './bots';
import { readChannels } from './channel-management';
import { loadChannelChangeCursor } from './channel-messages';
import {
  readChannelList,
  readListBots,
  saveListBots,
  syncChannelList,
  type ChannelListChanges,
} from './channel-list-store';
import type {
  HostClient,
  HostClientOptions,
  HostSnapshot,
  RosterArrangement,
} from './client-contract';
import { CredentialRefused, MethodRefused, Unreachable, hostLacksMethod } from './client-errors';
import { arrangementOf } from './client-roster-view';
import { record } from './client-wire';
import type { HostCall } from './host-answer';
import type { LocalStore } from './local-store';
import { DEVICE_PREFIX } from './pairing';
import { readRoster } from './roster-readers';
import { readRosterSorting, type RosterSorting } from './roster-sorting';
import { ActivitySmoother } from './shared/activity-smoothing';

export const REUSE_ON_RECONNECT_MS = 600_000;

export function createHostRoster({
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
}: {
  options: HostClientOptions;
  host: HostCall;
  call: HostClient['call'];
  carrier: HostCarrier;
  jsonAuthorization: Record<string, string>;
  withDeadline: <T>(work: (signal: AbortSignal) => Promise<T>, ms?: number) => Promise<T>;
  connection: { readonly route: string; readonly running: boolean };
  publish: () => void;
  discoverComputer: () => Promise<void>;
  discoverRoutes: () => Promise<void>;
  skillListeners: ReadonlySet<(channelIds: readonly string[]) => void>;
  resourceChanged: (change?: RosterResourceChange) => void;
}) {
  let bots: PersonaBotSummary[] | undefined;
  let channels = new Map<string, ChannelListItem>();
  let channelsLoaded = false;
  let feedRead: HostSnapshot['feedRead'];
  let feedAcknowledging = false;
  let savedBots: string | undefined;
  let states = new Map<string, WireBotActivity>();
  let rawStates = new Map<string, WireBotActivity>();
  const smoother = new ActivitySmoother<WireBotActivity>();
  let settle: ReturnType<typeof setTimeout> | undefined;
  let arrangement: RosterArrangement | undefined;
  let sorting: RosterSorting | undefined;
  let reuseNextPass = false;
  let fetchedArrangement: { value: RosterArrangement | undefined; at: number } | undefined;
  let fetchedSorting: { value: RosterSorting | undefined; at: number } | undefined;
  let reloading: Promise<void> | undefined;
  let reloadAgain = false;

  const reloadInBackground = (): void => {
    reload().catch(() => {});
  };

  const fullChannelList = (): Promise<ChannelListItem[]> => readChannels({ call });

  const unlessRefused = <T>(work: Promise<T>): Promise<T | undefined> =>
    work.catch((error: unknown) => {
      if (error instanceof MethodRefused || hostLacksMethod(error)) return undefined;
      throw error;
    });

  const openLocalStore = (): Promise<LocalStore | undefined> =>
    options.localStore?.().catch(() => undefined) ?? Promise.resolve(undefined);

  const loadChannels = async (): Promise<ChannelListItem[]> => {
    const store = await openLocalStore();
    if (store === undefined) return fullChannelList();
    try {
      return await syncChannelList(store, {
        channels: fullChannelList,
        cursor: () => unlessRefused(loadChannelChangeCursor({ call })),
        changes: (cursor) =>
          unlessRefused(
            call<ChannelListChanges>('channelListChanges', {
              sinceSeq: cursor.seq,
              epoch: cursor.epoch,
            }),
          ),
      });
    } catch (error) {
      if (
        (error instanceof Unreachable && !hostLacksMethod(error)) ||
        error instanceof MethodRefused ||
        error instanceof CredentialRefused
      )
        throw error;
      return fullChannelList();
    }
  };

  const paintStoredChannels = async (): Promise<void> => {
    const store = await openLocalStore();
    if (store === undefined || channelsLoaded) return;
    const [stored, storedBots] = await Promise.all([
      readChannelList(store),
      readListBots<PersonaBotSummary>(store),
    ]).catch(() => [undefined, undefined] as const);
    if (stored === undefined || storedBots === undefined || channelsLoaded) return;
    savedBots = JSON.stringify(storedBots);
    bots = storedBots;
    channels = new Map(stored.channels.map((channel) => [channel.id, channel]));
    publish();
  };

  const keepBots = (list: PersonaBotSummary[]): void => {
    const json = JSON.stringify(list);
    if (json === savedBots) return;
    void openLocalStore()
      .then(async (store) => {
        if (store === undefined) return;
        await saveListBots(store, list);
        savedBots = json;
      })
      .catch(() => undefined);
  };

  const reusable = <T>(
    reuse: boolean,
    fetched: { value: T; at: number } | undefined,
  ): fetched is { value: T; at: number } =>
    reuse && fetched !== undefined && Date.now() - fetched.at < REUSE_ON_RECONNECT_MS;

  const readArrangement = (): Promise<RosterArrangement | undefined> => {
    fetchedArrangement = undefined;
    return readRoster(host)
      .then(arrangementOf, (error: unknown) => {
        if (error instanceof MethodRefused || hostLacksMethod(error)) return undefined;
        throw error;
      })
      .then((value) => {
        fetchedArrangement = { value, at: Date.now() };
        return value;
      });
  };

  const readSorting = (): Promise<RosterSorting | undefined> => {
    fetchedSorting = undefined;
    return readRosterSorting(host)
      .catch((error: unknown) => {
        if (error instanceof MethodRefused || hostLacksMethod(error)) return undefined;
        throw error;
      })
      .then((value) => {
        fetchedSorting = { value, at: Date.now() };
        return value;
      });
  };

  const acknowledgeFeed = (): void => {
    if (
      !connection.running ||
      feedRead === 'acknowledged' ||
      feedRead === 'unsupported' ||
      feedAcknowledging
    )
      return;
    feedAcknowledging = true;
    void withDeadline(async (signal) => {
      const response = await carrier.request(`${connection.route}${DEVICE_PREFIX}/feed-read`, {
        method: 'POST',
        headers: jsonAuthorization,
        body: '{}',
        signal,
      });
      if (response.status === 404) feedRead = 'unsupported';
      else if (
        response.status === 200 &&
        typeof record(JSON.parse(await response.text()))['feedReadAt'] === 'string'
      )
        feedRead = 'acknowledged';
      else feedRead = 'unconfirmed';
    })
      .catch(() => {
        feedRead = 'unconfirmed';
      })
      .finally(() => {
        feedAcknowledging = false;
        if (connection.running) publish();
      });
  };

  const reloadOnce = async (reuse: boolean): Promise<void> => {
    void discoverComputer();
    void discoverRoutes();
    const [list, channelList, rosterArrangement, rosterSorting] = await Promise.all([
      listBots(host),
      loadChannels(),
      reusable(reuse, fetchedArrangement) ? fetchedArrangement.value : readArrangement(),
      reusable(reuse, fetchedSorting) ? fetchedSorting.value : readSorting(),
    ]);
    bots = list;
    channels = new Map(channelList.map((channel) => [channel.id, channel]));
    channelsLoaded = true;
    keepBots(list);
    arrangement = rosterArrangement;
    sorting = rosterSorting;
    publish();
    acknowledgeFeed();
  };

  const reload = (): Promise<void> => {
    if (reloading !== undefined) {
      reloadAgain = true;
      return reloading;
    }
    reloading = (async () => {
      try {
        do {
          const reuse = reuseNextPass;
          reuseNextPass = false;
          reloadAgain = false;
          await reloadOnce(reuse);
        } while (reloadAgain);
      } finally {
        reloading = undefined;
      }
    })();
    return reloading;
  };

  const smooth = (): void => {
    clearTimeout(settle);
    settle = undefined;
    const now = Date.now();
    const { shown, wake } = smoother.step(rawStates, now);
    states = shown;
    if (wake !== undefined)
      settle = setTimeout(() => {
        settle = undefined;
        smooth();
        publish();
      }, wake - now);
  };

  const applyActivity = (frame: ActivityLiveFrame): void => {
    rawStates = new Map(frame.snapshot.bots.map((bot) => [bot.slug, bot]));
    smooth();
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
      channels.set(frame.channelId, {
        ...channel,
        latestMessage: frame.message,
      });
      publish();
    } else if (frame.type === 'skills') {
      for (const listener of skillListeners) listener(frame.change.channelIds);
    } else if (frame.type === 'resource') {
      resourceChanged(frame.change);
    } else if (frame.type === 'changed' || frame.type === 'purged') {
      reloadInBackground();
    }
  };

  return {
    get bots() {
      return bots;
    },
    get channels() {
      return channels;
    },
    get states() {
      return states;
    },
    get rawStates() {
      return rawStates;
    },
    get feedRead() {
      return feedRead;
    },
    get arrangement() {
      return arrangement;
    },
    get sorting() {
      return sorting;
    },
    paintStoredChannels,
    reload,
    applyActivity,
    applyRoster,
    reuseOnNextReload() {
      if (reloading === undefined) reuseNextPass = true;
    },
    clearSmoothing() {
      clearTimeout(settle);
      settle = undefined;
    },
    clearFetchedSorting() {
      fetchedArrangement = undefined;
      fetchedSorting = undefined;
    },
  };
}
