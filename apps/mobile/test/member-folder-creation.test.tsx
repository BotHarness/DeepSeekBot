// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { HostClient } from '@botharness/host-client/client';
import {
  markMemberClient,
  refreshMemberPermissions,
  useCreateFolder,
} from '../src/host/member-permissions';
import { fakeTeamMode } from '../../../packages/host-client/test/reader-fixtures.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let seen: ReturnType<typeof useCreateFolder> | 'unset' = 'unset';
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  seen = 'unset';
});

function Probe({ client }: { client: HostClient }) {
  seen = useCreateFolder(client);
  return null;
}

function host(permissions: string[]) {
  const call = vi.fn(async (method: string, args: Record<string, unknown>) => {
    if (method === 'teamMode') return fakeTeamMode({ kind: 'member', permissions });
    if (method === 'folderCreate')
      return { id: 'ws-1', path: `${String(args['parent'])}/New`, title: 'New' };
    throw new Error(`unexpected ${method}`);
  });
  return { call, client: { call } as unknown as HostClient };
}

async function render(client: HostClient) {
  const view = document.createElement('div');
  root = createRoot(view);
  await act(async () => root!.render(<Probe client={client} />));
}

it('lets the Owner create folders without reading Team permissions', async () => {
  const { call, client } = host([]);
  await render(client);
  expect(seen).toBeTypeOf('function');
  await (seen as NonNullable<typeof seen>)('/Users/qa', 'New');
  expect(call.mock.calls).toEqual([['folderCreate', { parent: '/Users/qa', name: 'New' }]]);
});

it('hides New folder from a member until the Host Permission is known', async () => {
  const { client } = host(['workspaces.createFolder']);
  markMemberClient(client);
  await render(client);
  expect(seen).toBeUndefined();
  await act(async () => refreshMemberPermissions(client));
  expect(seen).toBeTypeOf('function');
});

it('keeps New folder hidden from a member without the Host Permission', async () => {
  const { client } = host(['workspaces.manageShared']);
  markMemberClient(client);
  await act(async () => refreshMemberPermissions(client));
  await render(client);
  expect(seen).toBeUndefined();
});
