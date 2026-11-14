import { describe, expect, it, vi } from 'vitest';
import { MethodRefused, type HostClient } from '../../../apps/mobile/src/host/client.js';
import { BridgeCallError, type CreatedBot } from '../src/client/bridge.js';
import {
  bindBotCreationOwner,
  remoteCreationOwner,
} from '../src/client/environment-creation-owner.js';
import {
  CREATION_HOST_STORAGE_KEY,
  initialCreationHost,
  lastCreationHost,
  rememberCreationHost,
} from '../src/client/environment-creation-target.js';

const local = { id: 'local', name: 'A', online: true };
const remote = { id: 'remote-b', name: 'B', online: true };

describe('explicit creation target', () => {
  it('requires a choice for All until a target was used, and fixes a single Host scope', () => {
    expect(initialCreationHost('all', [local, remote], undefined)).toBeUndefined();
    expect(initialCreationHost('all', [local], undefined)).toBe(local);
    expect(initialCreationHost(remote.id, [local, remote], local)).toBe(remote);
  });

  it('keeps the previous offline or removed target instead of falling back to local', () => {
    const offline = { ...remote, online: false };
    expect(initialCreationHost('all', [local, offline], remote)).toBe(offline);
    expect(initialCreationHost('all', [local], offline)).toBe(offline);
  });

  it('persists only Client choice and never persists online connection authority', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    rememberCreationHost(storage, remote);
    expect(JSON.parse(values.get(CREATION_HOST_STORAGE_KEY) ?? 'null')).toEqual({
      id: remote.id,
      name: 'B',
    });
    expect(lastCreationHost(storage)).toEqual({ ...remote, online: false });
    storage.setItem(CREATION_HOST_STORAGE_KEY, '{broken');
    expect(lastCreationHost(storage)).toBeUndefined();
  });
});

describe('captured remote creation owner', () => {
  it('preserves the selected Host Human DM refusal and its details', async () => {
    const refusal = new MethodRefused('permission-required', 'Cannot message this person.', {
      permission: 'dm.humans',
    });
    const call = vi.fn<HostClient['call']>().mockRejectedValue(refusal);
    const refresh = vi.fn(async () => {});
    const open = vi.fn();
    const owner = remoteCreationOwner({
      hostId: remote.id,
      client: { call, refresh },
      current: () => true,
      open,
    });
    await expect(owner.call('humanDm', { humanId: 'person-b' })).rejects.toBeInstanceOf(
      BridgeCallError,
    );
    expect(call).toHaveBeenCalledExactlyOnceWith('humanDm', { humanId: 'person-b' });
    expect(refresh).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    await expect(owner.call('humanDm', { humanId: 'person-b' })).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'dm.humans' },
    });
  });
  it('retains the original local open stage after an HTTPS fallback receipt', async () => {
    const created: CreatedBot = {
      slug: 'imported',
      displayName: 'Imported',
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
      roles: [],
      httpsFallback: {
        from: 'git@github.com:a/b.git',
        to: 'https://github.com/a/b.git',
        reason: 'auth',
      },
    };
    const createBot = vi.fn(async () => created);
    const openCreatedBot = vi.fn(async () => {});
    const bound = bindBotCreationOwner({ createBot, openCreatedBot });
    const receipt = await bound.createBot({ displayName: 'Imported', roles: [] }, 'local-section');
    expect(openCreatedBot).not.toHaveBeenCalled();
    await bound.openCreatedBot(receipt, 'local-section');
    expect(openCreatedBot).toHaveBeenCalledExactlyOnceWith(created, 'local-section');
    expect(createBot).toHaveBeenCalledOnce();
  });
  it('keeps equal Channel IDs source qualified through late completion', async () => {
    let finish: ((value: unknown) => void) | undefined;
    const response = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    const call = vi.fn<HostClient['call']>().mockReturnValueOnce(response);
    const refresh = vi.fn(async () => {});
    const open = vi.fn();
    const owner = remoteCreationOwner({
      hostId: remote.id,
      key: () => 'operation-1',
      client: { call, refresh },
      current: () => true,
      open,
    });
    const pending = owner.channel('Remote only');
    finish?.({ channel: { id: 'same-id', type: 'group', name: 'Remote only' } });
    await pending;
    expect(call).toHaveBeenCalledExactlyOnceWith('channelCreate', {
      name: 'Remote only',
      members: [],
      operationKey: 'operation-1',
    });
    expect(open).toHaveBeenCalledExactlyOnceWith({
      hostId: remote.id,
      channelId: 'same-id',
      title: 'Remote only',
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does not open a late result after the captured Client was removed or replaced', async () => {
    let current = true;
    const open = vi.fn();
    const call = vi
      .fn<HostClient['call']>()
      .mockResolvedValue({ channel: { id: 'same-id', type: 'group', name: 'Remote only' } });
    const owner = remoteCreationOwner({
      hostId: remote.id,
      key: () => 'operation-1',
      client: {
        call,
        refresh: async () => {
          current = false;
        },
      },
      current: () => current,
      open,
    });
    await owner.channel('Remote only');
    expect(open).not.toHaveBeenCalled();
  });

  it('creates the Bot, its DM and Section membership through the same captured Host', async () => {
    const call = vi
      .fn<HostClient['call']>()
      .mockResolvedValueOnce({ bot: { slug: 'equal-bot', displayName: 'Remote bot' } })
      .mockResolvedValueOnce({ channel: { id: 'same-id', type: 'dm', name: 'Remote bot' } })
      .mockResolvedValueOnce({});
    const open = vi.fn();
    const owner = remoteCreationOwner({
      hostId: remote.id,
      key: () => 'operation-1',
      client: { call, refresh: async () => {} },
      current: () => true,
      open,
    });
    await owner.bot({ displayName: 'Remote bot', persona: '', roles: [] }, 'same-section');
    expect(call.mock.calls).toEqual([
      [
        'create',
        { displayName: 'Remote bot', persona: '', roles: [], operationKey: 'operation-1' },
      ],
      ['channelDm', { slug: 'equal-bot', displayName: 'Remote bot' }],
      ['channelAssign', { channelId: 'same-id', sectionId: 'same-section', index: undefined }],
    ]);
    expect(open).toHaveBeenCalledExactlyOnceWith({
      hostId: remote.id,
      botSlug: 'equal-bot',
      title: 'Remote bot',
    });
  });

  it('propagates a refusing owner without retrying another Host', async () => {
    const call = vi.fn<HostClient['call']>().mockRejectedValue(new Error('Host unavailable'));
    const open = vi.fn();
    const refresh = vi.fn(async () => {});
    const owner = remoteCreationOwner({
      hostId: remote.id,
      key: () => 'operation-1',
      client: { call, refresh },
      current: () => true,
      open,
    });
    await expect(owner.channel('Remote only')).rejects.toThrow('Host unavailable');
    expect(call).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('waits for Done before opening a Git HTTPS fallback on its captured Host', async () => {
    const call = vi
      .fn<HostClient['call']>()
      .mockResolvedValueOnce({
        source: { kind: 'git', gitUrl: 'git@github.com:a/b.git', commit: 'a'.repeat(40) },
      })
      .mockResolvedValueOnce({
        bot: { slug: 'imported', displayName: 'Imported' },
        httpsFallback: {
          from: 'git@github.com:a/b.git',
          to: 'https://github.com/a/b.git',
          reason: 'auth',
        },
      })
      .mockResolvedValueOnce({ channel: { id: 'dm-imported', type: 'dm', name: 'Imported' } });
    const open = vi.fn();
    const owner = remoteCreationOwner({
      hostId: remote.id,
      key: () => 'operation-1',
      client: { call, refresh: async () => {} },
      current: () => true,
      open,
    });
    const created = await owner.bot({
      displayName: 'Imported',
      gitUrl: 'git@github.com:a/b.git',
      roles: [],
    });
    expect(open).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(2);
    await owner.openBot(created);
    expect(open).toHaveBeenCalledExactlyOnceWith({
      hostId: remote.id,
      title: 'Imported',
      botSlug: 'imported',
    });
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'botImportPreview',
      'createFromGit',
      'channelDm',
    ]);
  });

  it('retries post-create synchronization without creating a second Channel', async () => {
    const call = vi
      .fn<HostClient['call']>()
      .mockResolvedValue({ channel: { id: 'same-id', type: 'group', name: 'Remote only' } });
    const refresh = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce();
    const open = vi.fn();
    const committed = vi.fn();
    const owner = remoteCreationOwner({
      hostId: remote.id,
      key: () => 'operation-1',
      client: { call, refresh },
      current: () => true,
      open,
      committed,
    });
    await expect(owner.channel('Remote only')).rejects.toThrow('refresh failed');
    await owner.channel('Remote only');
    expect(call).toHaveBeenCalledOnce();
    expect(committed).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledExactlyOnceWith({
      hostId: remote.id,
      channelId: 'same-id',
      title: 'Remote only',
    });
  });

  it('retries Section assignment on the existing Bot receipt after a partial success', async () => {
    const call = vi
      .fn<HostClient['call']>()
      .mockResolvedValueOnce({ bot: { slug: 'created-once', displayName: 'Remote' } })
      .mockResolvedValueOnce({ channel: { id: 'dm-created-once', type: 'dm', name: 'Remote' } })
      .mockRejectedValueOnce(new Error('assignment failed'))
      .mockResolvedValueOnce({});
    const owner = remoteCreationOwner({
      hostId: remote.id,
      key: () => 'operation-1',
      client: { call, refresh: async () => {} },
      current: () => true,
      open: vi.fn(),
    });
    const input = { displayName: 'Remote', roles: [] };
    await expect(owner.bot(input, 'section-b')).rejects.toThrow('assignment failed');
    await owner.bot(input, 'section-b');
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'create',
      'channelDm',
      'channelAssign',
      'channelAssign',
    ]);
  });
});
