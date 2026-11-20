import type { ChannelAssignmentSummary, ChannelListItem } from '@botharness/host-protocol/wire';
import { expect, it } from 'vitest';

import { readChannelAssignments, readChannels } from '../src/channel-management';
import { HostAnswerInvalid } from '../src/host-answer';

const at = '2026-11-20T00:00:00Z';
const channel = { id: 'group-team', type: 'group', name: 'Team', members: ['ada'] };
const humanMember = { humanId: 'human-1', displayName: 'Lee', avatarVersion: 'v1' };
const invitation = { id: 'invite-1', targetBotSlug: 'ada', status: 'pending' } as const;
const joinRequest = { id: 'join-1', requesterBotSlug: 'grace', status: 'accepted' } as const;
const latestMessage = { id: 'message-1', at, body: 'Ready' };

it('preserves Channels with absent or valid optional fields', async () => {
  const detailed = {
    ...channel,
    id: 'group-archived',
    createdAt: at,
    updatedAt: at,
    deletedAt: at,
    avatar: 'avatar',
    ownerBotSlug: 'ada',
    humanParticipants: ['human-1'],
    humanMembers: [humanMember],
    invitations: [invitation],
    joinRequests: [joinRequest],
    latestMessage: {
      ...latestMessage,
      author: { kind: 'human', humanId: humanMember.humanId, displayName: humanMember.displayName },
    },
  } satisfies ChannelListItem;
  const dm = { ...channel, id: 'dm-ada', type: 'dm', botSlug: 'ada', latestMessage };
  const channels = [channel, detailed, dm];
  await expect(readChannels({ call: async () => ({ channels }) })).resolves.toEqual(channels);
});

it.each<[string, unknown]>([
  ['createdAt', 1],
  ['updatedAt', null],
  ['deletedAt', false],
  ['botSlug', null],
  ['humanParticipants', ['human-1', 3]],
  ['humanMembers', [{ ...humanMember, avatarVersion: 2 }]],
  ['avatar', {}],
  ['ownerBotSlug', 3],
  ['invitations', [{ ...invitation, targetBotSlug: null }]],
  ['joinRequests', [{ ...joinRequest, status: 'unknown' }]],
  ['latestMessage', { ...latestMessage, body: 7 }],
  ['latestMessage', { ...latestMessage, author: { kind: 'bot' } }],
  ['latestMessage', { ...latestMessage, author: { kind: 'human', displayName: null } }],
  ['latestMessage', { ...latestMessage, author: null }],
])('rejects a Channel with malformed %s', async (field, value) => {
  const channels = [channel, { ...channel, [field]: value }];
  await expect(readChannels({ call: async () => ({ channels }) })).rejects.toBeInstanceOf(
    HostAnswerInvalid,
  );
});

const assignment = {
  sessionId: 'session-1',
  botSlug: 'ada',
  title: 'Review',
  description: '',
  activity: 'working',
  createdAt: at,
  updatedAt: at,
} satisfies ChannelAssignmentSummary;
const report = { state: 'progress', summary: 'Ready', at } as const;
const route = { provider: 'deepseek', model: 'deepseek-v4-flash' };

it('preserves Assignments with absent or valid optional fields', async () => {
  const detailed = {
    ...assignment,
    sessionId: 'session-2',
    archivedAt: at,
    subagentCount: 0,
    modelRoute: { ...route, reasoningEffort: 'high' },
    latestReport: { ...report, expectsReply: false },
  } satisfies ChannelAssignmentSummary;
  const assignments = [assignment, detailed];
  await expect(
    readChannelAssignments({ call: async () => ({ assignments }) }, channel.id),
  ).resolves.toEqual(assignments);
});

it.each<[string, unknown]>([
  ['archivedAt', null],
  ['subagentCount', '1'],
  ['modelRoute', null],
  ['modelRoute', { ...route, provider: 5 }],
  ['modelRoute', { ...route, model: null }],
  ['modelRoute', { ...route, reasoningEffort: null }],
  ['latestReport', { ...report, expectsReply: 'yes' }],
])('rejects an Assignment with malformed %s', async (field, value) => {
  const assignments = [assignment, { ...assignment, [field]: value }];
  await expect(
    readChannelAssignments({ call: async () => ({ assignments }) }, channel.id),
  ).rejects.toBeInstanceOf(HostAnswerInvalid);
});
