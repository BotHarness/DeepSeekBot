import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { groupProfileActivity } from '../src/channels/profile-activity.js';
import { createChannelStore, MAX_MESSAGE_PAGE } from '../src/channels/store.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Group Profile activity', () => {
  it('keeps QQ receiving apps distinct even when names and conversation locators match', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botharness-group-profile-'));
    roots.push(root);
    const channels = createChannelStore({ rootDir: root });
    const group = channels.createGroup({ name: 'QQ apps', members: ['ada', 'bea'] });
    for (const accountRef of ['qq-a', 'qq-b']) {
      await channels.appendMessage(group.id, {
        id: accountRef,
        at: '2026-10-04T11:00:00.000Z',
        author: { kind: 'bridged', source: 'Same sender' },
        body: 'Same content',
        bridgeOrigin: {
          platform: 'qq',
          accountRef,
          accountName: 'Same name',
          conversationId: 'same-locator',
          conversationName: 'Same group',
          senderId: 'member',
          sourceEventId: `source-${accountRef}`,
          messageId: 'same-native-id',
        },
      });
    }
    const activity = groupProfileActivity(channels, group.id, new Date('2026-10-04T12:00:00.000Z'));
    expect(activity.authors).toHaveLength(2);
    expect(activity.authors.map((entry) => [entry.bridgeOrigin?.accountRef, entry.total])).toEqual([
      ['qq-a', 1],
      ['qq-b', 1],
    ]);
  });
  it('counts committed messages across pages by local day and author', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botharness-group-profile-'));
    roots.push(root);
    const channels = createChannelStore({ rootDir: root });
    const group = channels.createGroup({ name: 'Research', members: ['ada'] });
    const now = new Date('2026-09-30T12:00:00.000Z');
    for (let index = 0; index < MAX_MESSAGE_PAGE + 2; index += 1) {
      await channels.appendMessage(group.id, {
        id: `msg-${index}`,
        at: new Date(Date.parse('2026-09-29T12:00:00.000Z') + index * 1000).toISOString(),
        author: index % 2 === 0 ? { kind: 'human' } : { kind: 'bot', slug: 'ada' },
        body: `Message ${index}`,
      });
    }
    await channels.appendMessage(group.id, {
      id: 'old-message',
      at: '2025-01-01T12:00:00.000Z',
      author: { kind: 'human' },
      body: 'Outside the window',
    });

    const activity = groupProfileActivity(channels, group.id, now);
    expect(activity.channelId).toBe(group.id);
    expect(activity.days.reduce((total, day) => total + day.count, 0)).toBe(MAX_MESSAGE_PAGE + 2);
    expect(activity.authors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          author: { kind: 'human' },
          total: (MAX_MESSAGE_PAGE + 2) / 2,
        }),
        expect.objectContaining({
          author: { kind: 'bot', slug: 'ada' },
          total: (MAX_MESSAGE_PAGE + 2) / 2,
        }),
      ]),
    );
  });
  it('groups external activity by platform and conversation while retaining totals and legacy authors', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botharness-group-profile-'));
    roots.push(root);
    const channels = createChannelStore({ rootDir: root });
    const group = channels.createGroup({ name: 'Sources', members: ['ada'] });
    const now = new Date('2026-10-04T12:00:00.000Z');
    const sources = [
      {
        platform: 'feishu',
        conversationId: 'group-a',
        conversationName: 'Old name',
        sender: 'qa-first',
      },
      {
        platform: 'feishu',
        conversationId: 'group-a',
        conversationName: 'Shared name',
        sender: 'qa-second',
      },
      {
        platform: 'feishu',
        conversationId: 'group-b',
        conversationName: 'Shared name',
        sender: 'qa-first',
      },
      {
        platform: 'slack',
        conversationId: 'group-a',
        conversationName: 'Shared name',
        sender: 'qa-first',
      },
    ];
    for (const [index, source] of sources.entries()) {
      await channels.appendMessage(group.id, {
        id: `external-${index}`,
        at: `2026-10-04T11:00:0${index}.000Z`,
        author: { kind: 'bridged', source: source.sender },
        body: `External message ${index}`,
        bridgeOrigin: {
          platform: source.platform,
          conversationId: source.conversationId,
          conversationName: source.conversationName,
          senderId: source.sender,
          sourceEventId: `source-${index}`,
          messageId: `message-${index}`,
        },
      });
    }
    await channels.appendMessage(group.id, {
      id: 'legacy',
      at: '2026-10-04T11:01:00.000Z',
      author: { kind: 'bridged', source: 'legacy-source' },
      body: 'No retained origin metadata',
    });
    const activity = groupProfileActivity(channels, group.id, now);
    expect(activity.days.reduce((total, day) => total + day.count, 0)).toBe(5);
    expect(activity.authors).toHaveLength(4);
    expect(activity.authors[0]).toMatchObject({
      bridgeOrigin: {
        platform: 'feishu',
        conversationId: 'group-a',
        conversationName: 'Shared name',
      },
      total: 2,
    });
    expect(
      activity.authors
        .filter((entry) => entry.bridgeOrigin)
        .map((entry) => [
          entry.bridgeOrigin!.platform,
          entry.bridgeOrigin!.conversationId,
          entry.total,
        ]),
    ).toEqual(
      expect.arrayContaining([
        ['feishu', 'group-a', 2],
        ['feishu', 'group-b', 1],
        ['slack', 'group-a', 1],
      ]),
    );
    expect(
      activity.authors.find(
        (entry) => entry.author.kind === 'bridged' && entry.author.source === 'legacy-source',
      ),
    ).toEqual({
      author: { kind: 'bridged', source: 'legacy-source' },
      total: 1,
      days: [{ day: '2026-10-04', count: 1 }],
    });
    expect(
      channels.readMessages(group.id).find((message) => message.id === 'external-0')!.author,
    ).toEqual({
      kind: 'bridged',
      source: 'qa-first',
    });
  });
});
