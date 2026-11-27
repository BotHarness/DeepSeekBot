import { expect, it } from 'vitest';

import { canEditGroupDetails, readGroupDetailsEditable } from '../src/group-details';

const member = { teamEnabled: true, owner: false, permissions: [] as string[] };

it.each([
  ['a member when only admins edit', member, { role: 'member', canEditDetails: false }, false],
  ['a member when everyone edits', member, { role: 'member', canEditDetails: true }, true],
  ['a Channel admin', member, { role: 'admin', canEditDetails: true }, true],
  ['the Channel owner', member, { role: 'owner', canEditDetails: true }, true],
  [
    'a member with manageAll',
    { ...member, permissions: ['channels.manageAll'] },
    { role: 'member', canEditDetails: false },
    true,
  ],
  ['the Host owner', { ...member, owner: true }, undefined, true],
  ['anyone when Team mode is off', { ...member, teamEnabled: false }, undefined, true],
  ['a member with no Channel access read', member, undefined, false],
])('decides Group details for %s', (_name, viewer, access, editable) => {
  expect(canEditGroupDetails(viewer, access)).toBe(editable);
});

function teamMode(kind: 'owner' | 'member', permissions: string[] = []) {
  return {
    isolation: 'trial',
    enabled: true,
    ownerPasswordSet: true,
    insecureHttpAllowed: false,
    activeMembers: 2,
    memberUrls: [],
    viewer: {
      humanId: 'human-alice',
      kind,
      displayName: 'Alice',
      mustChangePassword: false,
      owner: kind === 'owner',
      models: { all: true },
      permissions,
      roleIds: [],
    },
  };
}

function host(kind: 'owner' | 'member', canEditDetails: boolean, role = 'member') {
  const calls: string[] = [];
  return {
    calls,
    call: async (method: string) => {
      calls.push(method);
      if (method === 'teamMode') return teamMode(kind);
      return {
        channel: { id: 'group-lobby', type: 'group', name: 'Lobby', members: [] },
        role,
        canEditDetails,
      };
    },
  };
}

it('reads the Channel policy for a member and refuses edits it would refuse', async () => {
  const reader = host('member', false);
  await expect(readGroupDetailsEditable(reader, 'group-lobby')).resolves.toBe(false);
  expect(reader.calls).toEqual(['teamMode', 'channelGet']);
});

it('lets a Channel admin edit and skips the Channel read for the Host owner', async () => {
  await expect(
    readGroupDetailsEditable(host('member', true, 'admin'), 'group-lobby'),
  ).resolves.toBe(true);
  const owner = host('owner', false);
  await expect(readGroupDetailsEditable(owner, 'group-lobby')).resolves.toBe(true);
  expect(owner.calls).toEqual(['teamMode']);
});
