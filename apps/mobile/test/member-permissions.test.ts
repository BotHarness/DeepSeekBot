// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import type { HostClient } from '@botharness/host-client/client';
import {
  refreshMemberPermissions,
  useMemberCreationPermissions,
} from '../src/host/member-permissions';

function host(enabled: boolean, owner: boolean, permissions: string[]) {
  return {
    call: async () => ({
      isolation: 'trial',
      enabled,
      activeMembers: 2,
      ownerPasswordSet: true,
      insecureHttpAllowed: false,
      memberUrls: [],
      viewer: {
        humanId: owner ? 'local-human' : 'carol',
        kind: owner ? 'owner' : 'member',
        displayName: owner ? 'Owner' : 'Carol',
        mustChangePassword: false,
        models: { all: true },
        permissions,
        roleIds: [],
        owner,
      },
    }),
  } as unknown as HostClient;
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function permissionsOf(client: HostClient) {
  await refreshMemberPermissions(client);
  let seen: ReturnType<typeof useMemberCreationPermissions>;
  function Probe() {
    seen = useMemberCreationPermissions(client);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Probe)));
  act(() => root.unmount());
  return seen;
}

it.each([
  {
    enabled: true,
    owner: true,
    permissions: [],
    people: true,
    bots: true,
    channels: true,
    folders: true,
  },
  {
    enabled: false,
    owner: true,
    permissions: [],
    people: false,
    bots: true,
    channels: true,
    folders: true,
  },
  {
    enabled: true,
    owner: false,
    permissions: ['dm.humans'],
    people: true,
    bots: false,
    channels: false,
    folders: false,
  },
  {
    enabled: true,
    owner: false,
    permissions: [],
    people: false,
    bots: false,
    channels: false,
    folders: false,
  },
])(
  'offers people DMs to the Owner on a Team Host and to members with dm.humans ($owner, $permissions)',
  async ({ enabled, owner, permissions, ...expected }) => {
    expect(await permissionsOf(host(enabled, owner, permissions))).toEqual(expected);
  },
);
