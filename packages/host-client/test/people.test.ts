import { describe, expect, it, vi } from 'vitest';
import { HostAnswerInvalid } from '../src/host-answer';
import {
  dismissHumanAttention,
  readHumanAssignmentContext,
  readHumanAttention,
  readTeamMode,
} from '../src/people';

const host = (value: unknown) => ({ call: vi.fn().mockResolvedValue(value) });
const at = '2026-11-20T00:00:00Z';
const item = {
  id: 'a',
  botSlug: 'tea',
  summary: 'Choose tea',
  createdAt: at,
  kind: 'user-question',
  category: 'action',
  channelId: 'dm-tea',
  channelName: 'Tea',
};
const contextRef = { slug: 'tea', sessionId: 's', sourceEventId: 'report' };
const context = {
  botSlug: 'tea',
  sessionId: 's',
  sourceEventId: 'report',
  title: 'Tea',
  description: 'Brew tea',
  purpose: 'Brew tea',
  canReply: true,
  reports: [{ sourceEventId: 'report', summary: 'Which tea?', state: 'waiting-human', at }],
};
const team = {
  isolation: 'trial',
  enabled: true,
  activeMembers: 1,
  ownerPasswordSet: true,
  insecureHttpAllowed: false,
  memberUrls: [],
  viewer: {
    humanId: 'mia',
    kind: 'member',
    displayName: 'Mia',
    mustChangePassword: false,
    models: { all: true },
    permissions: ['bots.createPrivate'],
    roleIds: ['member'],
    owner: false,
  },
};

describe('Human attention', () => {
  it('reads a normal page and a notification-only DM reply without a Channel name', async () => {
    const page = { items: [item] };
    await expect(readHumanAttention(host(page), {})).resolves.toEqual(page);
    const reply = {
      ...item,
      kind: 'channel-reply',
      category: 'replies',
      channelName: undefined,
      messageId: 'msg',
      sourceEventId: 'event',
      isUnread: true,
    };
    const notification = { items: [reply], notificationVersion: 1, nextCursor: 'next' };
    await expect(readHumanAttention(host(notification), { notifications: true })).resolves.toEqual(
      notification,
    );
  });

  it.each([
    { id: null },
    { kind: 'unknown' },
    { channelName: null },
    { unreadCount: -1 },
    { isUnread: 'true' },
    { author: { kind: 'bot', slug: 1 } },
    {
      approval: {
        masked: true,
        kind: 'user-question',
        state: 'pending',
        botSlug: 'tea',
        requestedAt: at,
        decidedAt: 1,
      },
    },
    ...[
      'channelId',
      'messageId',
      'requestId',
      'assignmentSessionId',
      'sourceEventId',
      'responseMessageId',
      'responseSourceEventId',
      'snoozedUntil',
    ].map((key) => ({ [key]: null })),
    {
      kind: 'auto-rejection',
      messageId: 'm',
      sourceEventId: 'event',
      autoRejection: { toolName: 'reader' },
    },
    { category: 'handled', responseMessageId: 'reply' },
  ])('rejects a malformed attention row %j', async (change) => {
    await expect(
      readHumanAttention(host({ items: [{ ...item, ...change }] }), {}),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
  });

  it.each([
    { nextCursor: null },
    { queryVersion: '1' },
    { notificationVersion: 2 },
    { dismissed: 1 },
  ])('validates optional attention page fields %j', async (change) => {
    await expect(readHumanAttention(host({ items: [], ...change }), {})).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
  });

  it('requires both counts and a boolean continuation on the dismissal receipt', async () => {
    const receipt = { accepted: true, dismissed: 3, read: 2, more: false };
    await expect(dismissHumanAttention(host(receipt), { category: 'action' })).resolves.toEqual(
      receipt,
    );
    for (const change of [
      { accepted: false },
      { dismissed: undefined },
      { read: undefined },
      { read: -1 },
      { more: 0 },
    ])
      await expect(
        dismissHumanAttention(host({ ...receipt, ...change }), {}),
      ).rejects.toBeInstanceOf(HostAnswerInvalid);
  });
});

describe('Human Assignment context', () => {
  it('returns the requested context with and without reply and navigation fields', async () => {
    await expect(readHumanAssignmentContext(host({ context }), contextRef)).resolves.toEqual({
      context,
    });
    const complete = {
      ...context,
      hasOlder: true,
      hasNewer: false,
      reply: { id: 'reply', at, body: 'Green' },
    };
    await expect(
      readHumanAssignmentContext(host({ context: complete }), contextRef),
    ).resolves.toEqual({ context: complete });
  });

  it.each([
    { hasOlder: null },
    { hasNewer: 0 },
    { purpose: undefined },
    { sessionId: 'other' },
    { reply: { id: 'reply', body: 'Green' } },
    { reports: [] },
    { reports: [{ ...context.reports[0], state: 'done' }] },
    { reports: [{ ...context.reports[0], sourceEventId: 'other' }] },
  ])('rejects malformed or mismatched context %j', async (change) => {
    await expect(
      readHumanAssignmentContext(host({ context: { ...context, ...change } }), contextRef),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
  });
});

describe('Team mode', () => {
  it('reads member status and optional Host confinement fields', async () => {
    await expect(readTeamMode(host(team))).resolves.toEqual(team);
    const owner = {
      ...team,
      suspendedMembers: 2,
      privateAccessNotice: true,
      confinement: { enforcement: 'partial', filesystem: true, network: false, missing: ['nft'] },
      viewer: {
        ...team.viewer,
        kind: 'owner',
        owner: true,
        models: { all: false, providers: ['p'], routes: [] },
      },
    };
    await expect(readTeamMode(host(owner))).resolves.toEqual(owner);
  });

  it.each([
    { enabled: 'true' },
    { privateAccessNotice: false },
    { suspendedMembers: null },
    { confinement: { enforcement: 'full', filesystem: true, network: true, missing: [42] } },
    { viewer: { ...team.viewer, permissions: [false] } },
    { viewer: { ...team.viewer, models: { all: false, providers: [] } } },
  ])('rejects invalid Team mode data %j', async (change) => {
    await expect(readTeamMode(host({ ...team, ...change }))).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
  });
});
