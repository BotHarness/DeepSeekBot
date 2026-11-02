import { describe, expect, it } from 'vitest';

import type { ChannelMessage } from '../../../packages/core/src/channels/channel';
import { visibleDmMessages } from '../../../packages/client/src/client/dm-actions';
import { en, zh } from '../../../packages/client/src/client/locale';
import { activityOf } from '../src/host/channel-activity';
import { reactable, shownInChat, type ConversationMessage } from '../src/host/conversation';
import type { RosterView } from '../src/host/client';
import { visibleDmActivity } from '../src/host/dm-activity';
import type { ChannelWireMessage } from '../src/host/wire';
import { activityText } from '../src/ui/chat/activity-text';
import { activityStrings } from '../src/ui/strings';
import fixture from './fixtures/host-wire.json';

const recorded = fixture.activityJournal;
const messages = recorded.page.entries.map((entry) => entry.message) as ChannelMessage[];
const presented = (message: ChannelWireMessage): ConversationMessage => {
  const activity = activityOf(message);
  return {
    id: message.id,
    at: message.at,
    author: message.author.kind === 'bot' ? 'bot' : 'system',
    ...(message.author.kind === 'bot' ? { bot: message.author.slug } : {}),
    body: message.body,
    attachments: [],
    delivery: 'committed',
    revision: 1,
    ...(activity === undefined ? {} : { activity }),
  };
};
const roster: RosterView = {
  bots: ['ada', 'bob'].map((slug) => ({
    slug,
    displayName: slug === 'ada' ? 'Ada' : 'Bob',
    roles: [],
    state: 'idle',
    paused: false,
    computerAccess: false,
    browserAccess: false,
  })),
  channels: [],
  activityChannels: recorded.channels,
};

describe('Channel activity on mobile', () => {
  it('keeps all six recorded notice kinds visible and non-reactable', () => {
    const views = messages.map(presented);
    expect(views.map((message) => message.activity?.kind)).toEqual([
      'channel-post',
      'dm-action',
      'memory',
      'bot-create',
      'departure',
      'turn-stop',
    ]);
    expect(views.every(shownInChat)).toBe(true);
    expect(views.some(reactable)).toBe(false);
    expect(views[2]?.activity).toMatchObject({ noticeOrigin: { channelId: 'group-research' } });
    const groupMemory = recorded.groupPage.entries.find(
      (entry) => 'memoryCommit' in entry.message,
    )!;
    expect(activityOf(groupMemory.message as ChannelWireMessage)).toMatchObject({ kind: 'memory' });
    expect(activityOf(groupMemory.message as ChannelWireMessage)).not.toHaveProperty(
      'noticeOrigin',
    );
  });

  it.each(
    ([[], ['posts'], ['memory'], ['posts', 'memory']] as const).map((hidden) => ({ hidden })),
  )('matches Web filtering for $hidden', ({ hidden: kinds }) => {
    expect(visibleDmActivity(messages.map(presented), kinds).map((message) => message.id)).toEqual(
      visibleDmMessages(messages, kinds).map((message) => message.id),
    );
  });

  it.each(['en', 'zh'] as const)(
    'matches Web activity sentences in %s and retains navigation targets',
    (language) => {
      const copy = activityStrings[language];
      const web = language === 'en' ? en : zh;
      const views = messages.map(presented);
      const lines = views.map((message) =>
        activityText(message, message.activity!, roster, 1, copy),
      );
      const sentence = (index: number) => `${lines[index]!.name} ${lines[index]!.verb}`;
      expect(sentence(1)).toBe(
        web['botDm.action'].replace('{sender}', 'Ada').replace('{recipient}', 'Bob'),
      );
      expect(sentence(3)).toBe(
        web['botCreate.action'].replace('{sender}', 'Ada').replace('{recipient}', 'Bob'),
      );
      expect(lines[0]?.verb).toBe(web['dmTrace.posted'].replace('{place}', '#research'));
      expect(lines[2]?.verb).toBe(web['memoryCommit.updatedIn'].replace('{place}', '#research'));
      expect(lines[2]?.detail).toBe('Remember the launch date · aaaaaaa · launch.md +2 −1');
      expect(sentence(4)).toBe(web['member.left'].replace('{name}', 'Bob'));
      expect(sentence(5)).toBe(
        web['turn.stopped'].replace('{human}', 'Human').replace('{name}', 'Ada'),
      );
      expect(lines[0]?.target).toEqual({
        pathname: '/channel/[id]',
        params: { id: 'group-research', focus: 'target-post', focusWindow: 'latest' },
      });
      expect(lines[1]?.target?.pathname).toBe('/channel/[id]');
      expect(lines[2]?.target).toEqual({ pathname: '/bot/[slug]/memory', params: { slug: 'ada' } });
      expect(lines[3]?.target).toEqual({ pathname: '/dm/[slug]', params: { slug: 'bob' } });
      expect(lines[4]?.target).toBeUndefined();
      expect(lines[5]?.target).toBeUndefined();
      const post = views[0]!;
      if (post.activity?.kind !== 'channel-post') throw new Error('Missing post fixture');
      const peer = recorded.channels.find(
        (channel) => channel.type === 'dm' && channel.members.length === 2,
      )!;
      expect(
        activityText(post, { ...post.activity, channelId: peer.id }, roster, 3, copy).verb,
      ).toBe(web['dmTrace.messagedMany'].replace('{name}', 'Bob').replace('{count}', '3'));
      expect(
        activityText(
          post,
          { ...post.activity, channelId: 'deleted', preview: null },
          roster,
          1,
          copy,
        ),
      ).toMatchObject({
        verb: web['dmTrace.posted'].replace('{place}', web['dmTrace.place.unavailable']),
        detail: web['dmTrace.unavailable'],
      });
    },
  );

  it('uses recorded names or localized missing-Bot copy instead of internal IDs', () => {
    const views = messages.map(presented);
    const lines = views.map((message) =>
      activityText(message, message.activity!, undefined, 1, activityStrings.en),
    );
    expect(lines[0]?.name).toBe(activityStrings.en.unavailableBot);
    expect(lines[1]?.verb).toBe(activityStrings.en.dm(activityStrings.en.unavailableBot));
    expect(lines[2]?.name).toBe('Ada');
    expect(lines[3]?.verb).toBe(activityStrings.en.created('Bob'));
  });

  it('ignores malformed or wrongly authored notices without blank rows or crashes', () => {
    const bot: ChannelWireMessage = {
      id: 'bad',
      at: '',
      body: '',
      author: { kind: 'bot', slug: 'ada' },
    };
    const system: ChannelWireMessage = { ...bot, author: { kind: 'system' } };
    const malformed: ChannelWireMessage[] = [
      { ...bot, botDmAction: [] },
      { ...bot, botDmAction: { channelId: 'group' } },
      { ...bot, botChannelPost: { channelId: '', messageId: 'm' } },
      { ...bot, botCreateAction: { botSlug: 3, displayName: 'Bob' } },
      { ...system, memoryCommit: null },
      { ...system, memoryCommit: { botSlug: 'ada', sha: 'abc' } },
      { ...system, memoryCommit: messages[2]!.memoryCommit, noticeOrigin: [] },
      { ...system, memoryCommit: { ...messages[2]!.memoryCommit, files: [null] } },
      {
        ...system,
        memberDeparture: {
          memberKind: 'bot',
          memberId: 'bob',
          displayName: 'Bob',
          departureType: 'unknown',
        },
      },
      { ...system, turnStop: { botSlug: 'ada', humanName: 'Human' } },
      { ...messages[0]!, author: { kind: 'human' } },
      { ...messages[3]!, author: { kind: 'human' } },
    ];
    for (const message of malformed) {
      expect(activityOf(message)).toBeUndefined();
      expect(shownInChat(presented(message))).toBe(false);
      expect(shownInChat(presented({ ...message, body: 'fallback text' }))).toBe(true);
    }
  });
});
