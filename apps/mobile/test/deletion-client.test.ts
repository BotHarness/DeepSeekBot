import { expect, it } from 'vitest';
import { createHostClient } from '@botharness/host-client/client';
import { confirmBotDeletion, previewDeletion } from '../src/host/deletion';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';

it('carries the reviewed deletion scope through the paired-device client and rejects malformed previews', async () => {
  const host = new FakeHost();
  const preview = {
    slug: 'ada',
    displayName: 'Ada',
    memoryDir: '/memory/ada',
    token: 'scope-1',
    eraseAvailable: true,
    dependencies: { sessions: [], workspaces: [], grants: [], identities: [], channels: [] },
  };
  host.methods.set('deletionPreview', () => ({ preview }));
  host.methods.set('deletionConfirm', () => ({
    deletion: {
      slug: 'ada',
      displayName: 'Ada',
      memoryDir: '/memory/ada',
      acceptedAt: '2026-11-20T00:00:00Z',
      phase: 'complete',
      memory: 'retained',
      eraseMemory: false,
    },
  }));
  const client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
  });
  try {
    const reviewed = await previewDeletion(client, 'ada');
    expect(await confirmBotDeletion(client, reviewed, false)).toEqual({
      phase: 'complete',
      memory: 'retained',
      eraseMemory: false,
    });
    expect(host.calls).toContainEqual({
      method: 'deletionConfirm',
      args: { slug: 'ada', token: 'scope-1', eraseMemory: false },
    });
    expect(host.requests).toContain(
      'POST https://studio.tailnet-example.ts.net/botharness-device/api/botharness/deletionConfirm',
    );
    host.methods.set('deletionPreview', () => ({ preview: { ...preview, slug: 'someone-else' } }));
    await expect(previewDeletion(client, 'ada')).rejects.toThrow(
      'deletionPreview returned an invalid deletion scope.',
    );
  } finally {
    client.stop();
  }
});
