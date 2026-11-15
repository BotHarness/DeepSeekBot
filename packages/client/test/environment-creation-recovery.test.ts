import { describe, expect, it, vi } from 'vitest';
import type { HostClient } from '../../../apps/mobile/src/host/client.js';
import type { BridgeActions } from '../src/client/actions.js';
import type { CreatedBot } from '../src/client/bridge.js';
import {
  localCreationOwner,
  remoteCreationOwner,
} from '../src/client/environment-creation-owner.js';

describe('creation outcome recovery', () => {
  it('replays a lost Channel response with the same operation key and original input', async () => {
    const records = new Map<string, { channel: { id: string; type: string; name: string } }>();
    let creations = 0;
    let loseReply = true;
    const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
      if (
        method !== 'channelCreate' ||
        typeof args?.operationKey !== 'string' ||
        typeof args.name !== 'string'
      )
        throw new Error('Unexpected owner call');
      let receipt = records.get(args.operationKey);
      if (!receipt) {
        creations += 1;
        receipt = { channel: { id: 'created-once', type: 'group', name: args.name } };
        records.set(args.operationKey, receipt);
      }
      if (loseReply) {
        loseReply = false;
        throw new Error('reply lost after commit');
      }
      return receipt;
    });
    const owner = remoteCreationOwner({
      hostId: 'remote-b',
      client: { call, refresh: async () => {} },
      current: () => true,
      open: vi.fn(),
      key: () => 'one-channel-operation',
    });
    await expect(owner.channel('Original')).rejects.toThrow('reply lost after commit');
    const result = await owner.channel('Edited after unknown');
    expect(result.name).toBe('Original');
    expect(creations).toBe(1);
    expect(call.mock.calls[0]).toEqual(call.mock.calls[1]);
  });

  it('keeps the Bot operation identity after a lost response and refuses a replacement Client', async () => {
    let current = true;
    const call = vi.fn<HostClient['call']>().mockRejectedValueOnce(new Error('reply lost'));
    const owner = remoteCreationOwner({
      hostId: 'remote-b',
      client: { call, refresh: async () => {} },
      current: () => current,
      open: vi.fn(),
      key: () => 'one-bot-operation',
    });
    await expect(owner.bot({ displayName: 'Original', roles: [] })).rejects.toThrow('reply lost');
    current = false;
    await expect(owner.bot({ displayName: 'Edited', roles: [] })).rejects.toThrow(
      'connection changed',
    );
    expect(call).toHaveBeenCalledExactlyOnceWith('create', {
      displayName: 'Original',
      roles: [],
      operationKey: 'one-bot-operation',
    });
  });

  it('recovers a committed Bot after its create response was lost without allocating another Bot', async () => {
    let creations = 0;
    let lost = false;
    const records = new Map<string, { bot: { slug: string; displayName: string } }>();
    const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
      if (method === 'channelDm')
        return { channel: { id: 'dm-only', type: 'dm', name: 'Original' } };
      if (
        method !== 'create' ||
        typeof args?.operationKey !== 'string' ||
        typeof args.displayName !== 'string'
      )
        throw new Error('Unexpected call');
      let receipt = records.get(args.operationKey);
      if (!receipt) {
        creations += 1;
        receipt = { bot: { slug: 'only-bot', displayName: args.displayName } };
        records.set(args.operationKey, receipt);
      }
      if (!lost) {
        lost = true;
        throw new Error('response lost after commit');
      }
      return receipt;
    });
    const owner = remoteCreationOwner({
      hostId: 'remote-b',
      client: { call, refresh: async () => {} },
      current: () => true,
      open: vi.fn(),
      key: () => 'same-bot-operation',
    });
    await expect(owner.bot({ displayName: 'Original', roles: [] })).rejects.toThrow(
      'response lost',
    );
    const receipt = await owner.bot({ displayName: 'Changed draft', roles: [] });
    expect(receipt.displayName).toBe('Original');
    expect(creations).toBe(1);
    const writes = call.mock.calls.filter(([method]) => method === 'create');
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(writes[1]);
  });

  it('reuses local Bot and Channel operation keys after unknown outcomes', async () => {
    const bot: CreatedBot = {
      slug: 'local-once',
      displayName: 'Local',
      roles: [],
      createdAt: '',
      workspaces: [],
      aggregateState: 'idle',
    };
    const createBot = vi
      .fn<BridgeActions['createBot']>()
      .mockRejectedValueOnce(new Error('reply lost'))
      .mockResolvedValueOnce(bot);
    const createGroup = vi
      .fn<BridgeActions['createGroup']>()
      .mockRejectedValueOnce(new Error('reply lost'))
      .mockResolvedValueOnce(undefined);
    const owner = localCreationOwner(
      {
        createBot,
        createGroup,
        openCreatedBot: async () => {},
        previewBotImport: async () => ({
          gitUrl: 'https://example.com/bot.git',
          commit: 'a'.repeat(40),
        }),
      },
      { submitted: vi.fn(), committed: vi.fn() },
      () => 'local-operation',
    );
    await expect(owner.createBot({ displayName: 'Local', roles: [] })).rejects.toThrow(
      'reply lost',
    );
    await owner.createBot({ displayName: 'Changed', roles: [] });
    expect(createBot.mock.calls[0]).toEqual(createBot.mock.calls[1]);
    await expect(owner.createGroup('Original')).rejects.toThrow('reply lost');
    await owner.createGroup('Changed');
    expect(createGroup.mock.calls[0]).toEqual(createGroup.mock.calls[1]);
  });
});
