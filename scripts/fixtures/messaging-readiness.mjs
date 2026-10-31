import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setImmediate as tick } from 'node:timers/promises';
import { createDshImProvider } from '../../packages/core/dist/index.mjs';

export const name = 'qa-messaging-readiness';
export const inject = ['botharness'];
export function apply(ctx, config) {
  const directory = resolve(config.directory);
  mkdirSync(directory, { recursive: true });
  const core = ctx.botharness;
  const fingerprint = 'a'.repeat(64);
  let consumer;
  let sequence = 0;
  const generation = randomUUID();
  let grant;
  const replies = [];
  const provider = createDshImProvider({
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'synthetic-3261', channel: 'feishu' }],
    listTargets: async () => [
      {
        targetId: 'synthetic-group',
        name: 'Synthetic QA group',
        kind: 'group',
        route: { chatId: 'synthetic-group' },
      },
    ],
    describeBot: async () => ({
      version: 1,
      botId: 'synthetic-3261',
      channel: 'feishu',
      connected: true,
      account: { fingerprint, name: 'Synthetic QA' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    consumeInbound: async (_account, options) => {
      consumer = options;
      return () => {};
    },
    qualifyReplyChecked: async (_account, route) => route,
    replyChecked: async (_account, route, text, options) => {
      if (options.beforeSend?.() === false) throw new Error('stale-route');
      replies.push({ messageId: route.messageId, text });
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: 'synthetic-reply-' + ++sequence,
          conversationId: route.conversationId,
        },
      };
    },
  });
  const dispose = core.externalMessaging.register(provider);
  let busy = false;
  const command = resolve(directory, 'command.json');
  const response = resolve(directory, 'response.json');
  const execute = async (request) => {
    const bot = core.registry.get(request.botSlug);
    if (!bot?.displayName.startsWith('Reception QA')) throw new Error('QA Bot required');
    if (request.action === 'replies') return replies;
    if (request.action === 'prepare') {
      const target = (await core.externalMessaging.targets(provider.id, 'synthetic-3261'))[0];
      grant =
        (await core.externalMessaging.snapshot(bot.slug)).grants.find(
          (candidate) =>
            candidate.providerId === provider.id &&
            candidate.accountRef === 'synthetic-3261' &&
            candidate.targetRef === target.ref,
        ) ??
        (await core.externalMessaging.authorize({
          botSlug: bot.slug,
          providerId: provider.id,
          accountRef: 'synthetic-3261',
          targetRef: target.ref,
          fingerprint,
          targetDigest: target.digest,
        }));
      await core.externalMessaging.inbound.setEnabled(bot.slug, grant.id, true);
      return { prepared: true };
    }
    if (!grant || !consumer) throw new Error('QA Provider not prepared');
    if (request.action === 'query')
      return {
        pending: core.externalMessaging.inbound.pendingExternal(bot.slug, new Date()),
        attention: core.attention.list({ botSlug: bot.slug }).items,
        replies,
      };
    if (!['ordinary', 'mention', 'policy'].includes(request.action))
      throw new Error('Unknown action');
    if (request.action === 'policy') {
      await core.externalMessaging.inbound.setPolicy(
        bot.slug,
        grant.id,
        { collection: 'all', wake: 'digest', count: 2, intervalSeconds: 600 },
        { kind: 'human' },
      );
      return { configured: true };
    }
    const id = 'synthetic-3261-' + generation + '-' + ++sequence;
    const mentioned = request.action === 'mention';
    await consumer.onEvent(
      {
        version: 1,
        channel: 'feishu',
        botId: 'synthetic-3261',
        fingerprint,
        eventId: id,
        messageId: id,
        actor: { kind: 'user', id: 'synthetic-human' },
        conversation: { kind: 'group', id: 'synthetic-group' },
        mentions: mentioned ? [{ id: 'synthetic-bot', key: '@bot' }] : [],
        mentionedAccount: mentioned,
        at: new Date().toISOString(),
        text: request.text ?? 'Synthetic ordinary context. No reply or action needed.',
        reply: { messageId: id, conversationId: 'synthetic-group', actorId: 'synthetic-human' },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      },
      { signal: consumer.signal },
    );
    await tick();
    return {
      messageId: id,
      pending: core.externalMessaging.inbound.pendingExternal(bot.slug, new Date()),
    };
  };

  const timer = setInterval(async () => {
    if (busy || !existsSync(command)) return;
    busy = true;
    try {
      const request = JSON.parse(readFileSync(command, 'utf8'));
      unlinkSync(command);
      const result = await execute(request);
      writeFileSync(response, JSON.stringify({ ok: true, result }));
    } catch (error) {
      writeFileSync(response, JSON.stringify({ ok: false, error: error.message }));
    } finally {
      busy = false;
    }
  }, 100);
  ctx.effect(() => () => {
    clearInterval(timer);
    dispose();
  });
}
