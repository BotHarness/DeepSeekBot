import type { PurgedPlacement } from '../../../core/src/purge/contracts.js';
import { parseContentRedactions } from './content-redactions.js';

const listeners = new Set<() => void>();
const purgeListeners = new Set<(placements: PurgedPlacement[]) => void>();
const redactions = new Map<string, PurgedPlacement>();
let source: EventSource | undefined;
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

function releaseUnusedSource(): void {
  if (listeners.size || consumers.size) return;
  source?.close();
  source = undefined;
  sourceUrl = undefined;
  activityBaseline = undefined;
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
    return this.closed ? 2 : (this.errorState ?? source?.readyState ?? 2);
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
    if (listeners.size || consumers.size) {
      try {
        ensureSource();
      } catch {
        console.warn('botharness: live transport replacement refused');
      }
    }
  }
}

function ensureSource(): void {
  if (typeof EventSource === 'undefined') return;
  const url = channelConsumer?.channelUrl ?? '/api/botharness/stream?scope=roster&activity=1';
  if (source && sourceUrl === url) return;
  const next = new EventSource(url);
  source?.close();
  source = undefined;
  sourceUrl = undefined;
  activityBaseline = undefined;
  source = next;
  sourceUrl = url;
  next.addEventListener('roster/changed', () => {
    if (source === next) notify();
  });
  next.addEventListener('open', () => {
    if (source === next) notify();
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

export function openSharedChannel(url: string): ChannelEventSource {
  if (channelConsumer !== undefined) throw new Error('A document already owns a live Channel');
  const query = new URL(url, 'http://localhost').searchParams;
  query.set('roster', '1');
  query.set('activity', '1');
  const consumer = new SharedSource('/api/botharness/stream?' + query.toString());
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
  if (typeof EventSource === 'undefined') return undefined;
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
    if (source?.readyState !== 1) consumer.publish('error');
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
): () => void {
  listeners.add(listener);
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
    releaseUnusedSource();
  };
}
