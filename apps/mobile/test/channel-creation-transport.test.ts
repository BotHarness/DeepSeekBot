import { expect, it, vi } from 'vitest';
import { channelCreationTransport } from '../src/host/channel-creation-transport';
import { createChannelCreation } from '../src/host/channel-creation';
import { ChannelCreationNotAccepted } from '../src/host/channel-creation';
import type { HostCarrier } from '../src/host/carrier';
import type { SavedHost } from '../src/host/hosts';
import { seededAvatarFor } from '../../../packages/core/src/bots/avatar-appearance';

const hosts: SavedHost[] = ['A', 'B'].map((hostId) => ({
  hostId,
  hostName: 'Same name',
  deviceId: `phone-${hostId}`,
  credential: `credential-${hostId}`,
  routes: [`https://${hostId.toLowerCase()}.ts.net`],
}));
const answer = (value: unknown) => ({
  status: 200,
  text: async () => JSON.stringify({ type: 'server-response', result: { ok: true, value } }),
});

it('creates on the chosen Host through the authenticated client with only eligible selected Bots', async () => {
  const request = vi.fn<HostCarrier['request']>(async (url, options) => {
    const method = url.split('/').at(-1);
    const args = JSON.parse(String(options.body)).payload.args;
    if (method === 'list')
      return answer({
        bots: [
          { slug: 'ada', displayName: 'Ada' },
          { slug: 'bo', displayName: 'Bo' },
          { slug: 'archived', displayName: 'Archived', paused: true },
          { slug: 'deleted', displayName: 'Deleted', deleted: true },
          { slug: 'bot-random-steward', displayName: 'Renamed Tob', tob: { defaultName: false } },
        ],
      });
    expect(method).toBe('channelCreate');
    expect(args).toEqual({
      name: 'Team',
      members: ['ada', 'bo'],
      operationKey: 'mobile-test-channel',
    });
    return answer({
      channel: { id: 'group-team', members: ['ada', 'bo'] },
      receipt: {
        operationKey: 'mobile-test-channel',
        channelId: 'group-team',
        status: 'completed',
      },
    });
  });
  const controller = createChannelCreation({
    key: () => 'mobile-test-channel',
    storage: { read: async () => undefined, write: async () => {} },
    port: channelCreationTransport(() => hosts, { request, openSocket: vi.fn() }),
  });
  await controller.ready;
  await controller.selectHost('B');
  expect(controller.getSnapshot().candidates).toEqual([
    { slug: 'ada', displayName: 'Ada' },
    { slug: 'bo', displayName: 'Bo' },
  ]);
  controller.rename('Team');
  controller.toggle('ada');
  controller.toggle('bo');
  await controller.submit();
  expect(controller.getSnapshot().result).toBe('group-team');
  expect(
    request.mock.calls.every(
      ([url, options]) =>
        url.startsWith('https://b.ts.net/') &&
        options.headers?.authorization === 'Device credential-B',
    ),
  ).toBe(true);
});

it('does not send to another pairing after a submitted destination is unpaired', async () => {
  const request = vi.fn<HostCarrier['request']>();
  const transport = channelCreationTransport(() => hosts, { request, openSocket: vi.fn() });
  await expect(
    transport.create({
      hostId: 'B',
      deviceId: 'old-phone',
      name: 'Team',
      members: [],
      operationKey: 'mobile-test-channel',
    }),
  ).rejects.toThrow('target-unpaired');
  expect(request).not.toHaveBeenCalled();
});

it('keeps an ambiguous first-route mutation locked even when another route refuses its replay', async () => {
  const request = vi
    .fn<HostCarrier['request']>()
    .mockRejectedValueOnce(new Error('reply lost'))
    .mockResolvedValueOnce({
      status: 200,
      text: async () =>
        JSON.stringify({
          type: 'server-response',
          result: { ok: false, error: { code: 'unknown-bot', message: 'Unknown Bot' } },
        }),
    });
  const target: SavedHost = {
    hostId: 'B',
    hostName: 'B',
    deviceId: 'phone',
    credential: 'credential',
    routes: ['https://b.ts.net', 'https://b2.ts.net'],
  };
  const port = channelCreationTransport(() => [target], { request, openSocket: vi.fn() });
  let error: unknown;
  try {
    await port.create({
      hostId: 'B',
      deviceId: 'phone',
      name: 'Team',
      members: ['ada'],
      operationKey: 'channel-uncertain',
    });
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(ChannelCreationNotAccepted);
});

it('retains the chosen Host artwork, seed and authenticated custom avatar source', async () => {
  const appearance = { revision: 'a'.repeat(64), recipe: seededAvatarFor('Ada', 2) };
  const request = vi.fn<HostCarrier['request']>(async () =>
    answer({
      bots: [
        { slug: 'ada', displayName: 'Ada', appearance, avatarSeed: 2 },
        { slug: 'bo', displayName: 'Bo', avatar: '/avatars/bo.png' },
      ],
    }),
  );
  const port = channelCreationTransport(() => hosts, { request, openSocket: vi.fn() });
  expect(await port.candidates('B')).toEqual([
    { slug: 'ada', displayName: 'Ada', appearance, avatarSeed: 2 },
    {
      slug: 'bo',
      displayName: 'Bo',
      avatarSource: {
        uri: 'https://b.ts.net/botharness-device/avatars/bo.png',
        headers: { authorization: 'Device credential-B' },
      },
    },
  ]);
});

it('keeps fallback avatars for malformed optional metadata without attaching credentials to external URLs', async () => {
  const request = vi.fn<HostCarrier['request']>(async () =>
    answer({
      bots: [
        { slug: 'ada', displayName: 'Ada', avatarSeed: 42, avatar: '//other.example/a.png' },
        { slug: 'bo', displayName: 'Bo', avatar: 'https://other.example/b.png' },
      ],
    }),
  );
  const port = channelCreationTransport(() => hosts, { request, openSocket: vi.fn() });
  expect(await port.candidates('B')).toEqual([
    { slug: 'ada', displayName: 'Ada' },
    { slug: 'bo', displayName: 'Bo' },
  ]);
  expect(request).toHaveBeenCalledTimes(1);
});
