import { describe, expect, it } from 'vitest';

import { createDmActivityPreferences, visibleDmActivity } from '../src/host/dm-activity';
import type { ConversationMessage } from '../src/host/conversation';

describe('device-local DM activity preferences', () => {
  it('persists each Host and Bot independently, including changes before storage finishes loading', async () => {
    let resolve: (value: unknown) => void = () => {};
    let stored: unknown;
    const preferences = createDmActivityPreferences({
      read: () =>
        new Promise((done) => {
          resolve = done;
        }),
      write: (value) => {
        stored = structuredClone(value);
      },
    });
    expect(preferences.hidden('host-a', 'ada')).toEqual([]);
    preferences.setHidden('host-a', 'ada', 'memory', true);
    resolve({
      'host-a': { ada: ['posts'], bob: ['posts'] },
      'host-b': { ada: ['posts', 'future'] },
    });
    await preferences.ready;
    expect(preferences.hidden('host-a', 'ada')).toEqual(['posts', 'memory']);
    expect(preferences.hidden('host-a', 'bob')).toEqual(['posts']);
    expect(preferences.hidden('host-b', 'ada')).toEqual(['posts']);
    const restarted = createDmActivityPreferences({ read: async () => stored, write: () => {} });
    await restarted.ready;
    expect(restarted.hidden('host-a', 'ada')).toEqual(['posts', 'memory']);
    expect(restarted.hidden('host-a', 'bob')).toEqual(['posts']);
    preferences.setHidden('host-a', 'ada', 'memory', false);
    expect(preferences.hidden('host-a', 'ada')).toEqual(['posts']);
  });

  it('hides only mirrored posts and memory, keeping original memory, direct actions and ordinary messages', () => {
    const base: ConversationMessage = {
      id: 'normal',
      at: '',
      author: 'bot',
      bot: 'ada',
      body: '',
      attachments: [],
      delivery: 'committed',
    };
    const commit = {
      botSlug: 'ada',
      sha: 'a'.repeat(40),
      subject: 'Remember',
      authorName: 'Ada',
      authoredAt: '',
      files: [],
      moreFiles: 0,
    };
    const messages: ConversationMessage[] = [
      base,
      {
        ...base,
        id: 'post',
        activity: { kind: 'channel-post', channelId: 'group', messageId: 'm1', preview: null },
      },
      {
        ...base,
        id: 'mirrored',
        activity: { kind: 'memory', commit, noticeOrigin: { channelId: 'group' } },
      },
      { ...base, id: 'own', activity: { kind: 'memory', commit } },
      {
        ...base,
        id: 'dm',
        activity: {
          kind: 'dm-action',
          channelId: 'bot-dm',
          messageId: 'm2',
          recipientBotSlug: 'bob',
        },
      },
      {
        ...base,
        id: 'created',
        activity: { kind: 'bot-create', botSlug: 'bob', displayName: 'Bob' },
      },
    ];
    expect(visibleDmActivity(messages, ['posts', 'memory']).map((message) => message.id)).toEqual([
      'normal',
      'own',
      'dm',
      'created',
    ]);
    expect(visibleDmActivity(messages, []).map((message) => message.id)).toHaveLength(6);
  });
});
