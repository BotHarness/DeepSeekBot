import { randomUUID } from 'node:crypto';

import type { ChannelMessage } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { DiagnosticEvents } from '../diagnostics/diagnostic-log.js';
import {
  TAKEOVER_DEFAULT_MINUTES,
  TAKEOVER_MAX_MINUTES,
  TAKEOVER_MESSAGE_MAX,
  TAKEOVER_TITLE_MAX,
  TakeoverError,
  isTakeoverRequestCard,
  isTakeoverResolution,
  isTakeoverTarget,
  takeoverResolutionId,
  type TakeoverHandoff,
  type TakeoverOutcome,
  type TakeoverResolver,
  type TakeoverTarget,
} from './contracts.js';

export interface TakeoverRequestInput {
  botSlug: string;
  channelId: string;
  target: unknown;
  title: unknown;
  message: unknown;
  minutes?: unknown;
  sessionId?: string;
  initiator: 'bot' | 'cli';
}

export interface TakeoverListQuery {
  botSlug?: string;
  channelId?: string;
  pendingOnly?: boolean;
  limit?: number;
}

export interface TakeoverHandoffs {
  request(input: TakeoverRequestInput): Promise<TakeoverHandoff>;
  list(query?: TakeoverListQuery): TakeoverHandoff[];
  get(channelId: string, id: string): TakeoverHandoff | undefined;
  complete(
    channelId: string,
    id: string,
    outcome: 'done' | 'failed',
    surface: string,
  ): Promise<TakeoverHandoff>;
  cancel(
    channelId: string,
    id: string,
    by: 'human' | 'bot',
    surface: string,
    botSlug?: string,
  ): Promise<TakeoverHandoff>;
  recover(): Promise<void>;
  close(): void;
}

export interface TakeoverHandoffOptions {
  database: OperationalDatabaseModulePort;
  channels: Pick<ChannelStore, 'appendMessageOnce' | 'message' | 'get'>;
  targetDenial(botSlug: string, target: TakeoverTarget): string | undefined;
  canPost(botSlug: string, channelId: string): boolean;
  admit?(channelId: string, messageId: string, body: string): void;
  events?: DiagnosticEvents;
  info?(format: string, value: unknown): void;
  now?: () => number;
  createId?: () => string;
}

interface Row {
  channel_id: string;
  message_id: string;
  bot_slug: string;
  body: string;
  created_at: string;
  payload_json: string;
  resolution_json: string | null;
  resolved_at: string | null;
}

const LIST_LIMIT = 200;
const MAX_TIMER_MS = 2 ** 31 - 1;

function trimmedText(value: unknown, field: string, max: number): string {
  const text = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
  if (text === '') throw new TakeoverError('invalid-input', `${field} is required`);
  if ([...text].length > max)
    throw new TakeoverError('invalid-input', `${field} must be at most ${max} characters`);
  return text;
}

function minutesOf(value: unknown): number {
  if (value === undefined || value === null) return TAKEOVER_DEFAULT_MINUTES;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    throw new TakeoverError('invalid-input', 'minutes must be a whole number of at least 1');
  return Math.min(value, TAKEOVER_MAX_MINUTES);
}

function resolutionBody(outcome: TakeoverOutcome, by: TakeoverResolver): string {
  if (outcome === 'done') return 'Takeover done';
  if (outcome === 'failed') return 'Takeover could not finish';
  if (outcome === 'expired') return 'Takeover expired';
  return by === 'bot' ? 'Takeover cancelled by the Bot' : 'Takeover cancelled';
}

export function createTakeoverHandoffs(options: TakeoverHandoffOptions): TakeoverHandoffs {
  const now = options.now ?? Date.now;
  const createId = options.createId ?? randomUUID;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const settling = new Map<string, Promise<TakeoverHandoff>>();
  let closed = false;

  const log = (
    phase: string,
    fields: Record<string, string | number | boolean | undefined>,
    bot?: string,
  ): void => {
    options.info?.('takeover %j', { phase, ...fields });
    options.events?.record('takeover', phase, fields, bot === undefined ? {} : { bot });
  };

  const view = (row: Row): TakeoverHandoff | undefined => {
    const payload = JSON.parse(row.payload_json) as Partial<ChannelMessage>;
    const card = payload.takeoverRequest;
    if (!isTakeoverRequestCard(card)) return undefined;
    const resolution =
      row.resolution_json === null
        ? undefined
        : (JSON.parse(row.resolution_json) as Partial<ChannelMessage>).takeoverResolution;
    const resolved = isTakeoverResolution(resolution) ? resolution : undefined;
    return {
      id: row.message_id,
      channelId: row.channel_id,
      botSlug: row.bot_slug,
      target: card.target,
      title: card.title,
      message: row.body,
      createdAt: row.created_at,
      expiresAt: card.expiresAt,
      status: resolved?.outcome ?? 'pending',
      ...(resolved === undefined ? {} : { resolvedBy: resolved.by }),
      ...(resolved === undefined || row.resolved_at === null
        ? {}
        : { resolvedAt: row.resolved_at }),
    };
  };

  const query = (
    where: string,
    args: Array<string | number | null>,
    limit: number,
  ): TakeoverHandoff[] =>
    options.database
      .read(
        (db) =>
          db
            .prepare(
              `SELECT e.channel_id, e.message_id, e.bot_slug, e.body, e.created_at, e.payload_json,
                      r.payload_json AS resolution_json, r.created_at AS resolved_at
                 FROM source_events e
                 LEFT JOIN source_events r
                   ON r.channel_id = e.channel_id
                  AND r.message_id = 'takeover-resolution-' || e.message_id
                WHERE e.source_kind = 'bot-message'
                  AND json_extract(e.payload_json, '$.takeoverRequest') IS NOT NULL
                  ${where}
                ORDER BY e.rowid DESC
                LIMIT ?`,
            )
            .all(...args, limit) as unknown as Row[],
      )
      .flatMap((row) => {
        const handoff = view(row);
        return handoff === undefined ? [] : [handoff];
      });

  const find = (channelId: string, id: string): TakeoverHandoff | undefined =>
    query('AND e.channel_id = ? AND e.message_id = ?', [channelId, id], 1)[0];

  const overdue = (handoff: TakeoverHandoff): boolean =>
    handoff.status === 'pending' && Date.parse(handoff.expiresAt) <= now();

  const settle = (
    handoff: TakeoverHandoff,
    outcome: TakeoverOutcome,
    by: TakeoverResolver,
    surface: string,
  ): Promise<TakeoverHandoff> => {
    const key = `${handoff.channelId}\u0000${handoff.id}`;
    const running = settling.get(key);
    if (running !== undefined) return running;
    const work = (async () => {
      const timer = timers.get(key);
      if (timer !== undefined) clearTimeout(timer);
      timers.delete(key);
      const started = now();
      const result = await options.channels.appendMessageOnce(handoff.channelId, {
        id: takeoverResolutionId(handoff.id),
        at: new Date(now()).toISOString(),
        author:
          by === 'human'
            ? { kind: 'human' }
            : by === 'bot'
              ? { kind: 'bot', slug: handoff.botSlug }
              : { kind: 'system' },
        body: resolutionBody(outcome, by),
        replyTo: handoff.id,
        takeoverResolution: { requestMessageId: handoff.id, outcome, by },
      });
      if (result.status !== 'appended' && result.status !== 'existing') {
        log(
          'resolve-failed',
          {
            id: handoff.id,
            channel: handoff.channelId,
            outcome,
            by,
            surface,
            reason: result.status,
          },
          handoff.botSlug,
        );
        throw new TakeoverError('not-found', 'The takeover request is no longer in this Channel');
      }
      const stored = result.message.takeoverResolution;
      if (result.status === 'appended' && by !== 'bot')
        options.admit?.(handoff.channelId, result.message.id, result.message.body);
      const ended = find(handoff.channelId, handoff.id) ?? {
        ...handoff,
        status: stored?.outcome ?? outcome,
        resolvedBy: stored?.by ?? by,
        resolvedAt: result.message.at,
      };
      log(
        result.status === 'existing' ? 'resolve-existing' : outcome,
        {
          id: handoff.id,
          channel: handoff.channelId,
          target: handoff.target,
          by: stored?.by ?? by,
          surface,
          wakes: (stored?.by ?? by) !== 'bot',
          openMs:
            Math.max(0, Date.parse(ended.resolvedAt ?? '') - Date.parse(handoff.createdAt)) || 0,
          durationMs: now() - started,
        },
        handoff.botSlug,
      );
      return ended;
    })();
    settling.set(key, work);
    void work.finally(() => settling.delete(key)).catch(() => undefined);
    return work;
  };

  const arm = (handoff: TakeoverHandoff): void => {
    if (closed || handoff.status !== 'pending') return;
    const key = `${handoff.channelId}\u0000${handoff.id}`;
    const existing = timers.get(key);
    if (existing !== undefined) clearTimeout(existing);
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, Date.parse(handoff.expiresAt) - now()));
    const timer = setTimeout(() => {
      timers.delete(key);
      let current: TakeoverHandoff | undefined;
      try {
        current = find(handoff.channelId, handoff.id);
      } catch (error) {
        log(
          'timer-failed',
          {
            id: handoff.id,
            channel: handoff.channelId,
            error: error instanceof Error ? error.name : 'unknown',
          },
          handoff.botSlug,
        );
        return;
      }
      if (current === undefined || current.status !== 'pending') return;
      if (!overdue(current)) {
        arm(current);
        return;
      }
      void settle(current, 'expired', 'host', 'timer').catch(() => undefined);
    }, delay);
    timer.unref?.();
    timers.set(key, timer);
  };

  const pendingOf = (channelId: string, id: string): TakeoverHandoff => {
    const handoff = find(channelId, id);
    if (handoff === undefined)
      throw new TakeoverError('not-found', 'No takeover request with this id in this Channel');
    if (overdue(handoff)) {
      void settle(handoff, 'expired', 'host', 'lazy').catch(() => undefined);
      throw new TakeoverError('not-pending', 'The takeover request has expired');
    }
    if (handoff.status !== 'pending')
      throw new TakeoverError(
        'not-pending',
        `The takeover request already ended (${handoff.status})`,
      );
    return handoff;
  };

  return {
    async request(input) {
      const started = now();
      const fail = (error: TakeoverError): never => {
        log(
          'request-refused',
          {
            initiator: input.initiator,
            channel: input.channelId,
            target: typeof input.target === 'string' ? input.target.slice(0, 20) : undefined,
            reason: error.code,
          },
          input.botSlug,
        );
        throw error;
      };
      try {
        if (!isTakeoverTarget(input.target))
          throw new TakeoverError('invalid-input', 'target must be computer or browser');
        const title = trimmedText(input.title, 'title', TAKEOVER_TITLE_MAX);
        const message = trimmedText(input.message, 'message', TAKEOVER_MESSAGE_MAX);
        const minutes = minutesOf(input.minutes);
        const denial = options.targetDenial(input.botSlug, input.target);
        if (denial !== undefined) throw new TakeoverError('target-off', denial);
        if (!options.canPost(input.botSlug, input.channelId))
          throw new TakeoverError(
            'channel-unavailable',
            'This Bot cannot post a takeover card in that Channel',
          );
        const pending = query('AND e.bot_slug = ?', [input.botSlug], LIST_LIMIT).find(
          (handoff) => handoff.status === 'pending' && !overdue(handoff),
        );
        if (pending !== undefined)
          throw new TakeoverError(
            'already-pending',
            `Takeover ${pending.id} in Channel ${pending.channelId} is still pending; cancel it first or wait for its result`,
          );
        const id = createId();
        const expiresAt = new Date(now() + minutes * 60_000).toISOString();
        const result = await options.channels.appendMessageOnce(input.channelId, {
          id,
          at: new Date(now()).toISOString(),
          author: { kind: 'bot', slug: input.botSlug },
          body: message,
          takeoverRequest: {
            target: input.target,
            title,
            expiresAt,
            ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
          },
        });
        if (result.status !== 'appended')
          throw new TakeoverError('channel-unavailable', 'The takeover card could not be posted');
        const handoff = find(input.channelId, id) ?? {
          id,
          channelId: input.channelId,
          botSlug: input.botSlug,
          target: input.target,
          title,
          message,
          createdAt: result.message.at,
          expiresAt,
          status: 'pending' as const,
        };
        arm(handoff);
        log(
          'requested',
          {
            id,
            channel: input.channelId,
            target: input.target,
            initiator: input.initiator,
            session: input.sessionId,
            minutes,
            titleChars: [...title].length,
            messageChars: [...message].length,
            durationMs: now() - started,
          },
          input.botSlug,
        );
        return handoff;
      } catch (error) {
        if (error instanceof TakeoverError) return fail(error);
        log(
          'request-failed',
          {
            initiator: input.initiator,
            channel: input.channelId,
            error: String(error).slice(0, 200),
          },
          input.botSlug,
        );
        throw error;
      }
    },

    list(query_ = {}) {
      const where: string[] = [];
      const args: string[] = [];
      if (query_.botSlug !== undefined) {
        where.push('AND e.bot_slug = ?');
        args.push(query_.botSlug);
      }
      if (query_.channelId !== undefined) {
        where.push('AND e.channel_id = ?');
        args.push(query_.channelId);
      }
      const limit = Math.max(1, Math.min(LIST_LIMIT, Math.round(query_.limit ?? 50)));
      const rows = query(where.join(' '), args, query_.pendingOnly === true ? LIST_LIMIT : limit);
      for (const handoff of rows)
        if (overdue(handoff))
          void settle(handoff, 'expired', 'host', 'lazy').catch(() => undefined);
      const shown = rows.map((handoff) =>
        overdue(handoff)
          ? { ...handoff, status: 'expired' as const, resolvedBy: 'host' as const }
          : handoff,
      );
      return (
        query_.pendingOnly === true
          ? shown.filter((handoff) => handoff.status === 'pending')
          : shown
      ).slice(0, limit);
    },

    get(channelId, id) {
      const handoff = find(channelId, id);
      if (handoff === undefined || !overdue(handoff)) return handoff;
      void settle(handoff, 'expired', 'host', 'lazy').catch(() => undefined);
      return { ...handoff, status: 'expired', resolvedBy: 'host' };
    },

    async complete(channelId, id, outcome, surface) {
      try {
        return await settle(pendingOf(channelId, id), outcome, 'human', surface);
      } catch (error) {
        if (error instanceof TakeoverError)
          log('complete-refused', { id, channel: channelId, outcome, surface, reason: error.code });
        throw error;
      }
    },

    async cancel(channelId, id, by, surface, botSlug) {
      try {
        const handoff = pendingOf(channelId, id);
        if (by === 'bot' && handoff.botSlug !== botSlug)
          throw new TakeoverError('not-found', 'No takeover request of this Bot with this id');
        return await settle(handoff, 'cancelled', by, surface);
      } catch (error) {
        if (error instanceof TakeoverError)
          log(
            'cancel-refused',
            { id, channel: channelId, by, surface, reason: error.code },
            botSlug,
          );
        throw error;
      }
    },

    async recover() {
      const pending = query('AND r.message_id IS NULL', [], LIST_LIMIT);
      let expired = 0;
      for (const handoff of pending) {
        if (overdue(handoff)) {
          expired += 1;
          await settle(handoff, 'expired', 'host', 'recover').catch(() => undefined);
        } else arm(handoff);
      }
      if (pending.length > 0) log('recovered', { pending: pending.length - expired, expired });
    },

    close() {
      closed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
