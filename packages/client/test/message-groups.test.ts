import { describe, expect, it } from 'vitest';

import { groupChannelMessages } from '../src/client/message-groups.js';
import type { ChannelMessage } from '../src/client/store.js';

function message(
  id: string,
  seconds: number,
  author: ChannelMessage['author'] = { kind: 'bot', slug: 'ada' },
): ChannelMessage {
  return {
    id,
    at: new Date(Date.UTC(2026, 8, 22, 0, 0, seconds)).toISOString(),
    author,
    body: id,
  };
}

describe('Channel message visual groups', () => {
  it('joins nearby messages from the exact same sender but not another Bot or Human', () => {
    const groups = groupChannelMessages([
      message('a', 0),
      message('b', 10),
      message('c', 18),
      message('d', 19, { kind: 'bot', slug: 'bob' }),
      message('e', 20, { kind: 'human' }),
      message('f', 22, { kind: 'human' }),
    ]);
    expect(groups.map((group) => group.messages.map((item) => item.id))).toEqual([
      ['a', 'b', 'c'],
      ['d'],
      ['e', 'f'],
    ]);
  });

  it('breaks a run at long gaps, day boundaries and eight bubbles', () => {
    const groups = groupChannelMessages([
      ...Array.from({ length: 9 }, (_, index) => message(`m-${index}`, index * 10)),
      message('late', 120),
    ]);
    expect(groups.map((group) => group.messages.length)).toEqual([8, 1, 1]);
    expect(
      groupChannelMessages([
        { ...message('before', 0), at: '2026-09-21T23:59:59' },
        { ...message('after', 1), at: '2026-09-22T00:00:01' },
      ]),
    ).toHaveLength(2);
  });

  it('isolates bodyless Bot DM actions as centered timeline items', () => {
    const action: ChannelMessage = {
      ...message('action', 1),
      body: '',
      botDmAction: {
        channelId: 'dm-bots-ada-bea',
        messageId: 'bot-send',
        recipientBotSlug: 'bea',
      },
    };
    expect(
      groupChannelMessages([message('before', 0), action, message('after', 2)]).map((group) =>
        group.messages.map((item) => item.id),
      ),
    ).toEqual([['before'], ['action'], ['after']]);
  });

  it('keeps a member departure as its own centered timeline item', () => {
    const departure: ChannelMessage = {
      ...message('left', 1, { kind: 'system' }),
      memberDeparture: { memberKind: 'bot', memberId: 'ada', displayName: 'Ada' },
    };
    expect(
      groupChannelMessages([message('before', 0), departure, message('after', 2)]).map((group) =>
        group.messages.map((item) => item.id),
      ),
    ).toEqual([['before'], ['left'], ['after']]);
  });

  it('gives each external source its own header so opening details cannot select a neighboring event', () => {
    const origin = {
      sourceEventId: 'first-source',
      platform: 'feishu',
      conversationId: 'group-a',
      conversationName: 'Group A',
      messageId: 'first-message',
      senderId: 'same-user',
    };
    const groups = groupChannelMessages([
      { ...message('first', 0, { kind: 'bridged', source: 'same-user' }), bridgeOrigin: origin },
      {
        ...message('second', 1, { kind: 'bridged', source: 'same-user' }),
        bridgeOrigin: {
          ...origin,
          sourceEventId: 'second-source',
          messageId: 'second-message',
        },
      },
      {
        ...message('third', 2, { kind: 'bridged', source: 'same-user' }),
        bridgeOrigin: {
          ...origin,
          sourceEventId: 'third-source',
          conversationId: 'group-b',
          conversationName: 'Group B',
        },
      },
    ]);
    expect(groups.map((g) => g.messages.map((m) => m.id))).toEqual([
      ['first'],
      ['second'],
      ['third'],
    ]);
  });
  it('never merges bridged messages from different sources', () => {
    const groups = groupChannelMessages([
      message('feishu', 0, { kind: 'bridged', source: 'Feishu' }),
      message('slack', 1, { kind: 'bridged', source: 'Slack' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('joins consecutive post traces for one Channel and keeps them apart from messages', () => {
    const trace = (id: string, seconds: number, channelId: string): ChannelMessage => ({
      ...message(id, seconds),
      body: '',
      botChannelPost: { channelId, messageId: id },
    });
    const groups = groupChannelMessages([
      message('a', 0),
      trace('t1', 1, 'group-a'),
      trace('t2', 400, 'group-a'),
      trace('t3', 401, 'group-b'),
      message('b', 402),
    ]);
    expect(groups.map((group) => group.messages.map((item) => item.id))).toEqual([
      ['a'],
      ['t1', 't2'],
      ['t3'],
      ['b'],
    ]);
  });
});
