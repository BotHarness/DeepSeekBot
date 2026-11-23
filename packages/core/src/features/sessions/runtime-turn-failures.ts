import { randomUUID } from 'node:crypto';

import type { PersonaBotRegistry } from '../../bots/registry.js';
import {
  isBotDmChannel,
  type ChannelTurnStop,
  type SessionFailureProgress,
} from '../../channels/channel.js';
import type { ChannelStore } from '../../channels/store.js';
import { EngineLimitError } from '../../engines/engine-session.js';
import { humanContext, OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import type { ModelSwitch } from '../../models/group-fallback.js';
import type { BotHoldCause } from '../../runtime/bot-runtime.js';
import {
  type createOrchestratorContinuation,
  RouteRestingError,
} from '../../runtime/orchestrator-continuation.js';
import type { createOrchestratorScheduling } from '../../runtime/orchestrator-scheduling.js';
import { botOwner } from '../../team/bot-access.js';

export function sessionFailureDetails(error: unknown): {
  code?: string;
  status?: number;
  detail: string;
} {
  const raw = error instanceof Error ? error.message : String(error);
  const clean = Array.from(raw, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? ' ' : character;
  })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 600);
  const match = /^([A-Z][A-Z0-9_-]{1,31}):\s*(.+)$/u.exec(clean);
  const detail = (match?.[2] ?? clean) || 'Unknown session error';
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;
  return {
    ...(typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? { code: error.code }
      : match === null
        ? {}
        : { code: match[1] }),
    ...(typeof status === 'number' ? { status } : {}),
    detail,
  };
}

const CONTEXT_WINDOW_EXCEEDED_NOTICE =
  "This conversation's context is full and automatic compaction could not recover it. Retry with a smaller request, for example ask for one part of a large file or command output instead of all of it.";

function sessionFailureBody(details: { code?: string; detail: string }): string {
  if (details.code === 'CONTEXT_WINDOW_EXCEEDED')
    return `Session failed: CONTEXT_WINDOW_EXCEEDED: ${CONTEXT_WINDOW_EXCEEDED_NOTICE}`;
  return `Session failed: ${details.code === undefined ? '' : details.code + ': '}${details.detail}`;
}

export const TRANSIENT_FAILURE_CODES = new Set([
  'TRANSPORT',
  'TIMEOUT',
  'SERVER',
  'RATE_LIMIT',
  'EMPTY_RESPONSE',
]);

const FAILURE_HOLD_THRESHOLD = 3;

interface TurnFailuresPorts {
  channels: ChannelStore;
  continuation: ReturnType<typeof createOrchestratorContinuation>;
  currentOrchestratorSessionId: (botSlug: string) => string | undefined;
  digestFailureCount: Map<string, number>;
  digestRetryAt: Map<string, number>;
  digestTimers: Map<string, NodeJS.Timeout>;
  failureStreaks: Map<string, number>;
  held: Map<string, BotHoldCause>;
  inboxFactoryRetries: Map<string, { attempts: number; timer?: NodeJS.Timeout }>;
  now: () => Date;
  registry: PersonaBotRegistry;
  scheduling: ReturnType<typeof createOrchestratorScheduling>;
  snoozeTimers: Map<string, NodeJS.Timeout>;
  triageQueued: Set<string>;
  warn: ((message: string) => void) | undefined;
}

export function createTurnFailures(ports: TurnFailuresPorts) {
  function heldCause(botSlug: string): BotHoldCause | undefined {
    return ports.held.get(botSlug);
  }

  function releaseQuotaHold(botSlug: string): boolean {
    if (ports.held.get(botSlug) !== 'quota') return false;
    release(botSlug);
    return true;
  }

  function hold(botSlug: string, cause: BotHoldCause): void {
    ports.held.set(botSlug, cause);
    ports.triageQueued.delete(botSlug);
    for (const [key, timer] of ports.digestTimers)
      if (key.startsWith(`${botSlug}:`) || key === `external:${botSlug}`) {
        clearTimeout(timer);
        ports.digestTimers.delete(key);
      }
    const snooze = ports.snoozeTimers.get(botSlug);
    if (snooze !== undefined) clearTimeout(snooze);
    ports.snoozeTimers.delete(botSlug);
    const retry = ports.inboxFactoryRetries.get(botSlug);
    if (retry?.timer !== undefined) clearTimeout(retry.timer);
    ports.inboxFactoryRetries.delete(botSlug);
  }

  function release(botSlug: string): void {
    ports.failureStreaks.delete(botSlug);
    if (!ports.held.delete(botSlug)) return;
    for (const key of ports.digestRetryAt.keys())
      if (key.startsWith(`${botSlug}:`)) {
        ports.digestRetryAt.delete(key);
        ports.digestFailureCount.delete(key);
      }
    ports.scheduling.resumeAutomaticWakes(botSlug);
  }

  async function appendModelSwitch(
    botSlug: string,
    sessionId: string,
    channelId: string | undefined,
    choice: ModelSwitch,
  ): Promise<void> {
    const bot = ports.registry.get(botSlug);
    if (bot === undefined) return;
    const original = channelId === undefined ? undefined : ports.channels.get(channelId);
    const channel =
      original !== undefined &&
      !isBotDmChannel(original) &&
      (original.type !== 'group' || original.members.includes(botSlug))
        ? original.id
        : ports.channels.getOrCreateDm(humanContext(botOwner(bot)), botSlug, bot.displayName)?.id;
    if (channel === undefined) return;
    await ports.channels
      .appendMessage(OWNER_HUMAN_CONTEXT, channel, {
        id: `model-switch-${randomUUID()}`,
        at: ports.now().toISOString(),
        author: { kind: 'system' },
        body: '',
        modelSwitch: {
          botSlug,
          botName: bot.displayName,
          sessionId,
          from: { provider: choice.from.provider, model: choice.from.model },
          to: { provider: choice.to.provider, model: choice.to.model },
          reason: choice.reason,
          ...(choice.until === undefined ? {} : { until: choice.until }),
        },
      })
      .catch(() => undefined);
  }

  async function holdForRestingRoute(
    botSlug: string,
    channelId: string | undefined,
    error: unknown,
  ): Promise<boolean> {
    const rests = ports.continuation.restsOf(botSlug, error);
    if (rests === undefined || rests.length === 0) return false;
    const sessionId = ports.currentOrchestratorSessionId(botSlug);
    if (!(error instanceof RouteRestingError) && sessionId !== undefined) {
      const fallback = await ports.continuation.fallBack(botSlug, sessionId, channelId, error);
      if (fallback !== undefined && 'kind' in fallback) {
        ports.failureStreaks.delete(botSlug);
        return true;
      }
    }
    const rest = rests[0]!;
    if (ports.held.has(botSlug)) return true;
    ports.failureStreaks.delete(botSlug);
    hold(botSlug, 'quota');
    if (error instanceof RouteRestingError && error.subscription !== undefined) {
      await appendHoldNotice(
        botSlug,
        channelId,
        `${ports.registry.get(botSlug)?.displayName ?? botSlug} paused: all Routing Group targets are resting. Try again after ${rest.until}.`,
        {
          cause: 'quota',
          rests: rests.slice(0, 32),
          engine: error.subscription,
          routingGroup: true,
        },
      );
      return true;
    }
    if (error instanceof EngineLimitError) {
      ports.warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'engine-limit-hold',
          botSlug,
          engine: error.engine,
          until: error.until,
        }),
      );
      const name = ports.registry.get(botSlug)?.displayName ?? botSlug;
      await appendHoldNotice(
        botSlug,
        channelId,
        `${name} paused: the ${error.engine} subscription (${error.account}) is used up until ${error.until}. Switch it to an API model, or message it after the reset.`,
        {
          cause: 'quota',
          rests: error.rests.map(({ provider, model, until }) => ({ provider, model, until })),
          engine: { engine: error.engine, account: error.account, until: error.until },
        },
      );
      return true;
    }
    ports.warn?.(
      JSON.stringify({
        component: 'bot-runtime',
        event: 'quota-hold',
        botSlug,
        provider: rest.provider,
        model: rest.model,
        until: rest.until,
      }),
    );
    await appendHoldNotice(
      botSlug,
      channelId,
      `${ports.registry.get(botSlug)?.displayName ?? botSlug} paused: ${rests.map((item) => `${item.provider}/${item.model} rests until ${item.until}`).join('; ')}. Send it a message to try again.`,
      {
        cause: 'quota',
        rests: rests.map(({ provider, model, until }) => ({ provider, model, until })),
      },
    );
    return true;
  }

  async function appendHoldNotice(
    botSlug: string,
    channelId: string | undefined,
    body: string,
    stop: Pick<ChannelTurnStop, 'cause' | 'failures' | 'rests' | 'engine' | 'routingGroup'>,
  ): Promise<void> {
    const bot = ports.registry.get(botSlug);
    const sessionId = ports.currentOrchestratorSessionId(botSlug);
    const original = channelId === undefined ? undefined : ports.channels.get(channelId);
    const channel =
      original === undefined ||
      isBotDmChannel(original) ||
      (original.type === 'group' && !original.members.includes(botSlug))
        ? bot === undefined
          ? undefined
          : ports.channels.getOrCreateDm(
              humanContext(botOwner(ports.registry.get(botSlug)!)),
              botSlug,
              bot.displayName,
            )?.id
        : original.id;
    if (bot === undefined || sessionId === undefined || channel === undefined) return;
    await ports.channels
      .appendMessage(OWNER_HUMAN_CONTEXT, channel, {
        id: `turn-stopped-${randomUUID()}`,
        at: ports.now().toISOString(),
        author: { kind: 'system' },
        body,
        turnStop: {
          botSlug,
          botName: bot.displayName,
          humanName:
            ports.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, channel)[0]?.displayName ??
            'Human',
          sessionId,
          held: true,
          ...stop,
        },
      })
      .catch(() => undefined);
  }

  async function noteAutomaticFailure(
    botSlug: string,
    channelId: string | undefined,
    error: unknown,
  ): Promise<void> {
    const code = sessionFailureDetails(error).code;
    if (ports.held.has(botSlug)) return;
    if (await holdForRestingRoute(botSlug, channelId, error)) return;
    if (code === undefined || TRANSIENT_FAILURE_CODES.has(code)) {
      ports.failureStreaks.delete(botSlug);
      return;
    }
    const streak = (ports.failureStreaks.get(botSlug) ?? 0) + 1;
    ports.failureStreaks.set(botSlug, streak);
    if (streak < FAILURE_HOLD_THRESHOLD) return;
    ports.failureStreaks.delete(botSlug);
    hold(botSlug, 'failures');
    ports.warn?.(
      JSON.stringify({ component: 'bot-runtime', event: 'failure-hold', botSlug, code, streak }),
    );
    await appendHoldNotice(
      botSlug,
      channelId,
      `${ports.registry.get(botSlug)?.displayName ?? botSlug} stopped after ${streak} failed runs in a row (${code}). Send it a message to try again.`,
      { cause: 'failures', failures: streak },
    );
  }

  async function publishSessionFailure(input: {
    channelId: string;
    requestMessageId?: string;
    botSlug: string;
    sessionId: string;
    role: 'orchestrator' | 'assignment';
    error: unknown;
    context?: string;
    assignmentAnswerTo?: string;
    progress?: SessionFailureProgress | undefined;
    autoContinue?: { attempt: number; maxAttempts: number; at: string };
  }): Promise<void> {
    if (input.error instanceof RouteRestingError) return;
    if (
      input.role === 'orchestrator' &&
      input.error instanceof EngineLimitError &&
      (await holdForRestingRoute(input.botSlug, input.channelId, input.error))
    )
      return;
    const details = sessionFailureDetails(input.error);
    const failure = {
      role: input.role,
      sessionId: input.sessionId,
      ...details,
      ...(input.progress === undefined ? {} : { progress: input.progress }),
      ...(input.autoContinue === undefined ? {} : { autoContinue: input.autoContinue }),
      ...(input.context === undefined ? {} : { context: input.context }),
      ...(input.assignmentAnswerTo === undefined
        ? {}
        : { assignmentAnswerTo: input.assignmentAnswerTo }),
    };
    const original = ports.channels.get(input.channelId);
    const target =
      original !== undefined &&
      (isBotDmChannel(original) ||
        (original.type === 'group' && !original.members.includes(input.botSlug)))
        ? ports.channels.getOrCreateDm(
            humanContext(botOwner(ports.registry.get(input.botSlug)!)),
            input.botSlug,
            ports.registry.get(input.botSlug)?.displayName ?? input.botSlug,
          )
        : original;
    if (target === undefined)
      throw new Error('Could not publish Session failure: Channel is missing');
    const result = await ports.channels.appendMessage(OWNER_HUMAN_CONTEXT, target.id, {
      id: `session-failure-${randomUUID()}`,
      at: ports.now().toISOString(),
      author: { kind: 'bot', slug: input.botSlug },
      body: sessionFailureBody(details),
      format: 'text',
      sessionFailure: {
        ...failure,
        ...(input.requestMessageId === undefined
          ? {}
          : { requestMessageId: input.requestMessageId }),
      },
    });
    if (result === undefined) {
      throw new Error('Could not publish Session failure: Channel is missing');
    }
  }

  return {
    heldCause,
    releaseQuotaHold,
    release,
    appendModelSwitch,
    holdForRestingRoute,
    noteAutomaticFailure,
    publishSessionFailure,
  };
}
