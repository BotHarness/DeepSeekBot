import type { PersonaBotActivitySnapshot } from '../state/bot-state.js';
import type { PurgedPlacement } from '../purge/contracts.js';
import { isChannelNotice } from './channel-notice.js';
import type { ChannelDraft, ChannelDraftEvent } from './draft.js';
import type { ChannelMessage, ChannelReaction } from './channel.js';
import type { ChannelMessageCommit, ChannelStore } from './store.js';
import { MAX_MESSAGE_PAGE, type ChannelJournalPage } from './timeline.js';

export const CHANNEL_STREAM_PATH = '/api/botharness/stream';
export const CHANNEL_COMMIT_EVENT = 'channel/message';
export const CHANNEL_ADMISSION_EVENT = 'channel/admission';
export const CHANNEL_HUMAN_READ_EVENT = 'channel/human-read';
export const CHANNEL_REACTION_EVENT = 'channel/reaction';
export const CHANNEL_DRAFT_EVENT = 'channel/draft';
export const CHANNEL_DRAFT_APPEND_EVENT = 'channel/draft-append';
export const CHANNEL_DRAFT_BASELINE_EVENT = 'channel/draft-baseline';
export const CHANNEL_DRAFT_SETTLED_EVENT = 'channel/draft-settled';
export const CHANNEL_DRAFT_ABANDONED_EVENT = 'channel/draft-abandoned';
export const ROSTER_CHANGED_EVENT = 'roster/changed';
export const ROSTER_LATEST_EVENT = 'roster/latest';
export const CONTENT_PURGED_EVENT = 'content/purged';

export interface PublishedDraft extends ChannelDraft {
  revision: number;
}

export type DraftDelivery = 'full' | 'append';

export interface PublishedDraftAppend {
  draftId: string;
  revision: number;
  base: number;
  offset: number;
  append: string;
}

export type PublishedDraftEvent =
  | { type: 'update'; draft: PublishedDraft; append?: PublishedDraftAppend }
  | {
      type: 'settled' | 'abandoned';
      channelId: string;
      draftId: string;
      attemptId: string;
      revision: number;
      reason?: 'retargeted' | 'interrupted' | 'expired';
    };

interface Subscriber {
  push(commit: ChannelMessageCommit): void;
  pushDraft(event: PublishedDraftEvent): void;
  pushAdmission(messageId: string, message: ChannelMessage): void;
  pushHumanRead(humanId: string, revision: number): void;
  pushReaction(messageId: string, reactions: ChannelReaction[]): void;
  close(): void;
}

export type RosterLiveFrame =
  | { type: 'baseline'; placements: PurgedPlacement[] }
  | { type: 'changed' }
  | { type: 'latest'; channelId: string; message: ChannelMessage }
  | { type: 'purged'; placements: PurgedPlacement[] };

export type ActivityLiveFrame =
  | { type: 'baseline'; snapshot: PersonaBotActivitySnapshot }
  | { type: 'changed'; snapshot: PersonaBotActivitySnapshot };

export type ChannelLiveNotification =
  | {
      kind: 'admission';
      channelId: string;
      messageId: string;
      deliveries: NonNullable<ChannelMessage['deliveries']>;
      humanReceipts: NonNullable<ChannelMessage['humanReceipts']>;
    }
  | { kind: 'human-read'; channelId: string; humanId: string; revision: number }
  | { kind: 'reaction'; channelId: string; messageId: string; reactions: ChannelReaction[] }
  | { kind: 'draft-baseline'; channelId: string; revision: number; drafts: PublishedDraft[] }
  | { kind: 'draft'; draft: PublishedDraft }
  | { kind: 'draft-append'; append: PublishedDraftAppend }
  | {
      kind: 'draft-settled' | 'draft-abandoned';
      event: Exclude<PublishedDraftEvent, { type: 'update' }>;
    };

export type ChannelLiveFrame =
  | { type: 'opened'; cursor: number; page?: ChannelJournalPage }
  | { type: 'entry'; entry: { channelId: string; message: ChannelMessage; revision: number } }
  | { type: 'notification'; notification: ChannelLiveNotification };

export class ChannelLiveRefused extends Error {
  constructor(
    readonly code: 'not-found' | 'conflict' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'ChannelLiveRefused';
  }
}

const CHANNEL_LIVE_QUEUE_LIMIT = 4096;

function encodeChannelFrame(frame: ChannelLiveFrame): string {
  if (frame.type === 'opened') return 'retry: 1500\n\n';
  if (frame.type === 'entry')
    return `id: ${frame.entry.revision}\nevent: ${CHANNEL_COMMIT_EVENT}\ndata: ${JSON.stringify(frame.entry)}\n\n`;
  const notification = frame.notification;
  if (notification.kind === 'admission') {
    const { kind: _kind, ...data } = notification;
    return `event: ${CHANNEL_ADMISSION_EVENT}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  if (notification.kind === 'human-read') {
    const { kind: _kind, ...data } = notification;
    return `event: ${CHANNEL_HUMAN_READ_EVENT}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  if (notification.kind === 'reaction') {
    const { kind: _kind, ...data } = notification;
    return `event: ${CHANNEL_REACTION_EVENT}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  if (notification.kind === 'draft-baseline') {
    const { kind: _kind, ...data } = notification;
    return `event: ${CHANNEL_DRAFT_BASELINE_EVENT}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  if (notification.kind === 'draft')
    return `event: ${CHANNEL_DRAFT_EVENT}\ndata: ${JSON.stringify(notification.draft)}\n\n`;
  if (notification.kind === 'draft-append')
    return `event: ${CHANNEL_DRAFT_APPEND_EVENT}\ndata: ${JSON.stringify(notification.append)}\n\n`;
  const name =
    notification.kind === 'draft-settled'
      ? CHANNEL_DRAFT_SETTLED_EVENT
      : CHANNEL_DRAFT_ABANDONED_EVENT;
  return `event: ${name}\ndata: ${JSON.stringify(notification.event)}\n\n`;
}

export class LiveUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveUnavailable';
  }
}

const ROSTER_LIVE_QUEUE_LIMIT = 1024;

export interface ChannelLiveHub {
  open(request: Request): Response;
  followRoster(signal: AbortSignal): AsyncIterable<RosterLiveFrame>;
  followActivity(signal: AbortSignal): AsyncIterable<ActivityLiveFrame>;
  followChannel(
    channelId: string,
    limit: number,
    signal: AbortSignal,
    drafts?: DraftDelivery,
  ): AsyncIterable<ChannelLiveFrame>;
  publishCommitted(commit: ChannelMessageCommit): void;
  publishAdmission(channelId: string, messageId: string, message: ChannelMessage): void;
  publishHumanRead(channelId: string, humanId: string, revision: number): void;
  publishReaction(channelId: string, messageId: string, reactions: ChannelReaction[]): void;
  publishDraft(event: ChannelDraftEvent): void;
  publishRosterCommitted(): void;
  publishContentPurged(): void;
  close(): void;
}

function parseRevision(value: string | null): number | undefined {
  if (value === null || !/^(0|[1-9][0-9]*)$/.test(value)) return undefined;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : undefined;
}

interface ActivitySource {
  snapshot(): PersonaBotActivitySnapshot;
  onChange(listener: () => void): () => void;
}

function combineLiveResponses(channel: Response, roster: Response): Response {
  const readers = [channel.body!, roster.body!].map((body) => body.getReader());
  let ended = false;
  let completed = 0;
  const waiters = new Set<() => void>();
  const resume = (): void => {
    for (const resolve of waiters) resolve();
    waiters.clear();
  };
  const stop = async (): Promise<void> => {
    ended = true;
    resume();
    await Promise.allSettled(readers.map((reader) => reader.cancel()));
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const pump = async (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> => {
        try {
          while (!ended) {
            if ((controller.desiredSize ?? 0) <= 0)
              await new Promise<void>((resolve) => waiters.add(resolve));
            if (ended) return;
            const chunk = await reader.read();
            if (ended) return;
            if (chunk.done) {
              completed++;
              if (completed === readers.length) {
                ended = true;
                resume();
                controller.close();
              }
              return;
            }
            controller.enqueue(chunk.value);
          }
        } catch (error) {
          if (ended) return;
          controller.error(error);
          await stop();
        }
      };
      for (const reader of readers) void pump(reader);
    },
    pull() {
      resume();
    },
    cancel() {
      return stop();
    },
  });
  return new Response(body, { headers: channel.headers });
}

export function createChannelLiveHub(
  channels: ChannelStore,
  activity?: ActivitySource,
  redactions?: () => PurgedPlacement[],
): ChannelLiveHub {
  const subscribers = new Map<string, Set<Subscriber>>();
  const drafts = new Map<string, Map<string, PublishedDraft>>();
  const draftRevisions = new Map<string, number>();
  const activitySubscribers = new Set<{ close(): void }>();
  const openActivity = (): Response => {
    if (activity === undefined) return new Response('Activity unavailable', { status: 503 });
    const encoder = new TextEncoder();
    let cancel: (() => void) | undefined;
    let flush: (() => void) | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let ended = false;
        let pending = false;
        let unsubscribe: (() => void) | undefined;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const subscriber = {
          close() {
            if (ended) return;
            ended = true;
            unsubscribe?.();
            if (heartbeat !== undefined) clearInterval(heartbeat);
            activitySubscribers.delete(subscriber);
            try {
              controller.close();
            } catch {}
          },
        };
        const send = (): void => {
          if (ended) return;
          if ((controller.desiredSize ?? 0) <= 0) {
            pending = true;
            return;
          }
          pending = false;
          try {
            controller.enqueue(
              encoder.encode(
                `event: activity/snapshot\ndata: ${JSON.stringify(activity.snapshot())}\n\n`,
              ),
            );
          } catch {
            subscriber.close();
          }
        };
        flush = () => {
          if (pending) send();
        };
        activitySubscribers.add(subscriber);
        cancel = () => subscriber.close();
        unsubscribe = activity.onChange(send);
        send();
        heartbeat = setInterval(() => {
          if (ended || (controller.desiredSize ?? 0) <= 0) return;
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            subscriber.close();
          }
        }, 15_000);
      },
      pull() {
        flush?.();
      },
      cancel() {
        cancel?.();
      },
    });
    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  };
  interface RosterSubscriber {
    push(): void;
    latest(channelId: string, message: ChannelMessage): void;
    purge(placements: PurgedPlacement[]): void;
    close(): void;
  }
  const rosterSubscribers = new Set<RosterSubscriber>();
  const openRoster = (includeActivity = false): Response => {
    const encoder = new TextEncoder();
    let subscriber: RosterSubscriber | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let flushActivity: (() => void) | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let ended = false;
        let pendingActivity = false;
        let offActivity: (() => void) | undefined;
        const sendActivity = (): void => {
          if (ended || activity === undefined) return;
          if ((controller.desiredSize ?? 0) <= 0) {
            pendingActivity = true;
            return;
          }
          pendingActivity = false;
          try {
            controller.enqueue(
              encoder.encode(
                `event: activity/snapshot\ndata: ${JSON.stringify(activity.snapshot())}\n\n`,
              ),
            );
          } catch {
            subscriber?.close();
          }
        };
        flushActivity = () => {
          if (pendingActivity) sendActivity();
        };
        subscriber = {
          purge(placements) {
            if (ended) return;
            try {
              for (let offset = 0; offset < placements.length; offset += 100)
                controller.enqueue(
                  encoder.encode(
                    `event: ${CONTENT_PURGED_EVENT}\ndata: ${JSON.stringify({ placements: placements.slice(offset, offset + 100) })}\n\n`,
                  ),
                );
            } catch {
              this.close();
            }
          },
          push() {
            if (ended) return;
            try {
              controller.enqueue(encoder.encode(`event: ${ROSTER_CHANGED_EVENT}\ndata: {}\n\n`));
            } catch {
              this.close();
            }
          },
          latest(channelId, message) {
            if (ended) return;
            try {
              controller.enqueue(
                encoder.encode(
                  `event: ${ROSTER_LATEST_EVENT}\ndata: ${JSON.stringify({ channelId, message })}\n\n`,
                ),
              );
            } catch {
              this.close();
            }
          },
          close() {
            if (ended) return;
            ended = true;
            offActivity?.();
            if (heartbeat !== undefined) clearInterval(heartbeat);
            rosterSubscribers.delete(this);
            try {
              controller.close();
            } catch {}
          },
        };
        rosterSubscribers.add(subscriber);
        controller.enqueue(encoder.encode('retry: 1500\n\n'));
        subscriber.purge(redactions?.() ?? []);
        if (includeActivity && activity !== undefined) {
          offActivity = activity.onChange(sendActivity);
          sendActivity();
        }
        heartbeat = setInterval(() => {
          if (ended || (controller.desiredSize ?? 0) <= 0) return;
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            subscriber?.close();
          }
        }, 15_000);
      },
      pull() {
        flushActivity?.();
      },
      cancel() {
        subscriber?.close();
      },
    });
    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  };
  async function* followRoster(signal: AbortSignal): AsyncGenerator<RosterLiveFrame> {
    const queue: RosterLiveFrame[] = [];
    let ended = signal.aborted;
    let wake: (() => void) | undefined;
    const subscriber: RosterSubscriber = {
      purge(placements) {
        if (ended) return;
        queue.push({ type: 'purged', placements });
        if (queue.length > ROSTER_LIVE_QUEUE_LIMIT) this.close();
        wake?.();
      },
      push() {
        if (ended) return;
        if (queue.at(-1)?.type !== 'changed') queue.push({ type: 'changed' });
        wake?.();
      },
      latest(channelId, message) {
        if (ended) return;
        const stale = queue.findIndex(
          (frame) => frame.type === 'latest' && frame.channelId === channelId,
        );
        if (stale !== -1) queue.splice(stale, 1);
        queue.push({ type: 'latest', channelId, message });
        if (queue.length > ROSTER_LIVE_QUEUE_LIMIT) this.close();
        wake?.();
      },
      close() {
        if (ended) return;
        ended = true;
        rosterSubscribers.delete(this);
        wake?.();
      },
    };
    const abort = (): void => subscriber.close();
    signal.addEventListener('abort', abort, { once: true });
    if (!ended) rosterSubscribers.add(subscriber);
    try {
      if (ended) return;
      yield { type: 'baseline', placements: redactions?.() ?? [] };
      for (;;) {
        while (!ended && queue.length > 0) yield queue.shift()!;
        if (ended) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
    } finally {
      signal.removeEventListener('abort', abort);
      subscriber.close();
    }
  }
  async function* followActivity(signal: AbortSignal): AsyncGenerator<ActivityLiveFrame> {
    if (activity === undefined) throw new LiveUnavailable('Activity unavailable');
    let ended = signal.aborted;
    let pending = false;
    let wake: (() => void) | undefined;
    const subscriber = {
      close(): void {
        if (ended) return;
        ended = true;
        activitySubscribers.delete(subscriber);
        wake?.();
      },
    };
    const abort = (): void => subscriber.close();
    signal.addEventListener('abort', abort, { once: true });
    const unsubscribe = ended
      ? undefined
      : activity.onChange(() => {
          pending = true;
          wake?.();
        });
    if (!ended) activitySubscribers.add(subscriber);
    try {
      if (ended) return;
      yield { type: 'baseline', snapshot: activity.snapshot() };
      for (;;) {
        if (ended) return;
        if (pending) {
          pending = false;
          yield { type: 'changed', snapshot: activity.snapshot() };
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
    } finally {
      signal.removeEventListener('abort', abort);
      unsubscribe?.();
      subscriber.close();
    }
  }
  const subscribeChannel = (
    channelId: string,
    after: number,
    sink: (frame: ChannelLiveFrame) => void,
    closed: () => void,
    delivery: DraftDelivery = 'full',
  ): { close(): void } => {
    let delivered = after;
    let ended = false;
    const emit = (frame: ChannelLiveFrame): void => {
      if (ended) return;
      try {
        sink(frame);
      } catch {
        subscriber.close();
      }
    };
    const subscriber: Subscriber = {
      push(commit) {
        if (ended || commit.revision <= delivered) return;
        emit({
          type: 'entry',
          entry: {
            channelId: commit.channelId,
            message: commit.message,
            revision: commit.revision,
          },
        });
        if (!ended) delivered = commit.revision;
      },
      pushAdmission(messageId, message) {
        emit({
          type: 'notification',
          notification: {
            kind: 'admission',
            channelId,
            messageId,
            deliveries: message.deliveries ?? [],
            humanReceipts: message.humanReceipts ?? [],
          },
        });
      },
      pushHumanRead(humanId, revision) {
        emit({
          type: 'notification',
          notification: { kind: 'human-read', channelId, humanId, revision },
        });
      },
      pushReaction(messageId, reactions) {
        emit({
          type: 'notification',
          notification: { kind: 'reaction', channelId, messageId, reactions },
        });
      },
      pushDraft(event) {
        emit({
          type: 'notification',
          notification:
            event.type === 'update'
              ? delivery === 'append' && event.append !== undefined
                ? { kind: 'draft-append', append: event.append }
                : { kind: 'draft', draft: event.draft }
              : event.type === 'settled'
                ? { kind: 'draft-settled', event }
                : { kind: 'draft-abandoned', event },
        });
      },
      close() {
        if (ended) return;
        ended = true;
        remove(channelId, subscriber);
        closed();
      },
    };
    let group = subscribers.get(channelId);
    if (group === undefined) {
      group = new Set();
      subscribers.set(channelId, group);
    }
    group.add(subscriber);
    emit({ type: 'opened', cursor: after });
    for (const commit of channels.messagesAfter(channelId, after) ?? []) subscriber.push(commit);
    for (const commit of channels.messagesAfter(channelId, Math.max(0, after - 100)) ?? []) {
      if (commit.revision > after) break;
      if (commit.message.deliveries !== undefined)
        subscriber.pushAdmission(commit.message.id, commit.message);
    }
    if (channels.get(channelId)?.type === 'group') {
      const position = channels.readPosition(channelId);
      if (position !== undefined) subscriber.pushHumanRead('local-human', position.revision);
    }
    emit({
      type: 'notification',
      notification: {
        kind: 'draft-baseline',
        channelId,
        revision: draftRevisions.get(channelId) ?? 0,
        drafts: [...(drafts.get(channelId)?.values() ?? [])],
      },
    });
    return subscriber;
  };
  async function* followChannel(
    channelId: string,
    limit: number,
    signal: AbortSignal,
    drafts: DraftDelivery = 'full',
  ): AsyncGenerator<ChannelLiveFrame> {
    if (typeof channelId !== 'string' || channels.get(channelId) === undefined)
      throw new ChannelLiveRefused('not-found', 'Unknown Channel');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_MESSAGE_PAGE)
      throw new ChannelLiveRefused('invalid', 'Invalid Channel page size');
    if (drafts !== 'full' && drafts !== 'append')
      throw new ChannelLiveRefused('invalid', 'Invalid draft delivery');
    const after = channels.revision(channelId);
    const page = channels.readHumanJournalPage(channelId, { through: after, limit });
    if (page === undefined) throw new ChannelLiveRefused('not-found', 'Unknown Channel');
    if (signal.aborted) return;
    const queue: ChannelLiveFrame[] = [];
    let ended = false;
    let wake: (() => void) | undefined;
    const subscription = subscribeChannel(
      channelId,
      after,
      (frame) => {
        queue.push(frame.type === 'opened' ? { ...frame, page } : frame);
        if (queue.length > CHANNEL_LIVE_QUEUE_LIMIT)
          throw new Error('Channel live consumer is behind');
        wake?.();
      },
      () => {
        ended = true;
        wake?.();
      },
      drafts,
    );
    const abort = (): void => subscription.close();
    signal.addEventListener('abort', abort, { once: true });
    try {
      for (;;) {
        while (!ended && queue.length > 0) yield queue.shift()!;
        if (ended) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
    } finally {
      signal.removeEventListener('abort', abort);
      subscription.close();
    }
  }
  const remove = (channelId: string, subscriber: Subscriber): void => {
    const group = subscribers.get(channelId);
    group?.delete(subscriber);
    if (group?.size === 0) subscribers.delete(channelId);
  };

  return {
    followRoster,
    followActivity,
    followChannel,
    open(request) {
      const url = new URL(request.url);
      if (url.searchParams.get('roster') === '1' && url.searchParams.has('channelId')) {
        const channelUrl = new URL(url);
        channelUrl.searchParams.delete('roster');
        channelUrl.searchParams.delete('activity');
        const response = this.open(new Request(channelUrl, { headers: request.headers }));
        if (response.status !== 200 || response.body === null) return response;
        return combineLiveResponses(response, openRoster(url.searchParams.get('activity') === '1'));
      }
      if (url.searchParams.get('scope') === 'activity') return openActivity();
      if (url.searchParams.get('scope') === 'roster')
        return openRoster(url.searchParams.get('activity') === '1');
      const channelId = url.searchParams.get('channelId');
      if (channelId === null || channels.get(channelId) === undefined) {
        return new Response('Unknown Channel', { status: 404 });
      }
      const query = url.searchParams.get('after');
      const lastEventId = request.headers.get('Last-Event-ID');
      const requested = query === null ? 0 : parseRevision(query);
      const resumed = lastEventId === null ? 0 : parseRevision(lastEventId);
      if (requested === undefined || resumed === undefined) {
        return new Response('Invalid Channel revision', { status: 400 });
      }
      const after = Math.max(requested, resumed);
      if (channels.messagesAfter(channelId, after) === undefined) {
        return new Response('Channel revision is ahead of the log', { status: 409 });
      }

      const encoder = new TextEncoder();
      let subscription: { close(): void } | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          subscription = subscribeChannel(
            channelId,
            after,
            (frame) => controller.enqueue(encoder.encode(encodeChannelFrame(frame))),
            () => {
              if (heartbeat !== undefined) clearInterval(heartbeat);
              try {
                controller.close();
              } catch {}
            },
          );
          heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': heartbeat\n\n'));
            } catch {
              subscription?.close();
            }
          }, 15_000);
        },
        cancel() {
          subscription?.close();
        },
      });
      return new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    },
    publishCommitted(commit) {
      for (const subscriber of subscribers.get(commit.channelId) ?? []) subscriber.push(commit);
      if (!isChannelNotice(commit.message))
        for (const subscriber of rosterSubscribers)
          subscriber.latest(commit.channelId, commit.message);
      if (commit.message.author.kind !== 'bot') return;
      const botSlug = commit.message.author.slug;
      const candidates = [...(drafts.get(commit.channelId)?.values() ?? [])].filter(
        (draft) => draft.botSlug === botSlug,
      );
      const matching = candidates.filter((draft) => commit.message.body.startsWith(draft.body));
      const settled = matching.length > 0 ? matching : candidates.length === 1 ? candidates : [];
      for (const draft of settled) {
        this.publishDraft({
          type: 'settled',
          channelId: commit.channelId,
          draftId: draft.draftId,
          attemptId: draft.attemptId,
        });
      }
    },
    publishAdmission(channelId, messageId, message) {
      for (const subscriber of subscribers.get(channelId) ?? [])
        subscriber.pushAdmission(messageId, message);
    },
    publishHumanRead(channelId, humanId, revision) {
      for (const subscriber of subscribers.get(channelId) ?? [])
        subscriber.pushHumanRead(humanId, revision);
    },
    publishReaction(channelId, messageId, reactions) {
      for (const subscriber of subscribers.get(channelId) ?? [])
        subscriber.pushReaction(messageId, reactions);
    },
    publishDraft(event) {
      const channelId = event.type === 'update' ? event.draft.channelId : event.channelId;
      if (channels.get(channelId) === undefined) return;
      const revision = (draftRevisions.get(channelId) ?? 0) + 1;
      let published: PublishedDraftEvent;
      if (event.type === 'update') {
        let group = drafts.get(channelId);
        if (group === undefined) {
          group = new Map();
          drafts.set(channelId, group);
        }
        const draft = { ...event.draft, revision };
        const previous = group.get(draft.draftId);
        group.set(draft.draftId, draft);
        published =
          previous?.attemptId === draft.attemptId &&
          previous.botSlug === draft.botSlug &&
          draft.body.length > previous.body.length &&
          draft.body.startsWith(previous.body)
            ? {
                type: 'update',
                draft,
                append: {
                  draftId: draft.draftId,
                  revision,
                  base: previous.revision,
                  offset: previous.body.length,
                  append: draft.body.slice(previous.body.length),
                },
              }
            : { type: 'update', draft };
      } else {
        const group = drafts.get(channelId);
        if (group?.get(event.draftId)?.attemptId !== event.attemptId) return;
        group.delete(event.draftId);
        if (group.size === 0) drafts.delete(channelId);
        published = { ...event, revision };
      }
      draftRevisions.set(channelId, revision);
      for (const subscriber of subscribers.get(channelId) ?? []) subscriber.pushDraft(published);
    },
    publishRosterCommitted() {
      for (const subscriber of rosterSubscribers) subscriber.push();
    },
    publishContentPurged() {
      const placements = redactions?.() ?? [];
      for (const subscriber of rosterSubscribers) subscriber.purge(placements);
    },
    close() {
      drafts.clear();
      for (const group of subscribers.values()) {
        for (const subscriber of group) subscriber.close();
      }
      for (const subscriber of rosterSubscribers) subscriber.close();
      for (const subscriber of activitySubscribers) subscriber.close();
    },
  };
}
