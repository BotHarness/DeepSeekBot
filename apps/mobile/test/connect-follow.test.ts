import { expect, it } from 'vitest';
import type { ConnectHost } from '../src/host/connect-account';
import { followConnectHosts } from '../src/host/connect-follow';
import { accountHostAdded } from '../src/host/account-pairing';
import { parseSavedHost, type SavedHost } from '../src/host/hosts';

const owner = {
  issuer: 'https://api.workos.com' as const,
  relay: 'https://connect.botharness.ai',
  clientId: 'client',
  subject: 'user_a',
};
const studio: SavedHost = {
  accountOwner: owner,
  hostId: 'dsh-studio',
  hostName: 'Studio',
  routes: ['http://192.168.1.4:3000', 'https://haaaaaaaaaaab.deepseekbot.dev'],
  deviceId: 'device',
  credential: 'fixture',
};
const listed = (hostname: string): ConnectHost => ({
  id: 'haaaaaaaaaaab',
  name: 'Studio',
  hostname,
  online: true,
});

it('follows a computer that came back on a fresh Connect hostname and remembers it', () => {
  const [follow] = followConnectHosts([studio], [listed('hbbbbbbbbbbbb.tobs.app')]);
  expect(follow).toEqual({
    hostId: 'dsh-studio',
    credential: 'fixture',
    connectHost: 'haaaaaaaaaaab',
    routes: ['http://192.168.1.4:3000', 'https://hbbbbbbbbbbbb.tobs.app'],
  });
  const moved = { ...studio, connectHost: follow!.connectHost, routes: follow!.routes };
  expect(followConnectHosts([moved], [listed('hcccccccccccc.deepseekbot.dev')])[0]?.routes).toEqual(
    ['http://192.168.1.4:3000', 'https://hcccccccccccc.deepseekbot.dev'],
  );
  expect(followConnectHosts([moved], [listed('hbbbbbbbbbbbb.tobs.app')])).toEqual([]);
  expect(accountHostAdded(listed('hzzzzzzzzzzzz.tobs.app'), [moved])).toBe(true);
});

it('leaves computers alone without an account, a matching Connect host or a valid hostname', () => {
  const { accountOwner: _owner, ...manual } = studio;
  expect(followConnectHosts([manual], [listed('hbbbbbbbbbbbb.tobs.app')])).toEqual([]);
  expect(
    followConnectHosts([studio], [{ ...listed('hbbbbbbbbbbbb.tobs.app'), id: 'hother0000000' }]),
  ).toEqual([]);
  expect(followConnectHosts([studio], [listed('evil.example.com')])).toEqual([]);
  expect(
    followConnectHosts(
      [{ ...studio, routes: ['http://192.168.1.4:3000'] }],
      [listed('hbbbbbbbbbbbb.tobs.app')],
    ),
  ).toEqual([]);
});

it('keeps only a well-formed remembered Connect host when reading saved computers', () => {
  expect(parseSavedHost({ ...studio, connectHost: 'haaaaaaaaaaab' })?.connectHost).toBe(
    'haaaaaaaaaaab',
  );
  expect(parseSavedHost({ ...studio, connectHost: '../x' })?.connectHost).toBeUndefined();
});
