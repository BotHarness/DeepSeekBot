import { describe, expect, it, vi } from 'vitest';
import { botCreationTransport } from '../src/host/bot-creation-transport';
import { botCreationTargets } from '../src/host/bot-creation-targets';
import type { HostCarrier } from '../src/host/carrier';
import type { SavedHost } from '../src/host/hosts';
import type { BotCreationOperation } from '../src/host/bot-creation';

const operation: BotCreationOperation = {
  hostId: 'B',
  deviceId: 'phone-b',
  operationKey: 'test-operation',
  input: { displayName: 'Helper', persona: 'Write clearly', description: '', roles: [] },
};
const a: SavedHost = {
  hostId: 'A',
  hostName: 'Same name',
  deviceId: 'phone-a',
  credential: 'credential-a',
  routes: ['https://a.ts.net'],
};
const b: SavedHost = {
  hostId: 'B',
  hostName: 'Same name',
  deviceId: 'phone-b',
  credential: 'credential-b',
  routes: ['https://b.ts.net', 'https://b2.ts.net'],
};
const answer = (value: unknown) => ({
  status: 200,
  text: async () => JSON.stringify({ type: 'server-response', result: { ok: true, value } }),
});

function carrier() {
  const request = vi.fn<HostCarrier['request']>();
  const openSocket = vi.fn<HostCarrier['openSocket']>();
  return { request, openSocket };
}

describe('target-bound creation transport', () => {
  it('previews and imports a Git source through B with the same pinned revision and receipt', async () => {
    const network = carrier();
    const source = {
      kind: 'git' as const,
      gitUrl: 'https://github.com/a/b.git',
      commit: 'a'.repeat(40),
    };
    const imported = { ...operation, source };
    const receipt = {
      operationKey: operation.operationKey,
      botSlug: 'git-bot',
      status: 'created',
      channelId: 'git-dm',
    };
    network.request
      .mockResolvedValueOnce(answer({ source }))
      .mockResolvedValueOnce(answer({ receipt: null }))
      .mockResolvedValueOnce(answer({ receipt }));
    const transport = botCreationTransport(() => [a, b], network);
    expect(
      await transport.preview!({ hostId: 'B', deviceId: 'phone-b' }, 'https://github.com/a/b'),
    ).toEqual(source);
    expect(await transport.lookup(imported)).toBeNull();
    expect(await transport.create(imported)).toEqual(receipt);
    expect(network.request.mock.calls.map(([url]) => url)).toEqual([
      'https://b.ts.net/botharness-device/api/botharness/botImportPreview',
      'https://b.ts.net/botharness-device/api/botharness/botImportLookup',
      'https://b.ts.net/botharness-device/api/botharness/createFromGit',
    ]);
    expect(JSON.parse(String(network.request.mock.calls[2]?.[1].body)).payload.args).toMatchObject({
      gitUrl: source.gitUrl,
      expectedCommit: source.commit,
      operationKey: operation.operationKey,
      displayName: 'Helper',
    });
  });
  it('applies a chosen avatar to the created Bot through the existing appearance operations', async () => {
    const network = carrier();
    network.request.mockResolvedValue(answer({ bot: {} }));
    const transport = botCreationTransport(() => [a, b], network);
    const receipt = {
      operationKey: operation.operationKey,
      botSlug: 'new-bot',
      status: 'created' as const,
      channelId: 'dm-new-bot',
    };
    await transport.applyAvatar!(operation, receipt, { kind: 'generated', seed: 'seed-1' });
    await transport.applyAvatar!(operation, receipt, {
      kind: 'photo',
      image: 'data:image/jpeg;base64,AAAA',
    });
    expect(network.request.mock.calls.map(([url]) => url)).toEqual([
      'https://b.ts.net/botharness-device/api/botharness/botAppearanceSet',
      'https://b.ts.net/botharness-device/api/botharness/botAvatarSet',
    ]);
    const args = network.request.mock.calls.map(
      ([, request]) => JSON.parse(String(request.body)).payload.args,
    );
    expect(args[0]).toMatchObject({ channelId: 'dm-new-bot', recipe: { family: 'illustrated' } });
    expect(args[1]).toEqual({ channelId: 'dm-new-bot', avatar: 'data:image/jpeg;base64,AAAA' });
  });
  it('uses B’s credential and routes without opening a live connection or visiting A', async () => {
    const network = carrier();
    network.request
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(answer({ receipt: null }));
    const transport = botCreationTransport(() => [a, b], network);
    expect(await transport.lookup(operation)).toBeNull();
    expect(network.request.mock.calls.map(([url]) => url)).toEqual([
      'https://b.ts.net/botharness-device/api/botharness/createLookup',
      'https://b2.ts.net/botharness-device/api/botharness/createLookup',
    ]);
    for (const [, request] of network.request.mock.calls) {
      expect(request.headers?.authorization).toBe('Device credential-b');
      expect(JSON.parse(String(request.body)).payload.args).toEqual({
        ...operation.input,
        operationKey: operation.operationKey,
      });
    }
    expect(network.openSocket).not.toHaveBeenCalled();
  });

  it('does not try another route after a business refusal or revoked credential', async () => {
    const network = carrier();
    const transport = botCreationTransport(() => [a, b], network);
    network.request.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          type: 'server-response',
          result: { ok: false, error: { code: 'METHOD_NOT_FOUND' } },
        }),
    });
    await expect(transport.lookup(operation)).rejects.toMatchObject({
      code: 'host-update-required',
    });
    expect(network.request).toHaveBeenCalledTimes(1);
    network.request.mockResolvedValue({
      status: 401,
      text: async () => JSON.stringify({ code: 'device-revoked' }),
    });
    await expect(transport.lookup(operation)).rejects.toMatchObject({ code: 'device-revoked' });
    expect(network.request).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid receipt identities rather than treating an HTTP success as creation', async () => {
    const network = carrier();
    network.request.mockResolvedValue(
      answer({
        receipt: {
          operationKey: 'another-key',
          botSlug: 'wrong',
          status: 'created',
          channelId: 'dm-wrong',
        },
      }),
    );
    await expect(botCreationTransport(() => [b], network).lookup(operation)).rejects.toMatchObject({
      code: 'invalid-receipt',
    });
    expect(network.request).toHaveBeenCalledTimes(1);
  });

  it('rechecks current pairing before route fallback and before accepting a response', async () => {
    const network = carrier();
    let hosts = [b];
    const transport = botCreationTransport(() => hosts, network);
    network.request.mockImplementationOnce(async () => {
      hosts = [];
      throw new Error('offline');
    });
    await expect(transport.lookup(operation)).rejects.toMatchObject({ code: 'target-unpaired' });
    expect(network.request).toHaveBeenCalledTimes(1);
    hosts = [b];
    network.request.mockImplementationOnce(async () => {
      hosts = [{ ...b, credential: 'rotated' }];
      return answer({ receipt: null });
    });
    await expect(transport.lookup(operation)).rejects.toMatchObject({ code: 'target-unpaired' });
  });

  it('lists all paired destinations and only disambiguates identical names with a unique suffix', () => {
    const targets = botCreationTargets([
      { hostId: 'alpha-000001', name: 'Desktop' },
      { hostId: 'beta-100001', name: 'Desktop' },
      { hostId: 'c', name: 'Laptop' },
    ]);
    expect(targets).toEqual([
      { value: 'alpha-000001', label: 'Desktop · 000001' },
      { value: 'beta-100001', label: 'Desktop · 100001' },
      { value: 'c', label: 'Laptop' },
    ]);
  });
});
