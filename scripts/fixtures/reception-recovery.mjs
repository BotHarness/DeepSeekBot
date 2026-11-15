import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDshImProvider } from '../../packages/core/dist/index.mjs';

export const name = 'qa-reception-recovery';
export const inject = ['botharness'];
export function apply(ctx, config) {
  const directory = resolve(config.directory);
  mkdirSync(directory, { recursive: true });
  const core = ctx.botharness;
  const fingerprint = 'a'.repeat(64);
  let consumer;
  let sequence = 0;
  const ready = () => !existsSync(resolve(directory, 'offline'));
  const service = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    echoVersion: 1,
    listBots: async () => [{ botId: 'synthetic-4242', channel: 'qq' }],
    listTargets: async () => [],
    describeBot: async () => ({
      version: 1,
      botId: 'synthetic-4242',
      channel: 'qq',
      connected: ready(),
      account: { fingerprint, name: 'Reception QA app' },
      capabilities: [
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: async () => {
      throw new Error('QA has no proactive route');
    },
    consumeInbound: async (_account, input) => {
      consumer = input;
      return () => {
        if (consumer === input) consumer = undefined;
      };
    },
    qualifyReplyChecked: async () => {
      throw Object.assign(new Error('No cross-app QA proof'), { code: 'stale-route' });
    },
    replyChecked: async (_account, route, _text, options) => {
      if (options.beforeSend?.() === false) throw new Error('stale-route');
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: `qa-reply-${++sequence}`,
          conversationId: route.conversationId,
        },
      };
    },
  };
  const dispose = core.externalMessaging.register(createDshImProvider(service, 'qq'));
  const execute = async (request) => {
    const bot = core.registry.get(request.botSlug);
    if (!bot?.displayName.startsWith('Reception QA')) throw new Error('QA Bot required');
    if (request.action === 'bind')
      return core.externalMessaging.identity(bot.slug, {
        kind: 'bind',
        providerId: 'dsh-im/qq',
        accountRef: 'synthetic-4242',
        fingerprint,
      });
    if (request.action !== 'mention' || !consumer) throw new Error('No QA receiver');
    const id = `qa-${Date.now()}-${++sequence}`;
    await consumer.onEvent(
      {
        version: 1,
        channel: 'qq',
        botId: 'synthetic-4242',
        fingerprint,
        eventId: id,
        messageId: id,
        actor: { kind: 'user', id: 'synthetic-human' },
        conversation: { kind: 'group', id: 'synthetic-group', name: 'Reception QA group' },
        mentions: [{ id: 'synthetic-4242', key: '@qa' }],
        mentionedAccount: true,
        at: new Date().toISOString(),
        text: 'Reception QA: acknowledge with OK.',
        reply: { messageId: id, conversationId: 'synthetic-group', actorId: 'synthetic-human' },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      },
      { signal: consumer.signal },
    );
    return { messageId: id };
  };
  let busy = false;
  let lastRequest;
  const timer = setInterval(async () => {
    const file = resolve(directory, 'command.json');
    if (busy || !existsSync(file)) return;
    const content = readFileSync(file, 'utf8');
    if (content === lastRequest) return;
    lastRequest = content;
    busy = true;
    try {
      writeFileSync(
        resolve(directory, 'response.json'),
        JSON.stringify({ ok: true, value: await execute(JSON.parse(content)) }),
      );
    } catch (error) {
      writeFileSync(
        resolve(directory, 'response.json'),
        JSON.stringify({ ok: false, error: error.message }),
      );
    } finally {
      busy = false;
    }
  }, 100);
  ctx.effect(() => () => {
    clearInterval(timer);
    dispose();
  });
}
