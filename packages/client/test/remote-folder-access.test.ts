import { expect, it, vi } from 'vitest';
import { createHostClient } from '../../../apps/mobile/src/host/client.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { createActions } from '../src/client/actions.js';
import { hostBridgeCall } from '../src/client/host-bridge-call.js';
import { remoteFolderAccess } from '../src/client/remote-folder-access.js';
import { createRemoteNativeConversation } from '../src/client/remote-native-conversation.js';
import { createStore } from '../src/client/store.js';

async function fixture() {
  const host = new FakeHost('target-b');
  const client = createHostClient({
    routes: ['https://target-b.test.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
  });
  client.start();
  await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
  let current = true;
  const folders = remoteFolderAccess(client, () => current);
  const actions = createActions(
    hostBridgeCall(client, () => current),
    createStore(),
    folders,
  );
  host.calls.length = 0;
  return {
    host,
    client,
    folders,
    actions,
    leave: () => {
      current = false;
    },
  };
}

it('keeps target folder entries and pagination without offering its native OS picker', async () => {
  const f = await fixture();
  const source = createRemoteNativeConversation(
    f.client,
    { hostId: 'target-b', title: 'Target', botSlug: 'ada' },
    () => true,
  );
  const listing = {
    path: '/target',
    home: '/target',
    truncated: true,
    nextOffset: 100,
    crumbs: [],
    roots: [],
    entries: [{ name: 'project', path: '/target/project', hidden: false }],
  };
  f.host.methods.set('folderBrowse', () => ({ ...listing, nativePicker: true }));
  try {
    source.start();
    await expect(source.actions.listHostFolders('/target', undefined, 50)).resolves.toEqual(
      listing,
    );
    expect(f.host.calls).toContainEqual({
      method: 'folderBrowse',
      args: { path: '/target', offset: 50 },
    });
    source.stop();
    f.host.calls.length = 0;
    await expect(source.actions.resolveWorkspaceFolder('/target/project')).rejects.toMatchObject({
      code: 'connection-host-changed',
    });
    expect(f.host.calls).toEqual([]);
  } finally {
    source.stop();
    f.client.stop();
  }
});

it('resolves the selected target folder through its canonical Workspace owner', async () => {
  const f = await fixture();
  f.host.methods.set('workspace/create', () => ({ workspace: { workspaceId: 'ws-b' } }));
  f.host.methods.set('workspaceOptions', () => ({
    workspaces: [{ id: 'ws-b', path: '/target/project', title: 'project' }],
  }));
  try {
    await expect(f.actions.resolveWorkspaceFolder('/target/project')).resolves.toEqual({
      id: 'ws-b',
      path: '/target/project',
      title: 'project',
    });
    expect(f.host.calls).toEqual([
      { method: 'workspace/create', args: { request: { path: '/target/project' } } },
      { method: 'workspaceOptions', args: {} },
    ]);
  } finally {
    f.client.stop();
  }
});

it('refuses the local OS picker without making a Host request', async () => {
  const f = await fixture();
  try {
    await expect(f.folders.pickDirectory()).rejects.toMatchObject({
      code: 'directory-picker/unavailable',
    });
    expect(f.host.calls).toEqual([]);
  } finally {
    f.client.stop();
  }
});

it('does not submit a Workspace after the captured source has changed', async () => {
  const f = await fixture();
  try {
    f.leave();
    await expect(f.actions.authorizeWorkspacePath('ada', '/target/project')).rejects.toMatchObject({
      code: 'connection-host-changed',
    });
    expect(f.host.calls).toEqual([]);
  } finally {
    f.client.stop();
  }
});

it('does not grant or read back a late Workspace result after leaving the source', async () => {
  const f = await fixture();
  let finish: (() => void) | undefined;
  f.host.methods.set('workspace/create', async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { workspace: { workspaceId: 'ws-b' } };
  });
  try {
    const pending = f.actions.authorizeWorkspacePath('ada', '/target/project');
    await vi.waitFor(() => expect(finish).toBeDefined());
    f.leave();
    finish!();
    await expect(pending).rejects.toMatchObject({ code: 'connection-host-changed' });
    expect(f.host.calls.map((call) => call.method)).toEqual(['workspace/create']);
  } finally {
    finish?.();
    f.client.stop();
  }
});
