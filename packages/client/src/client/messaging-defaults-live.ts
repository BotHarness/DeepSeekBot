import type { PurgedPlacement } from '../../../core/src/purge/contracts.js';
import { parseContentRedactions } from './content-redactions.js';

const listeners = new Set<() => void>();
const attentionListeners = new Map<() => void, (healthy: boolean) => void>();
let rosterHealthy = false;
const attentionHealth = (healthy: boolean): void => {
  rosterHealthy = healthy;
  for (const health of attentionListeners.values()) health(healthy);
};
const attentionChanged = (): void => {
  for (const changed of attentionListeners.keys()) changed();
};
const purgeListeners = new Set<(placements: PurgedPlacement[]) => void>();
const latestListeners = new Set<(value: unknown) => void>();
const redactions = new Map<string, PurgedPlacement>();
export type LiveSource = Pick<EventTarget, 'addEventListener'> & {
  readonly readyState: number;
  close(): void;
};
export interface TypedLive {
  roster(handlers: {
    baseline(placements: PurgedPlacement[]): void;
    changed(): void;
    attention?(): void;
    latest(value: unknown): void;
    purged(placements: PurgedPlacement[]): void;
    interrupted(): void;
  }): () => void;
  activity(handlers: { snapshot(data: string): void; interrupted(): void }): () => void;
}
let typed: TypedLive | undefined;
let stopRoster: (() => void) | undefined;
let stopActivity: (() => void) | undefined;
let source: LiveSource | undefined;
let sourceUrl: string | undefined;
let activityBaseline: string | undefined;
const consumers = new Set<SharedSource>();
let channelConsumer: SharedSource | undefined;
export type ActivityEventSource = Pick<EventTarget, 'addEventListener'> & {
  readonly readyState: number;
  close(): void;
};
export type ChannelEventSource = ActivityEventSource & {
  onerror: ((event: Event) => void) | null;
};

function publishActivity(type: string, data?: string, errorState?: number): void {
  for (const consumer of [...consumers])
    if (consumer.channelUrl === undefined) consumer.publish(type, data, errorState);
}

function recordPurged(placements: PurgedPlacement[]): void {
  for (const placement of placements)
    redactions.set(JSON.stringify([placement.channelId, placement.messageId]), placement);
  for (let offset = 0; offset < placements.length; offset += 100)
    for (const callback of [...purgeListeners]) callback(placements.slice(offset, offset + 100));
}

function publishLatest(value: unknown): void {
  for (const callback of [...latestListeners]) callback(value);
}

function syncTyped(): void {
  if (typed === undefined) return;
  if ((listeners.size || attentionListeners.size) && stopRoster === undefined)
    stopRoster = typed.roster({
      baseline(placements) {
        redactions.clear();
        recordPurged(placements);
        notify();
        attentionHealth(true);
        attentionChanged();
      },
      changed: () => {
        notify();
        attentionChanged();
      },
      attention: attentionChanged,
      latest: publishLatest,
      purged: recordPurged,
      interrupted: () => attentionHealth(false),
    });
  else if (!listeners.size && !attentionListeners.size && stopRoster !== undefined) {
    stopRoster();
    stopRoster = undefined;
    rosterHealthy = false;
    redactions.clear();
  }
  const wanted = [...consumers].some((consumer) => consumer.channelUrl === undefined);
  if (wanted && stopActivity === undefined)
    stopActivity = typed.activity({
      snapshot(data) {
        activityBaseline = data;
        publishActivity('activity/snapshot', data);
      },
      interrupted() {
        activityBaseline = undefined;
        publishActivity('error', undefined, 0);
      },
    });
  else if (!wanted && stopActivity !== undefined) {
    stopActivity();
    stopActivity = undefined;
    activityBaseline = undefined;
  }
}

function releaseUnusedSource(): void {
  syncTyped();
  if (
    typed === undefined
      ? listeners.size || attentionListeners.size || consumers.size
      : channelConsumer !== undefined
  )
    return;
  source?.close();
  source = undefined;
  sourceUrl = undefined;
  if (typed !== undefined) return;
  activityBaseline = undefined;
  rosterHealthy = false;
  redactions.clear();
}

class SharedSource extends EventTarget implements ActivityEventSource {
  private closed = false;
  private errorState: number | undefined;
  onerror: ((event: Event) => void) | null = null;
  constructor(readonly channelUrl?: string) {
    super();
  }
  get readyState(): number {
    if (this.closed) return 2;
    if (this.errorState !== undefined) return this.errorState;
    if (typed !== undefined && this.channelUrl === undefined)
      return activityBaseline === undefined ? 0 : 1;
    return source?.readyState ?? 2;
  }
  publish(type: string, data?: string, errorState?: number): void {
    if (this.closed) return;
    this.errorState = errorState;
    try {
      const event = data === undefined ? new Event(type) : new MessageEvent(type, { data });
      this.dispatchEvent(event);
      if (type === 'error') this.onerror?.(event);
    } finally {
      this.errorState = undefined;
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    consumers.delete(this);
    if (channelConsumer === this) channelConsumer = undefined;
    releaseUnusedSource();
    if (listeners.size || attentionListeners.size || consumers.size) {
      try {
        ensureSource();
      } catch {
        console.warn('botharness: live transport replacement refused');
      }
    }
  }
}

function ensureSource(): void {
  if (typed !== undefined) {
    syncTyped();
    if (channelConsumer === undefined) {
      releaseUnusedSource();
      return;
    }
  }
  if (typeof EventSource === 'undefined') return;
  const shared = typed === undefined ? '&roster=1&activity=1' : '';
  const url =
    channelConsumer?.channelUrl === undefined
      ? './api/botharness/stream?scope=roster&activity=1'
      : channelConsumer.channelUrl + shared;
  if (source && sourceUrl === url) return;
  const next: LiveSource = new EventSource(url);
  source?.close();
  source = undefined;
  sourceUrl = undefined;
  activityBaseline = undefined;
  source = next;
  sourceUrl = url;
  attentionHealth(false);
  next.addEventListener('roster/changed', () => {
    if (source === next) notify();
  });
  next.addEventListener('open', () => {
    if (source === next) {
      notify();
      attentionHealth(true);
      attentionChanged();
    }
  });
  next.addEventListener('human-attention/changed', () => {
    if (source === next) attentionChanged();
  });
  next.addEventListener('roster/latest', (event) => {
    if (source !== next || !(event instanceof MessageEvent) || typeof event.data !== 'string')
      return;
    try {
      publishLatest(JSON.parse(event.data));
    } catch {}
  });
  next.addEventListener('content/purged', (event) => {
    if (source !== next) return;
    const placements = parseContentRedactions(event);
    for (const placement of placements)
      redactions.set(JSON.stringify([placement.channelId, placement.messageId]), placement);
    for (const callback of [...purgeListeners]) callback(placements);
  });
  next.addEventListener('activity/snapshot', (event) => {
    if (source !== next || !(event instanceof MessageEvent) || typeof event.data !== 'string')
      return;
    activityBaseline = event.data;
    for (const consumer of [...consumers])
      if (consumer.channelUrl === undefined) consumer.publish('activity/snapshot', event.data);
  });
  for (const type of [
    'channel/message',
    'channel/admission',
    'channel/human-read',
    'channel/reaction',
    'channel/draft-baseline',
    'channel/draft',
    'channel/draft-settled',
    'channel/draft-abandoned',
  ]) {
    next.addEventListener(type, (event) => {
      if (source !== next || !(event instanceof MessageEvent) || typeof event.data !== 'string')
        return;
      channelConsumer?.publish(type, event.data);
    });
  }
  next.addEventListener('error', () => {
    if (source !== next) return;
    attentionHealth(false);
    activityBaseline = undefined;
    if (next.readyState === 2) {
      source = undefined;
      sourceUrl = undefined;
    }
    for (const consumer of [...consumers]) consumer.publish('error', undefined, next.readyState);
  });
  queueMicrotask(() => {
    if (source !== next || activityBaseline !== undefined) return;
    for (const consumer of [...consumers])
      if (consumer.channelUrl === undefined) consumer.publish('error', undefined, 0);
  });
}

export function installTypedLive(next: TypedLive): () => void {
  const swap = (value: TypedLive | undefined): void => {
    stopRoster?.();
    stopRoster = undefined;
    stopActivity?.();
    stopActivity = undefined;
    typed = value;
    attentionHealth(false);
    activityBaseline = undefined;
    sourceUrl = undefined;
    if (listeners.size || attentionListeners.size || consumers.size) ensureSource();
    else releaseUnusedSource();
    for (const consumer of [...consumers]) consumer.publish('error', undefined, 0);
  };
  swap(next);
  return () => {
    if (typed === next) swap(undefined);
  };
}

export function openSharedChannel(url: string): ChannelEventSource {
  if (channelConsumer !== undefined) throw new Error('A document already owns a live Channel');
  const query = new URL(url, 'http://localhost').searchParams;
  const consumer = new SharedSource('./api/botharness/stream?' + query.toString());
  consumers.add(consumer);
  channelConsumer = consumer;
  try {
    ensureSource();
  } catch (error) {
    consumers.delete(consumer);
    channelConsumer = undefined;
    releaseUnusedSource();
    throw error;
  }
  return consumer;
}

export function openRosterActivity(): ActivityEventSource | undefined {
  if (typed === undefined && typeof EventSource === 'undefined') return undefined;
  const consumer = new SharedSource();
  consumers.add(consumer);
  try {
    ensureSource();
  } catch (error) {
    consumers.delete(consumer);
    releaseUnusedSource();
    throw error;
  }
  queueMicrotask(() => {
    if (typed !== undefined) {
      if (activityBaseline !== undefined) consumer.publish('activity/snapshot', activityBaseline);
    } else if (source?.readyState !== 1) consumer.publish('error');
    else if (activityBaseline !== undefined)
      consumer.publish('activity/snapshot', activityBaseline);
  });
  return consumer;
}
const notify = () => {
  for (const listener of [...listeners]) listener();
};
export function subscribeMessagingDefaults(
  listener: () => void,
  onPurge?: (placements: PurgedPlacement[]) => void,
  onLatest?: (value: unknown) => void,
): () => void {
  listeners.add(listener);
  if (onLatest) latestListeners.add(onLatest);
  if (onPurge) {
    purgeListeners.add(onPurge);
    queueMicrotask(() => {
      if (!purgeListeners.has(onPurge)) return;
      const values = [...redactions.values()];
      for (let offset = 0; offset < values.length; offset += 100)
        onPurge(values.slice(offset, offset + 100));
    });
  }
  ensureSource();
  return () => {
    listeners.delete(listener);
    if (onPurge) purgeListeners.delete(onPurge);
    if (onLatest) latestListeners.delete(onLatest);
    releaseUnusedSource();
  };
}

export function subscribeHumanAttention(
  changed: () => void,
  health: (healthy: boolean) => void,
): () => void {
  attentionListeners.set(changed, health);
  health(rosterHealthy);
  try {
    ensureSource();
  } catch {
    health(false);
  }
  return () => {
    attentionListeners.delete(changed);
    releaseUnusedSource();
  };
}

export function observeHumanAttention(refresh: () => void): () => void {
  let disposed = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let recovery: ReturnType<typeof setInterval> | undefined;
  let lastHealth: boolean | undefined;
  const invalidate = (): void => {
    if (disposed || pending !== undefined) return;
    pending = setTimeout(() => {
      pending = undefined;
      if (!disposed) refresh();
    }, 25);
  };
  const stop = subscribeHumanAttention(invalidate, (healthy) => {
    if (lastHealth === healthy) return;
    lastHealth = healthy;
    clearInterval(recovery);
    recovery = healthy ? undefined : setInterval(invalidate, 10_000);
  });
  return () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(pending);
    clearInterval(recovery);
    stop();
  };
}
