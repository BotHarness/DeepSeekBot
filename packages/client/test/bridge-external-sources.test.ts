import { expect, it } from 'vitest';
import { readMessagingSource, BridgeCallError } from '../src/client/bridge.js';
import { bridgeCall } from './bridge-helpers.js';

const EXTERNAL_SOURCE = {
  id: 'im-source',
  body: 'Please reply',
  platform: 'lark',
  accountName: 'Bot',
  conversationName: 'Team',
  at: '2026-10-01T00:00:00Z',
  grantId: 'grant',
  grantRevision: 2,
  event: {
    version: 1,
    channel: 'feishu',
    botId: 'app',
    fingerprint: 'a'.repeat(64),
    eventId: 'ev',
    messageId: 'om',
    at: '2026-10-01T00:00:00Z',
    mentionedAccount: true,
    mentions: [{ id: 'bot', key: '@bot' }],
    actor: { kind: 'user', id: 'human' },
    conversation: { kind: 'group', id: 'group' },
    reply: { messageId: 'om', conversationId: 'group', actorId: 'human', threadId: 'thread' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  },
};

it('preserves native Slack source identities for the external message modal', async () => {
  const source = {
    ...EXTERNAL_SOURCE,
    platform: 'slack',
    event: {
      ...EXTERNAL_SOURCE.event,
      channel: 'slack',
      messageId: '1791132922.718839',
      conversation: { kind: 'group', id: 'C0C6FPES0G5' },
      reply: {
        messageId: '1791132922.718839',
        conversationId: 'C0C6FPES0G5',
        actorId: 'U064CFNDJGK',
        threadId: '1791132786.447879',
        rootId: '1791132786.447879',
      },
    },
  };
  const read = (value: unknown) =>
    readMessagingSource(
      bridgeCall({ messagingSource: () => ({ source: value }) }),
      'ada',
      'im-source',
    );
  await expect(read(source)).resolves.toEqual(source);
  await expect(
    read({ ...source, event: { ...source.event, channel: 'unqualified' } }),
  ).rejects.toMatchObject({ code: 'invalid-response' });
});

it('rejects incomplete external source responses before the source modal can render them', async () => {
  const read = (source: unknown) =>
    readMessagingSource(bridgeCall({ messagingSource: () => ({ source }) }), 'ada', 'im-source');
  await expect(read(EXTERNAL_SOURCE)).resolves.toEqual(EXTERNAL_SOURCE);
  for (const key of Object.keys(EXTERNAL_SOURCE)) {
    const incomplete: Record<string, unknown> = { ...EXTERNAL_SOURCE };
    delete incomplete[key];
    await expect(read(incomplete)).rejects.toMatchObject({ code: 'invalid-response' });
  }
  for (const event of [
    { ...EXTERNAL_SOURCE.event, actor: null },
    { ...EXTERNAL_SOURCE.event, conversation: {} },
    { ...EXTERNAL_SOURCE.event, reply: { threadId: 42 } },
    { ...EXTERNAL_SOURCE.event, mentions: [null] },
    { ...EXTERNAL_SOURCE.event, replay: null },
    { ...EXTERNAL_SOURCE.event, attachments: [null] },
    { ...EXTERNAL_SOURCE.event, attachments: [{ name: 'file.zip' }] },
    { ...EXTERNAL_SOURCE.event, attachments: 'file.zip' },
  ])
    await expect(read({ ...EXTERNAL_SOURCE, event })).rejects.toBeInstanceOf(BridgeCallError);
});

it('reads retained WeChat context audits through the actual Client bridge before rendering', async () => {
  const read = (source: unknown) =>
    readMessagingSource(bridgeCall({ messagingSource: () => ({ source }) }), 'ada', 'im-source');
  const source = {
    ...EXTERNAL_SOURCE,
    platform: 'weixin',
    event: { ...EXTERNAL_SOURCE.event, channel: 'weixin' },
    quote: { kind: 'unavailable', reason: 'no-server-message-id' },
    contextReads: ['retained', 'retained-nearby'].map((scope) => ({
      at: EXTERNAL_SOURCE.at,
      sessionId: 'session',
      scope,
      outcome: 'read',
      sourceEventIds: ['original'],
      omitted: 0,
      incomplete: false,
      coverage: 'retained-local-sources',
    })),
    contextMessages: [
      {
        sourceEventId: 'original',
        messageId: '9007199254740993',
        senderId: 'owner',
        at: EXTERNAL_SOURCE.at,
        text: 'actual local original',
      },
    ],
  };
  await expect(read(source)).resolves.toEqual(source);
  const providerSource = {
    ...EXTERNAL_SOURCE,
    contextReads: [
      { ...source.contextReads[0], scope: 'group', coverage: 'provider-visible-human-text' },
    ],
  };
  await expect(read(providerSource)).resolves.toEqual(providerSource);
  for (const patch of [
    { scope: 'invented-history' },
    { coverage: 'remote-wechat-history' },
    { sourceEventIds: [42] },
  ])
    await expect(
      read({ ...source, contextReads: [{ ...source.contextReads[0], ...patch }] }),
    ).rejects.toMatchObject({ code: 'invalid-response' });
});
