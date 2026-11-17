import { describe, expect, it } from 'vitest';

import { HostAnswerInvalid } from '@botharness/host-client/bot-settings';
import type { HostClient } from '@botharness/host-client/client';
import { loadStorageUsage, previewStorageMessages } from '@botharness/host-client/storage';
import { bridgeHost, type BridgeCall } from '../src/client/bridge.js';

const answer = {
  totalBytes: 2048,
  parts: [
    { kind: 'media', bytes: 1024 },
    { kind: 'thumbnails', bytes: 9 },
  ],
  chats: [
    { channelId: 'c1', name: 'Tob', type: 'dm', messages: 3, mediaBytes: 512 },
    { channelId: 'c2', messages: 1 },
  ],
};

const localHost = (value: unknown): Pick<HostClient, 'call'> => {
  const call: BridgeCall = async () => ({ ok: true, value });
  return bridgeHost(call);
};

const remoteHost = (value: unknown): Pick<HostClient, 'call'> => ({
  call: async <T>() => value as T,
});

describe('storage readers', () => {
  it('give the desktop Host and a phone or remote Host the same storage usage', async () => {
    const local = await loadStorageUsage(localHost(answer));
    const remote = await loadStorageUsage(remoteHost(answer));
    expect(remote).toEqual(local);
    expect(local).toEqual({
      totalBytes: 2048,
      parts: [{ kind: 'media', bytes: 1024 }],
      chats: [{ channelId: 'c1', name: 'Tob', type: 'dm', messages: 3, mediaBytes: 512 }],
    });
  });

  it('refuse a malformed answer the same way on both', async () => {
    await expect(loadStorageUsage(localHost({ totalBytes: 1 }))).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
    await expect(loadStorageUsage(remoteHost({ totalBytes: 1 }))).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
    await expect(
      previewStorageMessages(remoteHost({ scope: {} }), { before: '2026-01-01' }),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
  });
});
