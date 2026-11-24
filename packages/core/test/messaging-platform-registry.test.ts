import { describe, expect, it } from 'vitest';
import { createDshImProvider } from '../src/messaging/dsh-im.js';
import { messagingDefaultsPlatform } from '../src/messaging/defaults.js';
import {
  isMessagingPlatform,
  messagingPlatform,
  messagingPlatformIds,
} from '../src/messaging/platforms/index.js';

const fn = async () => ({});
const host = {
  contractVersion: 1,
  setupVersion: 1,
  reactionVersion: 1,
  approvalCardVersion: 1,
  questionCardVersion: 1,
  fileVersion: 1,
  replyContextVersion: 1,
  replyReceiptVersion: 1,
  replyFenceVersion: 1,
  receiptVersion: 1,
  reachableConversationVersion: 1,
  typingVersion: 1,
  describeSetup: fn,
  reactionChecked: fn,
  approvalCardChecked: fn,
  questionCardChecked: fn,
  listReachableConversations: fn,
  postConversationChecked: fn,
  beginTypingChecked: fn,
  readSourceFile: fn,
  replyFileChecked: fn,
  listBots: async () => [],
  listTargets: async () => [],
  describeBot: fn,
  consumeInbound: fn,
  qualifyReplyChecked: fn,
  replyChecked: fn,
  historyChecked: fn,
  sendChecked: fn,
};
const optional = [
  'setup',
  'react',
  'beginTyping',
  'approvalCard',
  'questionCard',
  'reachable',
  'postConversation',
  'post',
] as const;

describe('Messaging platform registry', () => {
  it('resolves one profile per platform id and refuses unknown ids', () => {
    for (const id of messagingPlatformIds) {
      expect(isMessagingPlatform(id)).toBe(true);
      expect(messagingPlatform(id).id).toBe(id);
      expect(messagingDefaultsPlatform.parse(id)).toBe(id);
    }
    expect(isMessagingPlatform('telegram')).toBe(false);
    expect(isMessagingPlatform('tob')).toBe(false);
  });

  it('keeps each platform’s optional Provider features', () => {
    const features = Object.fromEntries(
      messagingPlatformIds.map((id) => {
        const provider = createDshImProvider(host, id)!;
        return [id, optional.filter((name) => typeof provider[name] === 'function')];
      }),
    );
    expect(features).toEqual({
      feishu: [
        'setup',
        'react',
        'approvalCard',
        'questionCard',
        'reachable',
        'postConversation',
        'post',
      ],
      slack: ['react', 'reachable', 'postConversation', 'post'],
      discord: ['reachable', 'postConversation'],
      weixin: ['setup', 'beginTyping', 'post'],
      qq: ['post'],
    });
  });

  it('maps Provider targets to receive scopes only where the platform qualifies them', () => {
    const scope = (id: (typeof messagingPlatformIds)[number], kind: string, route: object) =>
      messagingPlatform(id).receiveScope({
        targetId: 't',
        kind,
        route: route as never,
      });
    expect(scope('feishu', 'group', { chatId: 'oc_1' })).toEqual({
      kind: 'group',
      conversationId: 'oc_1',
    });
    expect(scope('feishu', 'user', { openId: 'ou_1', chatId: 'oc_2' })).toEqual({
      kind: 'dm',
      conversationId: 'oc_2',
    });
    expect(scope('feishu', 'user', { openId: 'x', chatId: 'oc_2' })).toBeUndefined();
    expect(scope('slack', 'conversation', { channelId: 'C1' })).toEqual({
      kind: 'group',
      conversationId: 'C1',
    });
    expect(scope('discord', 'channel', { channelId: '9' })).toEqual({
      kind: 'group',
      conversationId: '9',
    });
    expect(scope('weixin', 'user', { toUserId: 'w' })).toEqual({
      kind: 'dm',
      conversationId: 'w',
    });
    expect(scope('qq', 'group', { groupOpenId: 'g' })).toEqual({
      kind: 'group',
      conversationId: 'g',
    });
    expect(scope('qq', 'user', { openId: 'u' })).toBeUndefined();
  });
});
