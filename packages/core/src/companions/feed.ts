import type { AvatarAppearance, RetainedAvatarAppearance } from '../bots/avatar-appearance.js';
import type { ChannelOutputObservation } from '../channels/store.js';
import { messagePreview } from '../channels/message-preview.js';
import type { PersonaBotOutputCommitted } from '../channels/output.js';
import type { PersonaBotActivitySnapshot } from '../state/bot-state.js';
import { randomUUID } from 'node:crypto';
import type { ChannelToolApproval, ToolApprovalNotice } from '../workspaces/tool-approval.js';
import type { ChannelUserQuestions, ChannelQuestionNotice } from '../channels/user-questions.js';
import {
  companionSources,
  companionSourceEnabled,
  type CompanionEpochs,
  type CompanionSource,
} from './sources.js';

export const COMPANION_PATH = '/api/botharness/companion';
export interface CompanionApproval extends ToolApprovalNotice {
  kind: 'tool-approval';
  channelId: string;
  channelName: string;
}
export interface CompanionQuestion extends ChannelQuestionNotice {
  kind: 'user-question';
  channelId: string;
  channelName: string;
}
export type CompanionRequest = CompanionApproval | CompanionQuestion;
export interface CompanionBot {
  slug: string;
  name: string;
  paused: boolean;
  lifecycle?: string;
  avatar?: string;
  appearance?: AvatarAppearance | RetainedAvatarAppearance;
  requests?: readonly CompanionRequest[];
  avatarSeed?: 2;
}
export interface CompanionMessage {
  generation: string;
  botId: string;
  messageId: string;
  channelId: string;
  channelName: string;
  body: string;
  source?: 'own-dm' | 'bot-dm' | 'shared-group' | 'bot-group';
  participants?: string[];
  canOpen?: boolean;
}
export interface CompanionFeed {
  attachApprovals(owner: Pick<ChannelToolApproval, 'requests' | 'subscribe'>): () => void;
  attachQuestions(owner: Pick<ChannelUserQuestions, 'requests' | 'subscribe'>): () => void;
  open(request: Request): Response;
  update(request: Request): Promise<Response>;
  publish(event: PersonaBotOutputCommitted): void;
  close(): void;
}
export interface CompanionSubscription {
  botId: string;
  dm: boolean;
  group?: boolean;
  visibility?: 'own-dm' | 'shared' | 'all-bot';
  epochs?: CompanionEpochs;
}
interface FeedSource {
  profileId: string;
  bot(slug: string): CompanionBot | undefined;
  activity(): PersonaBotActivitySnapshot;
  onActivity(changed: () => void): () => void;
  observeOutput(channelId: string, messageId: string): ChannelOutputObservation | undefined;
  checkpoint?(): number | undefined;
  onIdentity?(changed: () => void): () => void;
}

type OutputReference = Pick<PersonaBotOutputCommitted, 'botId' | 'messageId' | 'channelId'> & {
  source?: CompanionSource;
  epoch?: number;
};
interface RecoveryState {
  lifecycles: Map<string, string>;
  capacity: number;
  selections: Map<string, CompanionSubscription>;
  messages: Map<string, OutputReference[]>;
  checkpoints: Map<string, number>;
}

export function createCompanionFeed(source: FeedSource): CompanionFeed {
  const requestSources = new Map<
    CompanionRequest['kind'],
    {
      read(bot: CompanionBot): CompanionRequest[];
      off(): void;
    }
  >();
  const presentedBot = (id: string): CompanionBot | undefined => {
    const bot = source.bot(id);
    return bot === undefined
      ? undefined
      : {
          ...bot,
          requests: bot.paused
            ? []
            : [...requestSources.values()].flatMap((owner) => owner.read(bot)),
        };
  };
  const consumers = new Set<{
    publish(event: PersonaBotOutputCommitted): void;
    reconcile(): void;
    close(): void;
  }>();
  const controls = new Map<
    string,
    {
      replace(
        selections: readonly CompanionSubscription[],
        capacity: number,
        revision: number,
      ): void;
    }
  >();
  const encoder = new TextEncoder();
  const recoveries = new Map<
    string,
    { generation: string; detached(): boolean; available(): boolean; take(): RecoveryState }
  >();
  const identities = new Map<string, { paused: boolean; lifecycle: string }>();
  const lifecycle = (id: string): string | undefined => {
    const bot = source.bot(id);
    if (!bot) {
      identities.delete(id);
      return;
    }
    const previous = identities.get(id);
    if (!previous || previous.paused !== bot.paused)
      identities.set(id, { paused: bot.paused, lifecycle: randomUUID() });
    return identities.get(id)!.lifecycle;
  };
  let disposed = false;
  const offIdentity = source.onIdentity?.(() => {
    for (const id of identities.keys()) lifecycle(id);
    for (const consumer of consumers) consumer.reconcile();
  });
  const attachRequests = (
    kind: CompanionRequest['kind'],
    read: (bot: CompanionBot) => CompanionRequest[],
    subscribe: (listener: () => void) => () => void,
  ): (() => void) => {
    if (disposed) return () => undefined;
    requestSources.get(kind)?.off();
    const reconcile = (): void => {
      for (const consumer of consumers) consumer.reconcile();
    };
    const owner = { read, off: subscribe(reconcile) };
    requestSources.set(kind, owner);
    reconcile();
    return () => {
      if (requestSources.get(kind) !== owner) return;
      owner.off();
      requestSources.delete(kind);
      reconcile();
    };
  };
  return {
    attachQuestions(owner) {
      return attachRequests(
        'user-question',
        (bot) =>
          owner.requests(bot.slug).map((request) => ({
            ...request,
            kind: 'user-question',
            channelId: request.channelId,
            channelName: request.groupName ?? bot.name,
          })),
        (listener) => owner.subscribe(listener),
      );
    },
    attachApprovals(owner) {
      return attachRequests(
        'tool-approval',
        (bot) =>
          owner.requests(bot.slug).map((request) => ({
            ...request,
            kind: 'tool-approval',
            channelId: request.channelId,
            channelName: request.groupName ?? bot.name,
          })),
        (listener) => owner.subscribe(listener),
      );
    },
    async update(request) {
      if (disposed) return new Response('Companion unavailable', { status: 503 });
      let value: unknown;
      try {
        value = await request.json();
      } catch {
        return new Response('Invalid subscription', { status: 400 });
      }
      if (
        typeof value !== 'object' ||
        value === null ||
        !('consumerId' in value) ||
        typeof value.consumerId !== 'string' ||
        !('selections' in value) ||
        !Array.isArray(value.selections)
      )
        return new Response('Invalid subscription', { status: 400 });
      const consumer = controls.get(value.consumerId);
      if (!consumer) return new Response('Subscription unavailable', { status: 404 });
      const capacity = 'capacity' in value ? value.capacity : 20;
      const revision = 'revision' in value ? value.revision : 0;
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)
        return new Response('Invalid revision', { status: 400 });
      if (
        typeof capacity !== 'number' ||
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > 100
      )
        return new Response('Invalid capacity', { status: 400 });
      const selections: CompanionSubscription[] = [];
      const seen = new Set<string>();
      for (const item of value.selections) {
        if (
          typeof item !== 'object' ||
          item === null ||
          !('botId' in item) ||
          typeof item.botId !== 'string' ||
          !('dm' in item) ||
          typeof item.dm !== 'boolean' ||
          seen.has(item.botId)
        )
          return new Response('Invalid selection', { status: 400 });
        if (!source.bot(item.botId)) return new Response('Unknown PersonaBot', { status: 404 });
        seen.add(item.botId);
        const group = 'group' in item ? item.group : false;
        const visibility = 'visibility' in item ? item.visibility : 'shared';
        if (
          typeof group !== 'boolean' ||
          (visibility !== 'own-dm' && visibility !== 'shared' && visibility !== 'all-bot')
        )
          return new Response('Invalid visibility', { status: 400 });
        const epochs = 'epochs' in item ? item.epochs : undefined;
        if (
          epochs !== undefined &&
          (typeof epochs !== 'object' ||
            epochs === null ||
            !companionSources.every(
              (source) =>
                source in epochs &&
                typeof epochs[source] === 'number' &&
                Number.isSafeInteger(epochs[source]) &&
                epochs[source] >= 0,
            ))
        )
          return new Response('Invalid source epochs', { status: 400 });
        selections.push({
          botId: item.botId,
          dm: item.dm,
          group,
          visibility,
          ...(epochs === undefined ? {} : { epochs: epochs as CompanionEpochs }),
        });
      }
      consumer.replace(selections, capacity, revision);
      return Response.json({ updated: true });
    },
    open(request) {
      if (disposed) return new Response('Companion unavailable', { status: 503 });
      const url = new URL(request.url);
      const botId = url.searchParams.get('botId');
      const multiplexed = url.searchParams.get('subscribe') === '1';
      if (botId === null && !multiplexed) return Response.json({ profileId: source.profileId });
      const bot = botId === null ? undefined : source.bot(botId);
      if (!multiplexed && bot === undefined)
        return new Response('Unknown PersonaBot', { status: 404 });
      const dm = url.searchParams.get('dm') !== '0';
      const group = url.searchParams.get('group') === '1';
      const visibility = url.searchParams.get('visibility') ?? 'shared';
      if (visibility !== 'own-dm' && visibility !== 'shared' && visibility !== 'all-bot')
        return new Response('Invalid visibility', { status: 400 });
      const consumerId = multiplexed ? randomUUID() : undefined;
      const resume = multiplexed
        ? request.headers.get('Last-Event-ID') || url.searchParams.get('resume')
        : null;
      const retained = resume ? recoveries.get(resume) : undefined;
      const previous =
        retained?.available() && retained.generation === source.activity().generation
          ? retained.take()
          : undefined;
      const recovery =
        previous &&
        [...previous.selections.values()].every((selection) => selection.epochs !== undefined)
          ? previous
          : undefined;
      if (retained && previous === undefined) retained.take();
      let selected = new Map<string, CompanionSubscription & { bot: CompanionBot }>(
        [...(recovery?.selections ?? [])].flatMap(([id, selection]) => {
          const bot = source.bot(id);
          return bot ? [[id, { ...selection, bot }] as const] : [];
        }),
      );
      const checkpoints = new Map(recovery?.checkpoints);
      let awaitingSelection = recovery !== undefined;
      if (!multiplexed && bot && botId) selected.set(botId, { botId, dm, group, visibility, bot });
      const initialCheckpoint = source.checkpoint?.();
      if (!multiplexed && botId && initialCheckpoint !== undefined)
        for (const kind of companionSources)
          checkpoints.set(`${botId}\0${kind}`, initialCheckpoint);
      const removed = new Set<string>();
      const lifecycles = new Map(recovery?.lifecycles);
      if (!multiplexed && botId) lifecycles.set(botId, lifecycle(botId)!);
      let capacity = recovery?.capacity ?? 20;
      let selectionRevision = 0;
      let finish: (() => void) | undefined;
      let flush: (() => void) | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          let ended = false;
          let deadline = Number.POSITIVE_INFINITY;
          let expiry: ReturnType<typeof setTimeout> | undefined;
          const journal = new Map(recovery?.messages);
          let pendingActivity: string | undefined;
          let pendingSelection: string | undefined;
          const messages = new Map<string, OutputReference[]>();
          const frame = (name: string, value: unknown) =>
            `event: ${name}\ndata: ${JSON.stringify(value)}\n${consumerId ? `id: ${consumerId}\n` : ''}\n`;
          const snapshot = () => ({
            profileId: source.profileId,
            ...(multiplexed
              ? {
                  consumerId,
                  selectionRevision,
                  recovered: recovery !== undefined,
                  bots: [...selected.keys()].flatMap((id) => {
                    const bot = presentedBot(id);
                    return bot
                      ? [
                          {
                            ...bot,
                            ...(lifecycles.has(id) ? { lifecycle: lifecycles.get(id)! } : {}),
                          },
                        ]
                      : [];
                  }),
                  removedBotIds: [...removed],
                }
              : {
                  bot:
                    botId === null
                      ? bot
                      : { ...presentedBot(botId), lifecycle: lifecycles.get(botId) },
                }),
            activity: source.activity(),
          });
          const write = (value: string) => {
            try {
              controller.enqueue(encoder.encode(value));
            } catch {
              consumer.close();
            }
          };
          const changed = () => {
            if (ended) return;
            const value = frame('companion/activity', snapshot());
            if ((controller.desiredSize ?? 0) > 0) write(value);
            else pendingActivity = value;
          };
          const project = (event: OutputReference): CompanionMessage | undefined => {
            const selection = selected.get(event.botId);
            if (!selection || source.bot(event.botId)?.paused !== false) return;
            const observed = source.observeOutput(event.channelId, event.messageId);
            if (!observed) return;
            if (
              event.source !== undefined &&
              event.epoch !== (selection.epochs?.[event.source] ?? 0)
            )
              return;
            const channel = observed.channel;
            if (
              !channel ||
              channel.deletedAt !== undefined ||
              !channel.members.includes(event.botId) ||
              (channel.type === 'dm' &&
                !(channel.botSlug === event.botId && channel.members.length === 1) &&
                !(channel.botSlug === undefined && channel.members.length === 2)) ||
              (channel.type === 'dm' ? !selection.dm : !selection.group)
            )
              return;
            const human = observed.humanParticipant;
            const ownDm =
              channel.type === 'dm' &&
              channel.botSlug === event.botId &&
              channel.members.length === 1;
            const sourceKind =
              channel.type === 'dm'
                ? ownDm
                  ? 'own-dm'
                  : 'bot-dm'
                : human
                  ? 'shared-group'
                  : 'bot-group';
            const checkpoint = checkpoints.get(`${event.botId}\0${sourceKind}`);
            if (
              checkpoint !== undefined &&
              observed.position !== undefined &&
              observed.position <= checkpoint
            )
              return;
            if (
              (selection.visibility === 'own-dm' && !ownDm) ||
              (selection.visibility !== 'all-bot' && !human)
            )
              return;
            const message = observed.message;
            if (
              message?.author.kind !== 'bot' ||
              message.author.slug !== event.botId ||
              !message.body.trim()
            )
              return;
            return {
              generation: source.activity().generation,
              botId: event.botId,
              messageId: event.messageId,
              channelId: channel.id,
              channelName: channel.name,
              body: messagePreview(message.body),
              source: sourceKind,
              participants: channel.members.map((id) => source.bot(id)?.name ?? id),
              canOpen: observed.canRead,
            };
          };
          let offActivity: (() => void) | undefined;
          let heartbeat: ReturnType<typeof setInterval> | undefined;
          const consumer = {
            reconcile() {
              const checkpoint = source.checkpoint?.();
              for (const [id, selection] of selected) {
                const current = source.bot(id);
                if (!current || current.paused !== selection.bot.paused) {
                  journal.delete(id);
                  messages.delete(id);
                  if (current) lifecycles.set(id, lifecycle(id)!);
                  else lifecycles.delete(id);
                  for (const kind of companionSources) {
                    const key = `${id}\0${kind}`;
                    if (!current) checkpoints.delete(key);
                    else if (checkpoint !== undefined) checkpoints.set(key, checkpoint);
                  }
                }
                if (current) selected.set(id, { ...selection, bot: current });
                else {
                  selected.delete(id);
                  removed.add(id);
                }
              }
              if (!multiplexed && botId && removed.has(botId)) consumer.close();
              else changed();
            },
            replace(
              selections: readonly CompanionSubscription[],
              nextCapacity: number,
              revision: number,
            ) {
              if (ended || revision < selectionRevision) return;
              const checkpoint = source.checkpoint?.();
              for (const selection of selections) {
                const previous =
                  selected.get(selection.botId) ?? recovery?.selections.get(selection.botId);
                for (const kind of companionSources) {
                  const key = `${selection.botId}\0${kind}`;
                  const same =
                    previous &&
                    companionSourceEnabled(kind, previous) &&
                    companionSourceEnabled(kind, selection) &&
                    (previous.epochs?.[kind] ?? 0) === (selection.epochs?.[kind] ?? 0);
                  const prior = same
                    ? (checkpoints.get(key) ?? recovery?.checkpoints.get(key))
                    : undefined;
                  if (prior !== undefined) checkpoints.set(key, prior);
                  else if (checkpoint !== undefined) checkpoints.set(key, checkpoint);
                }
              }
              for (const id of checkpoints.keys())
                if (!selections.some((item) => item.botId === id.split('\0')[0]))
                  checkpoints.delete(id);
              removed.clear();
              for (const selection of selections)
                lifecycles.set(selection.botId, lifecycle(selection.botId)!);
              for (const id of lifecycles.keys())
                if (!selections.some((item) => item.botId === id)) lifecycles.delete(id);
              selectionRevision = revision;
              selected = new Map(
                selections.map((selection) => [
                  selection.botId,
                  { ...selection, bot: source.bot(selection.botId)! },
                ]),
              );
              capacity = nextCapacity;
              for (const [id, queue] of messages) {
                if (!selected.get(id)?.dm && !selected.get(id)?.group) messages.delete(id);
                else
                  messages.set(
                    id,
                    queue.filter((item) => project(item) !== undefined).slice(-capacity),
                  );
              }
              for (const [id, queue] of journal) {
                const qualified = queue
                  .filter((item) => project(item) !== undefined)
                  .slice(-capacity);
                if (qualified.length) journal.set(id, qualified);
                else journal.delete(id);
              }
              const value = frame('companion/selection', snapshot());
              if ((controller.desiredSize ?? 0) > 0) write(value);
              else pendingSelection = value;
              if (awaitingSelection) {
                awaitingSelection = false;
                for (const [id, queue] of journal) if (queue.length) messages.set(id, [...queue]);
                flush?.();
              }
            },
            publish(event: PersonaBotOutputCommitted) {
              if (disposed || (ended && (!consumerId || !recoveries.has(consumerId)))) return;
              const value = project(event);
              if (!value || !value.source) return;
              const history = journal.get(event.botId) ?? [];
              const reference = {
                botId: event.botId,
                messageId: event.messageId,
                channelId: event.channelId,
                source: value.source,
                epoch: value.source ? (selected.get(event.botId)?.epochs?.[value.source] ?? 0) : 0,
              };
              if (
                history.some(
                  (item) =>
                    item.messageId === event.messageId && item.channelId === event.channelId,
                )
              )
                return;
              history.push(reference);
              journal.set(event.botId, history.slice(-capacity));
              if (ended || awaitingSelection) return;
              const text = frame('companion/message', value);
              if ((controller.desiredSize ?? 0) > 0) write(text);
              else {
                const queue = messages.get(event.botId) ?? [];
                if (
                  !queue.some(
                    (item) =>
                      item.messageId === reference.messageId &&
                      item.channelId === reference.channelId,
                  )
                )
                  queue.push(reference);
                if (queue.length > capacity) queue.shift();
                messages.set(event.botId, queue);
              }
            },
            close() {
              if (ended) return;
              ended = true;
              offActivity?.();
              if (heartbeat !== undefined) clearInterval(heartbeat);
              messages.clear();
              if (consumerId) controls.delete(consumerId);
              if (consumerId && !disposed && selected.size) {
                deadline = performance.now() + 60_000;
                expiry = setTimeout(() => {
                  recoveries.delete(consumerId);
                  consumers.delete(consumer);
                  journal.clear();
                }, 60_000);
                expiry.unref();
                const detached = [...recoveries.values()].filter((entry) => entry.detached());
                for (const entry of detached.slice(0, Math.max(0, detached.length - 128)))
                  entry.take();
              } else {
                if (consumerId) recoveries.delete(consumerId);
                consumers.delete(consumer);
                journal.clear();
              }
              try {
                controller.close();
              } catch {}
            },
          };
          finish = () => consumer.close();
          flush = () => {
            if (ended) return;
            if (pendingSelection !== undefined && (controller.desiredSize ?? 0) > 0) {
              const next = pendingSelection;
              pendingSelection = undefined;
              write(next);
            }
            if (pendingActivity !== undefined && (controller.desiredSize ?? 0) > 0) {
              const next = pendingActivity;
              pendingActivity = undefined;
              write(next);
            }
            while (messages.size && (controller.desiredSize ?? 0) > 0) {
              const next = messages.entries().next().value;
              if (!next) break;
              const [id, queue] = next;
              messages.delete(id);
              const event = queue.shift();
              if (queue.length) messages.set(id, queue);
              const value = event && project(event);
              if (value) write(frame('companion/message', value));
            }
          };
          consumers.add(consumer);
          if (consumerId) controls.set(consumerId, consumer);
          if (consumerId)
            recoveries.set(consumerId, {
              generation: source.activity().generation,
              detached: () => ended,
              available: () => performance.now() < deadline,
              take() {
                const state = {
                  capacity,
                  lifecycles: new Map(lifecycles),
                  selections: new Map(selected),
                  messages: new Map([...journal].map(([id, queue]) => [id, [...queue]])),
                  checkpoints: new Map(checkpoints),
                };
                consumer.close();
                if (expiry !== undefined) clearTimeout(expiry);
                recoveries.delete(consumerId);
                consumers.delete(consumer);
                journal.clear();
                return state;
              },
            });
          offActivity = source.onActivity(changed);
          write(frame('companion/baseline', snapshot()));
          heartbeat = setInterval(() => {
            if (!ended && (controller.desiredSize ?? 0) > 0) write(': heartbeat\n\n');
          }, 15_000);
        },
        pull() {
          flush?.();
        },
        cancel() {
          finish?.();
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
    publish(event) {
      for (const consumer of consumers) consumer.publish(event);
    },
    close() {
      disposed = true;
      for (const owner of requestSources.values()) owner.off();
      requestSources.clear();
      offIdentity?.();
      identities.clear();
      for (const consumer of consumers) consumer.close();
      for (const recovery of recoveries.values()) recovery.take();
      recoveries.clear();
    },
  };
}
