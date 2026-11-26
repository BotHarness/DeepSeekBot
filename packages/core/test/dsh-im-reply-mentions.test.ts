import { expect, it } from 'vitest';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';

function provider(platform: 'slack' | 'discord' | 'feishu', capabilities: string[]) {
  const calls: { text: string; mentionUserIds?: string[]; standalone?: true }[] = [];
  let describeFails = false;
  const service: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'app', channel: platform }],
    listTargets: async () => [],
    describeBot: async (botId) => {
      if (describeFails) throw Object.assign(new Error('offline'), { code: 'provider-offline' });
      return {
        version: 1,
        botId,
        channel: platform,
        connected: true,
        account: { fingerprint: 'c'.repeat(64), name: 'Own identity' },
        capabilities: [
          'exclusive-text-consumer',
          'reply-text-checked',
          'reply-context-checked',
          'reply-receipt-checked',
          'reply-fence-checked',
          ...capabilities,
        ],
      };
    },
    sendChecked: async () => ({ sent: true }),
    consumeInbound: async () => () => {},
    qualifyReplyChecked: async (_id, route) => route,
    replyChecked: async (_id, route, text, options) => {
      calls.push({
        text,
        ...(options.mentionUserIds ? { mentionUserIds: options.mentionUserIds } : {}),
        ...(options.standalone ? { standalone: options.standalone } : {}),
      });
      return {
        sent: true,
        receipt: { version: 1, messageId: 'sent-1', conversationId: route.conversationId },
      };
    },
  };
  const value = createDshImProvider(service, platform)!;
  const reply = (text: string, standalone?: true) =>
    value.reply!({
      ...(standalone ? { standalone } : {}),
      accountRef: 'app',
      fingerprint: 'c'.repeat(64),
      route: { messageId: 'm1', conversationId: 'C1', actorId: 'U1', threadId: 'm1', rootId: 'm1' },
      text,
      signal: new AbortController().signal,
    });
  return {
    calls,
    reply,
    failDescribe: () => {
      describeFails = true;
    },
  };
}

it('sends leading mentions as checked mention ids when the provider supports them', async () => {
  for (const platform of ['slack', 'discord'] as const) {
    const { calls, reply } = provider(platform, ['reply-mention-checked']);
    await reply('ok <at user_id="U1">Ada</at>, ask <at user_id="U2">Bea</at> done');
    await reply('no mention');
    expect(calls).toEqual([
      { text: 'ok <@U1>, ask <@U2> done', mentionUserIds: ['U1', 'U2'] },
      { text: 'no mention' },
    ]);
  }
});

it('falls back to @name text without the capability and leaves Lark markup alone', async () => {
  const slack = provider('slack', []);
  await slack.reply('hi <at user_id="U1">Ada</at> and <at user_id="U2"></at> done');
  expect(slack.calls).toEqual([{ text: 'hi @Ada and @U2 done' }]);
  const lark = provider('feishu', ['reply-mention-checked']);
  await lark.reply('<at user_id="ou_1">Ada</at> done');
  expect(lark.calls).toEqual([{ text: '<at user_id="ou_1">Ada</at> done' }]);
});

it('asks for a standalone message only when the provider supports it', async () => {
  const discord = provider('discord', ['reply-standalone-checked']);
  await discord.reply('approval', true);
  await discord.reply('reply');
  expect(discord.calls).toEqual([{ text: 'approval', standalone: true }, { text: 'reply' }]);
  const older = provider('discord', []);
  await older.reply('approval', true);
  expect(older.calls).toEqual([{ text: 'approval' }]);
  older.failDescribe();
  await expect(older.reply('approval', true)).rejects.toMatchObject({
    disposition: 'not-started',
  });
  expect(older.calls).toHaveLength(1);
});
