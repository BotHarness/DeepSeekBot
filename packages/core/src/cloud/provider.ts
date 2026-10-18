import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { CloudConnections } from './connections.js';
import { ClientError } from './instance-contract.js';
import {
  parseWorkMessage,
  parseWorkResult,
  type WorkRequest,
  type WorkResult,
} from './work-contract.js';
import {
  MessagingProviderError,
  type MessagingProvider,
  type MessagingInboundEvent,
} from '../messaging/provider.js';
type Consumer = Parameters<NonNullable<MessagingProvider['consume']>>[0];
type Message = {
  sequence: number;
  authorId: string;
  authorType: 'human' | 'agent';
  text: string;
  createdAt: string;
  kind: 'text' | 'work_request' | 'work_result';
  work?: WorkRequest;
  result?: WorkResult;
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ClientError('INVALID_CLOUD_MESSAGE');
  return value as Record<string, unknown>;
}
function parseMessage(value: unknown): Message {
  const m = object(value);
  if (
    !Number.isSafeInteger(m.sequence) ||
    Number(m.sequence) < 1 ||
    !['human', 'agent'].includes(String(m.authorType)) ||
    typeof m.authorId !== 'string' ||
    !(m.authorType === 'human' ? /^user_[A-Za-z0-9]+$/ : /^ag_[a-f0-9]{64}$/).test(m.authorId) ||
    typeof m.text !== 'string' ||
    !m.text.trim() ||
    m.text.length > 4000 ||
    typeof m.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(m.createdAt)) ||
    new Date(m.createdAt).toISOString() !== m.createdAt ||
    !['text', 'work_request', 'work_result'].includes(String(m.kind))
  )
    throw new ClientError('INVALID_CLOUD_MESSAGE');
  if (m.kind === 'text' && m.payload !== null) throw new ClientError('INVALID_CLOUD_MESSAGE');
  const work = m.kind === 'work_request' ? parseWorkMessage(m) : undefined;
  const result = m.kind === 'work_result' ? parseWorkResult(m.payload) : undefined;
  if (result && m.authorType !== 'agent') throw new ClientError('INVALID_CLOUD_MESSAGE');
  return {
    sequence: Number(m.sequence),
    authorId: m.authorId,
    authorType: m.authorType as Message['authorType'],
    text: m.text,
    createdAt: m.createdAt,
    kind: m.kind as Message['kind'],
    ...(work ? { work } : {}),
    ...(result ? { result } : {}),
  };
}
export async function pollCloudPage(owner: CloudConnections, input: Consumer): Promise<boolean> {
  const initial = owner.current(input.accountRef),
    connection = initial.connection;
  if (connection.fingerprint !== input.fingerprint)
    throw new ClientError('CLOUD_CONNECTION_CHANGED');
  const page = await owner.call(connection.id, '/messages?after=' + initial.cursor, input.signal);
  if (
    !Array.isArray(page.messages) ||
    page.messages.length > 50 ||
    typeof page.hasMore !== 'boolean' ||
    !Number.isSafeInteger(page.nextCursor) ||
    Number(page.nextCursor) < initial.cursor
  )
    throw new ClientError('INVALID_CLOUD_MESSAGE');
  const messages = page.messages.map(parseMessage);
  let previous = initial.cursor;
  for (const m of messages) {
    if (m.sequence <= previous || (m.work && m.work.channelId !== connection.channelId))
      throw new ClientError('INVALID_CLOUD_MESSAGE');
    previous = m.sequence;
  }
  if (Number(page.nextCursor) !== previous || (page.hasMore && messages.length === 0))
    throw new ClientError('INVALID_CLOUD_MESSAGE');
  let cursor = initial.cursor;
  for (const m of messages) {
    input.signal.throwIfAborted();
    owner.current(connection.id);
    const messageId = String(m.sequence);
    if (m.authorType === 'agent' && m.authorId === connection.actorId) {
      if (!input.onEcho) throw new ClientError('CLOUD_CONSUMER_UNAVAILABLE');
      await input.onEcho(
        {
          version: 1,
          botId: connection.id,
          fingerprint: connection.fingerprint,
          eventId: messageId,
          messageId,
          conversationId: connection.channelId,
          text: m.text,
          at: m.createdAt,
        },
        input.signal,
      );
    } else {
      const targeted =
        m.work?.targetActorId === connection.actorId &&
        owner.current(connection.id).policy.allowedUsers.includes(m.work.requesterUserId);
      const event: MessagingInboundEvent = {
        version: 1,
        channel: 'tob',
        botId: connection.id,
        fingerprint: connection.fingerprint,
        eventId: messageId,
        messageId,
        actor: { kind: m.authorType === 'agent' ? 'agent' : 'user', id: m.authorId },
        conversation: { kind: 'group', id: connection.channelId },
        mentions: targeted
          ? [{ id: connection.actorId, key: '@' + connection.actorId, name: connection.name }]
          : [],
        mentionedAccount: targeted,
        at: m.createdAt,
        text: m.text,
        reply: { messageId, conversationId: connection.channelId, actorId: m.authorId },
        replay: { kind: 'durable-channel-history', resumeCursor: true, gapPossible: false },
        ...(m.work ? { cloudWork: m.work } : {}),
      };
      await input.onEvent(event, input.signal);
    }
    input.signal.throwIfAborted();
    owner.advance(connection.id, cursor, m.sequence);
    cursor = m.sequence;
  }
  return page.hasMore;
}
export function createCloudProvider(
  owner: CloudConnections,
  log: (phase: string, id: string, code?: string) => void = () => {},
): MessagingProvider {
  const account = async (id: string) => {
    const c = owner.current(id).connection;
    let connected = true;
    try {
      await owner.secret(id);
    } catch {
      connected = false;
    }
    return {
      ref: c.id,
      platform: 'tob',
      name: c.name,
      fingerprint: c.fingerprint,
      connected,
      postSupported: true,
    };
  };
  const target = (id: string) => {
    const c = owner.current(id).connection;
    return {
      ref: c.channelId,
      name: c.channelId,
      digest: c.fingerprint,
      receiveScope: { kind: 'group' as const, conversationId: c.channelId },
    };
  };
  type Send = {
    accountRef: string;
    fingerprint: string;
    text: string;
    signal: AbortSignal;
    operationId?: string;
    beforeSend?: () => boolean;
  };
  const send = async (input: Send, channelId: string) => {
    const c = owner.current(input.accountRef).connection;
    if (
      c.fingerprint !== input.fingerprint ||
      channelId !== c.channelId ||
      !input.operationId ||
      input.operationId.length > 200 ||
      !input.beforeSend ||
      !input.beforeSend() ||
      !input.text.trim() ||
      input.text.length > 4000
    )
      throw new MessagingProviderError('cloud-send-refused', 'not-started');
    const operationId = 'host-' + createHash('sha256').update(input.operationId).digest('hex');
    try {
      const value = await owner.call(
        c.id,
        '/messages',
        input.signal,
        { text: input.text },
        operationId,
        input.beforeSend,
      );
      const message = parseMessage(value.message);
      if (
        message.authorId !== c.actorId ||
        message.authorType !== 'agent' ||
        message.kind !== 'text' ||
        message.text !== input.text ||
        typeof value.replayed !== 'boolean'
      )
        throw new ClientError('INVALID_CLOUD_MESSAGE');
      return {
        accepted: true as const,
        receipt: {
          version: 1 as const,
          messageId: String(message.sequence),
          conversationId: c.channelId,
        },
      };
    } catch (error) {
      throw new MessagingProviderError(
        error instanceof ClientError ? error.code : 'cloud-unavailable',
        'unknown',
      );
    }
  };
  return {
    id: 'botharness/tob',
    async accounts() {
      return Promise.all(
        owner
          .list()
          .filter((v) => v.active)
          .map((v) => account(v.connection.id)),
      );
    },
    async inspectAccount(id) {
      return account(id);
    },
    async targets(id) {
      return [target(id)];
    },
    async inspect(id, ref) {
      const t = target(id);
      if (t.ref !== ref) throw new ClientError('INVALID_CLOUD_TARGET');
      return { account: await account(id), target: t };
    },
    async consume(input) {
      const controller = new AbortController(),
        signal = AbortSignal.any([input.signal, controller.signal]);
      signal.throwIfAborted();
      owner.current(input.accountRef);
      let last = '';
      void (async () => {
        while (!signal.aborted) {
          let wait = 3000;
          try {
            const more = await pollCloudPage(owner, { ...input, signal });
            if (last !== 'connected') {
              last = 'connected';
              log('connected', input.accountRef);
            }
            if (more) wait = 0;
          } catch (error) {
            if (signal.aborted) break;
            const code = error instanceof ClientError ? error.code : 'CLOUD_CONSUMER_UNAVAILABLE';
            if (last !== code) {
              last = code;
              log('retrying', input.accountRef, code);
            }
            wait = 15000;
          }
          try {
            await delay(wait, undefined, { signal, ref: false });
          } catch {
            break;
          }
        }
      })().catch(() => log('consumer-stopped', input.accountRef));
      return () => controller.abort();
    },
    async reply(input) {
      return send(input, input.route.conversationId);
    },
    async postConversation(input) {
      return send(input, input.conversationId);
    },
    async post(input) {
      if (input.targetRef !== input.conversationId || input.targetDigest !== input.fingerprint)
        throw new MessagingProviderError('cloud-target-changed', 'not-started');
      return send(input, input.conversationId);
    },
    async send(input) {
      if (input.targetDigest !== input.fingerprint)
        throw new MessagingProviderError('cloud-target-changed', 'not-started');
      return send(input, input.targetRef);
    },
  };
}
