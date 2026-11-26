import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDshImProvider } from '../../packages/core/dist/index.mjs';

export const name = 'qa-phone-im-pairing';
export const inject = ['botharness'];
export function apply(ctx, config) {
  const directory = resolve(config.directory);
  mkdirSync(directory, { recursive: true });
  const core = ctx.botharness;
  const fingerprint = 'b'.repeat(64);
  const notices = [];
  let consumer;
  let sequence = 0;
  const service = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    echoVersion: 1,
    listBots: async () => [{ botId: 'phone-qa-7001', channel: 'feishu' }],
    listTargets: async () => [],
    describeBot: async () => ({
      version: 1,
      botId: 'phone-qa-7001',
      channel: 'feishu',
      connected: true,
      account: { fingerprint, name: 'Phone QA app' },
      capabilities: [
        'exclusive-text-consumer',
        'proactive-text-checked',
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
    replyChecked: async (_account, route, text, options) => {
      if (options.beforeSend?.() === false) throw new Error('stale-route');
      notices.push({ conversationId: route.conversationId, text });
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
  const dispose = core.externalMessaging.register(createDshImProvider(service, 'feishu'));
  const execute = async (request) => {
    if (request.action === 'notices') return { notices };
    if (request.action !== 'dm') throw new Error('Unknown QA action');
    if (!consumer) throw new Error('No QA receiver');
    const id = `qa-${Date.now()}-${++sequence}`;
    const conversationId = `oc_${request.actorId.replace(/^ou_/, '')}`;
    await consumer.onEvent(
      {
        version: 1,
        channel: 'feishu',
        botId: 'phone-qa-7001',
        fingerprint,
        eventId: id,
        messageId: id,
        actor: { kind: 'user', id: request.actorId, name: request.actorName },
        conversation: { kind: 'dm', id: conversationId },
        mentions: [],
        mentionedAccount: false,
        at: new Date().toISOString(),
        text: request.text ?? 'Hello',
        reply: { messageId: id, conversationId, actorId: request.actorId },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      },
      { signal: consumer.signal },
    );
    return { messageId: id };
  };
  let busy = false;
  let lastRequest;
  const poll = async () => {
    const file = resolve(directory, 'command.json');
    if (busy || !existsSync(file)) return;
    const content = readFileSync(file, 'utf8');
    if (content === lastRequest) return;
    lastRequest = content;
    busy = true;
    try {
      writeFileSync(
        resolve(directory, 'response.json'),
        JSON.stringify({
          ok: true,
          id: JSON.parse(content).id,
          value: await execute(JSON.parse(content)),
        }),
      );
    } catch (error) {
      writeFileSync(
        resolve(directory, 'response.json'),
        JSON.stringify({ ok: false, id: JSON.parse(content).id, error: error.message }),
      );
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => {
    poll().catch(() => undefined);
  }, 100);
  ctx.effect(() => () => {
    clearInterval(timer);
    dispose();
  });
}
