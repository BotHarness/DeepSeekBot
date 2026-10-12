import type { PersonaBotActivitySnapshot } from '../state/bot-state.js';
import type { PurgedPlacement } from '../purge/contracts.js';
import type { ChannelDraft, ChannelDraftEvent } from './draft.js';
import type { ChannelMessage } from './channel.js';
import type { ChannelMessageCommit, ChannelStore } from './store.js';

export const CHANNEL_STREAM_PATH = '/api/botharness/stream';
export const CHANNEL_COMMIT_EVENT = 'channel/message';
export const CHANNEL_ADMISSION_EVENT = 'channel/admission';
export const CHANNEL_HUMAN_READ_EVENT = 'channel/human-read';
export const CHANNEL_DRAFT_EVENT = 'channel/draft';
export const CHANNEL_DRAFT_BASELINE_EVENT = 'channel/draft-baseline';
export const CHANNEL_DRAFT_SETTLED_EVENT = 'channel/draft-settled';
export const CHANNEL_DRAFT_ABANDONED_EVENT = 'channel/draft-abandoned';
export const ROSTER_CHANGED_EVENT = 'roster/changed';
export const CONTENT_PURGED_EVENT = 'content/purged';

interface PublishedDraft extends ChannelDraft {
  revision: number;
}

type PublishedDraftEvent =
  | { type: 'update'; draft: PublishedDraft }
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
  close(): void;
}

export interface ChannelLiveHub {
  open(request: Request): Response;
  publishCommitted(commit: ChannelMessageCommit): void;
  publishAdmission(channelId: string, messageId: string, message: ChannelMessage): void;
  publishHumanRead(channelId: string, humanId: string, revision: number): void;
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

function frame(commit: ChannelMessageCommit): string {
  return `id: ${commit.revision}\nevent: ${CHANNEL_COMMIT_EVENT}\ndata: ${JSON.stringify({ channelId: commit.channelId, message: commit.message, revision: commit.revision })}\n\n`;
}

function draftFrame(event: PublishedDraftEvent): string {
  const name =
    event.type === 'update'
      ? CHANNEL_DRAFT_EVENT
      : event.type === 'settled'
        ? CHANNEL_DRAFT_SETTLED_EVENT
        : CHANNEL_DRAFT_ABANDONED_EVENT;
  const data = event.type === 'update' ? event.draft : event;
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
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
  const remove = (channelId: string, subscriber: Subscriber): void => {
    const group = subscribers.get(channelId);
    group?.delete(subscriber);
    if (group?.size === 0) subscribers.delete(channelId);
  };

  return {
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
      let subscriber: Subscriber | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          let delivered = after;
          let ended = false;
          const push = (commit: ChannelMessageCommit): void => {
            if (ended || commit.revision <= delivered) return;
            try {
              controller.enqueue(encoder.encode(frame(commit)));
              delivered = commit.revision;
            } catch {
              subscriber?.close();
            }
          };
          subscriber = {
            push,
            pushAdmission(messageId, message) {
              if (ended) return;
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: ${CHANNEL_ADMISSION_EVENT}\ndata: ${JSON.stringify({
                      channelId,
                      messageId,
                      deliveries: message.deliveries ?? [],
                      humanReceipts: message.humanReceipts ?? [],
                    })}\n\n`,
                  ),
                );
              } catch {
                this.close();
              }
            },
            pushHumanRead(humanId, revision) {
              if (ended) return;
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: ${CHANNEL_HUMAN_READ_EVENT}\ndata: ${JSON.stringify({
                      channelId,
                      humanId,
                      revision,
                    })}\n\n`,
                  ),
                );
              } catch {
                this.close();
              }
            },
            pushDraft(event) {
              if (ended) return;
              try {
                controller.enqueue(encoder.encode(draftFrame(event)));
              } catch {
                this.close();
              }
            },
            close() {
              if (ended) return;
              ended = true;
              if (heartbeat !== undefined) clearInterval(heartbeat);
              remove(channelId, this);
              try {
                controller.close();
              } catch {}
            },
          };
          let group = subscribers.get(channelId);
          if (group === undefined) {
            group = new Set();
            subscribers.set(channelId, group);
          }
          group.add(subscriber);
          controller.enqueue(encoder.encode('retry: 1500\n\n'));

          for (const commit of channels.messagesAfter(channelId, after) ?? []) push(commit);
          for (const commit of channels.messagesAfter(channelId, Math.max(0, after - 100)) ?? []) {
            if (commit.revision > after) break;
            if (commit.message.deliveries !== undefined) {
              subscriber.pushAdmission(commit.message.id, commit.message);
            }
          }
          if (channels.get(channelId)?.type === 'group') {
            const position = channels.readPosition(channelId);
            if (position !== undefined) subscriber.pushHumanRead('local-human', position.revision);
          }
          controller.enqueue(
            encoder.encode(
              `event: ${CHANNEL_DRAFT_BASELINE_EVENT}\ndata: ${JSON.stringify({
                channelId,
                revision: draftRevisions.get(channelId) ?? 0,
                drafts: [...(drafts.get(channelId)?.values() ?? [])],
              })}\n\n`,
            ),
          );
          heartbeat = setInterval(() => {
            if (ended) return;
            try {
              controller.enqueue(encoder.encode(': heartbeat\n\n'));
            } catch {
              subscriber?.close();
            }
          }, 15_000);
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
    },
    publishCommitted(commit) {
      for (const subscriber of subscribers.get(commit.channelId) ?? []) subscriber.push(commit);
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
        group.set(draft.draftId, draft);
        published = { type: 'update', draft };
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
