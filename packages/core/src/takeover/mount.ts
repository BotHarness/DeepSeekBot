import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';

import { dmChannelId, isDisbandedGroup } from '../channels/channel.js';
import { attachOperationalModule } from '../database/owner.js';
import type { DiagnosticEvents } from '../diagnostics/diagnostic-log.js';
import type { BotHarnessCore } from '../plugin.js';
import {
  TAKEOVER_DEFAULT_MINUTES,
  TAKEOVER_MAX_MINUTES,
  TAKEOVER_MESSAGE_MAX,
  TAKEOVER_TITLE_MAX,
  TakeoverError,
  type TakeoverHandoff,
  type TakeoverTarget,
} from './contracts.js';
import { createTakeoverHandoffs, type TakeoverHandoffs } from './handoffs.js';

export const TAKEOVER_TOOL_GUIDANCE = `When a step on your Computer or Bot Browser needs the Human (signing in, a password, a captcha, a payment or verification, anything you must not type yourself), call takeover_request with target computer or browser, a short title and one sentence saying exactly what you need them to do. A card with a Take over button appears in the conversation and your turn ends there: do not wait, poll or repeat the request in text. The Human may keep chatting meanwhile; answer them normally. If they say it is no longer needed, call takeover_cancel and tell them in one line that you stopped. When they finish, cannot finish or cancel, or the request expires, a [Bot Inbox: Takeover Handoff ended] item wakes you: observe the screen or page again before you act. Never ask for credentials in chat; they are typed only in the live view.`;

export function takeoverTargetDenial(
  core: Pick<BotHarnessCore, 'registry'>,
  botSlug: string,
  target: TakeoverTarget,
): string | undefined {
  const bot = core.registry.get(botSlug);
  if (bot === undefined) return 'Unknown PersonaBot';
  if (target === 'browser' && bot.browserAccess !== true)
    return 'Browser Access is off for this PersonaBot; ask the Human to turn it on first';
  if (target === 'computer' && bot.computerAccess !== true)
    return 'Computer Access is off for this PersonaBot; ask the Human to turn it on first';
  return undefined;
}

export function takeoverCanPost(
  core: Pick<BotHarnessCore, 'channels'>,
  botSlug: string,
  channelId: string,
): boolean {
  const channel = core.channels.get(channelId);
  if (channel === undefined || channel.deletedAt !== undefined) return false;
  if (channel.type === 'dm') return channel.botSlug === botSlug;
  return channel.members.includes(botSlug) && !isDisbandedGroup(channel);
}

export function createCoreTakeoverHandoffs(
  ctx: Context,
  core: BotHarnessCore,
  events?: DiagnosticEvents,
): TakeoverHandoffs {
  const handoffs = createTakeoverHandoffs({
    database: attachOperationalModule(core.operationalDatabase, 'takeover'),
    channels: core.channels,
    targetDenial: (botSlug, target) => takeoverTargetDenial(core, botSlug, target),
    canPost: (botSlug, channelId) => takeoverCanPost(core, botSlug, channelId),
    admit: (channelId, messageId, body) => {
      if (core.channels.get(channelId)?.type === 'group')
        core.runtime.admitGroupMessage(channelId, messageId);
      else core.runtime.admitDmMessage({ channelId, messageId, body });
    },
    ...(events === undefined ? {} : { events }),
    info: (format, value) => ctx.logger.info(format, value),
  });
  ctx.effect(() => () => handoffs.close(), 'botharness: takeover handoffs');
  queueMicrotask(() => {
    if (core.operationalDatabase.mode !== 'ready') return;
    void handoffs
      .recover()
      .catch((error: unknown) => ctx.logger.warn('takeover recovery failed: %s', String(error)));
  });
  return handoffs;
}

function toolView(handoff: TakeoverHandoff): Record<string, unknown> {
  return {
    id: handoff.id,
    channelId: handoff.channelId,
    target: handoff.target,
    title: handoff.title,
    status: handoff.status,
    expiresAt: handoff.expiresAt,
    ...(handoff.resolvedBy === undefined ? {} : { resolvedBy: handoff.resolvedBy }),
  };
}

async function toolResult(work: () => Promise<unknown> | unknown): Promise<string> {
  try {
    return JSON.stringify(await work());
  } catch (error) {
    if (error instanceof TakeoverError)
      return JSON.stringify({ ok: false, code: error.code, error: error.message });
    throw error;
  }
}

export function mountTakeoverTools(ctx: Context, core: BotHarnessCore, handoffs: TakeoverHandoffs) {
  ctx.effect(
    () =>
      core.contributeBotAgentSetup((agentCtx, agent, info) => {
        if (info.rootRole !== 'orchestrator') return;
        const botSlug = info.botSlug;
        agentCtx.tools.register(
          defineTool({
            name: 'takeover_request',
            description: `Ask the Human to take over your Computer or Bot Browser for one step you cannot or must not do yourself, such as signing in, a captcha or a verification code. Posts a card in the conversation (title, your one sentence, a Take over button that opens the live view) and notifies the Human if they are away. Returns at once with the request id; your turn should end without waiting. The result arrives later as a [Bot Inbox: Takeover Handoff ended] item that wakes you: done, failed (could not finish), cancelled or expired. One pending request per Bot. The request expires after ${TAKEOVER_DEFAULT_MINUTES} minutes unless you pass minutes (at most ${TAKEOVER_MAX_MINUTES}).`,
            parameters: {
              target: {
                type: 'string',
                required: true,
                description:
                  'computer for your Computer desktop, browser for your Bot Browser page.',
              },
              title: {
                type: 'string',
                required: true,
                description: `Card title naming the step, at most ${TAKEOVER_TITLE_MAX} characters, in the Human's language, e.g. "Sign in to Amazon".`,
              },
              message: {
                type: 'string',
                required: true,
                description: `One sentence to the Human saying exactly what you need them to do and when to press Done, at most ${TAKEOVER_MESSAGE_MAX} characters, in their language. Never ask them to send a password in chat.`,
              },
              channel_id: {
                type: 'string',
                description:
                  'Channel for the card. Defaults to the Channel of the current request, otherwise your Human DM.',
              },
              minutes: {
                type: 'number',
                description: `Minutes until the request expires, default ${TAKEOVER_DEFAULT_MINUTES}, at most ${TAKEOVER_MAX_MINUTES}.`,
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: (args) =>
              toolResult(async () => {
                const channelId =
                  (typeof args.channel_id === 'string' && args.channel_id.trim() !== ''
                    ? args.channel_id.trim()
                    : undefined) ??
                  core.runtime.askChannel?.(agent.session.id) ??
                  dmChannelId(botSlug);
                const handoff = await handoffs.request({
                  botSlug,
                  channelId,
                  target: args.target,
                  title: args.title,
                  message: args.message,
                  ...(args.minutes === undefined ? {} : { minutes: args.minutes }),
                  sessionId: agent.session.id,
                  initiator: 'bot',
                });
                return {
                  ok: true,
                  ...toolView(handoff),
                  next: 'The card is posted. End your turn now; the outcome will wake you.',
                };
              }),
          }),
        );
        agentCtx.tools.register(
          defineTool({
            name: 'takeover_cancel',
            description:
              'Withdraw your pending takeover request, for example when the Human says it is no longer needed or you found another way. The card shows it as cancelled. Does not wake you.',
            parameters: {
              id: {
                type: 'string',
                required: true,
                description: 'Request id from takeover_request.',
              },
              channel_id: {
                type: 'string',
                required: true,
                description: 'channelId returned by takeover_request.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: (args) =>
              toolResult(async () => ({
                ok: true,
                ...toolView(
                  await handoffs.cancel(args.channel_id, args.id, 'bot', 'bot-tool', botSlug),
                ),
              })),
          }),
        );
        agentCtx.tools.register(
          defineTool({
            name: 'takeover_list',
            description:
              'List your recent takeover requests with their status (pending, done, failed, cancelled, expired), newest first.',
            parameters: {
              pending_only: { type: 'boolean', description: 'Only pending requests.' },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: (args) =>
              toolResult(() => ({
                takeovers: handoffs
                  .list({ botSlug, pendingOnly: args.pending_only === true, limit: 20 })
                  .map(toolView),
              })),
          }),
        );
      }),
    'botharness: takeover tools',
  );
}
