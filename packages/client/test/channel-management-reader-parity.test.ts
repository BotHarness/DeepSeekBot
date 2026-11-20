import { expect, it, vi } from 'vitest';

import {
  assignRosterChannel,
  createGroupChannel,
  createRosterSection,
  decideGroupJoin,
  deleteGroupChannel,
  openBotDm,
  readAllBotPreview,
  readChannel,
  readChannelAssignments,
  readChannels,
  removeRosterSection,
  setChannelHumanName,
  setChannelMuted,
} from '@botharness/host-client/channel-management';
import { HostAnswerInvalid, type HostCall } from '@botharness/host-client/host-answer';
import { loadSkillCatalog } from '@botharness/host-client/skill-catalog';
import { bridgeHost } from '../src/client/bridge.js';

const group = { id: 'group-team', type: 'group', name: 'Team', members: ['ada'] };
const dm = { id: 'dm-ada', type: 'dm', name: 'Ada', members: ['ada'], botSlug: 'ada' };
const join = { channelId: group.id, requestId: 'join-1', accept: true };
const decided = {
  ...group,
  joinRequests: [{ id: join.requestId, requesterBotSlug: 'grace', status: 'accepted' }],
};
const create = { name: group.name, members: group.members, operationKey: 'operation-1' };
const receipt = { operationKey: create.operationKey, status: 'completed', channelId: group.id };
const access = { role: 'owner', policyRevision: 'test-revision' };
const assignments = [
  {
    sessionId: 'session-1',
    botSlug: 'ada',
    title: 'Review',
    description: '',
    activity: 'working',
    createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T00:00:00Z',
  },
];
const preview = { revision: 'r1', recipients: [{ botSlug: 'ada', label: 'Ada' }] };
const skills = [
  {
    name: 'skill-a',
    description: 'A Skill',
    owner: { kind: 'host' },
    path: '/skills/skill-a',
  },
];
const section = { id: 'work', name: 'Work', channelIds: [] };

it.each<{
  method: string;
  args: Record<string, unknown>;
  read: (host: HostCall) => Promise<unknown>;
  answer: unknown;
  invalid: unknown;
  expected: unknown;
}>([
  {
    method: 'channels',
    args: {},
    read: readChannels,
    answer: { channels: [group, dm] },
    invalid: { channels: [dm, { ...group, name: 3 }] },
    expected: [group, dm],
  },
  {
    method: 'channelGet',
    args: { channelId: group.id },
    read: (host) => readChannel(host, group.id),
    answer: { channel: group, ...access },
    invalid: { channel: { ...group, humanNickname: 3 } },
    expected: { channel: group, ...access, nickname: null },
  },
  {
    method: 'channelCreate',
    args: create,
    read: (host) => createGroupChannel(host, create),
    answer: { channel: group, receipt },
    invalid: { channel: group, receipt: { ...receipt, channelId: dm.id } },
    expected: group,
  },
  {
    method: 'channelDm',
    args: { slug: 'ada' },
    read: (host) => openBotDm(host, { slug: 'ada' }),
    answer: { channel: dm },
    invalid: { channel: { ...dm, id: '' } },
    expected: dm,
  },
  {
    method: 'channelAllBotPreview',
    args: { channelId: group.id },
    read: (host) => readAllBotPreview(host, group.id),
    answer: preview,
    invalid: { ...preview, recipients: [{ botSlug: 'ada' }] },
    expected: preview,
  },
  {
    method: 'channelAssign',
    args: { channelId: group.id, sectionId: null },
    read: (host) => assignRosterChannel(host, { channelId: group.id, sectionId: null }),
    answer: {},
    invalid: [],
    expected: undefined,
  },
  {
    method: 'channelAssignments',
    args: { channelId: group.id },
    read: (host) => readChannelAssignments(host, group.id),
    answer: { assignments },
    invalid: { assignments: [{ ...assignments[0], activity: 'unknown' }] },
    expected: assignments,
  },
  {
    method: 'channelGroupDelete',
    args: { channelId: group.id },
    read: (host) => deleteGroupChannel(host, group.id),
    answer: { deleted: true, messages: 0 },
    invalid: { deleted: false },
    expected: undefined,
  },
  {
    method: 'channelGroupJoinDecide',
    args: join,
    read: (host) => decideGroupJoin(host, join, { confirm: true }),
    answer: { channel: decided },
    invalid: { channel: group },
    expected: decided,
  },
  {
    method: 'channelHumanNameSet',
    args: { channelId: group.id, nickname: 'Captain' },
    read: (host) => setChannelHumanName(host, group.id, 'Captain'),
    answer: { channel: { ...group, humanNickname: 'Captain' } },
    invalid: { channel: dm },
    expected: { channel: { ...group, humanNickname: 'Captain' }, nickname: 'Captain' },
  },
  {
    method: 'channelMuteSet',
    args: { channelId: group.id, muted: true },
    read: (host) => setChannelMuted(host, group.id, true),
    answer: { muted: [group.id] },
    invalid: { muted: [false] },
    expected: undefined,
  },
  {
    method: 'channelSkillCatalog',
    args: { channelId: group.id },
    read: (host) => loadSkillCatalog(host, group.id),
    answer: { skills },
    invalid: { skills: null },
    expected: skills,
  },
  {
    method: 'sectionCreate',
    args: { name: section.name },
    read: (host) => createRosterSection(host, section.name),
    answer: { section },
    invalid: { section: { ...section, id: '' } },
    expected: section,
  },
  {
    method: 'sectionRemove',
    args: { sectionId: section.id },
    read: (host) => removeRosterSection(host, section.id),
    answer: { removed: false },
    invalid: { removed: 'false' },
    expected: false,
  },
])(
  '$method reads the same response through the bridge and remote transport',
  async ({ method, args, read, answer, invalid, expected }) => {
    const local = vi.fn(async () => ({ ok: true as const, value: answer }));
    const remote = vi.fn(async () => answer);
    expect(await read(bridgeHost(local))).toEqual(expected);
    expect(await read({ call: remote })).toEqual(expected);
    expect(local).toHaveBeenCalledExactlyOnceWith(method, args, undefined);
    expect(remote).toHaveBeenCalledExactlyOnceWith(method, args);

    await expect(
      read(bridgeHost(async () => ({ ok: true, value: invalid }))),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
    await expect(read({ call: async () => invalid })).rejects.toBeInstanceOf(HostAnswerInvalid);
  },
);

it('allows a join result with requests hidden for the Group view', async () => {
  expect(await decideGroupJoin({ call: async () => ({ channel: group }) }, join)).toEqual(group);
});

it('accepts the legacy creation answer for requests without an operation key', async () => {
  const { name, members } = create;
  expect(
    await createGroupChannel({ call: async () => ({ channel: group }) }, { name, members }),
  ).toEqual(group);
});
