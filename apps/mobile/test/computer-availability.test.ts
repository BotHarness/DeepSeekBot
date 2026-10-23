import { describe, expect, it, vi } from 'vitest';
import { readComputerAvailability } from '../src/host/computer-availability';

describe('paired Host Computer discovery', () => {
  it('discovers Local Computer without opening a viewer or selecting a Bot', async () => {
    const api = vi.fn(async () => ({
      status: 200,
      body: { ok: true, state: { computerId: 'local', runtimeId: 'runtime-1' } },
    }));
    expect(await readComputerAvailability(api, true)).toBe(true);
    expect(api.mock.calls).toEqual([['/api/computer/video', { body: { kind: 'status' } }]]);
  });
  it.each(['unsupported-platform', 'not-ready'])(
    'distinguishes unsupported LAN Host: %s',
    async (code) => {
      const api = async () => ({ status: 409, body: { ok: false, code } });
      expect(await readComputerAvailability(api, true)).toBe(
        code === 'unsupported-platform' ? false : undefined,
      );
    },
  );
  it.each([404, 403, 503])('does not infer support from a failed status: %s', async (status) => {
    expect(await readComputerAvailability(async () => ({ status, body: {} }), false)).toBe(
      status === 404 ? false : undefined,
    );
  });
  it.each([true, false])(
    'discovers HTTPS/container support even when provider readiness is %s',
    async (available) => {
      const api = vi.fn(async () => ({ status: 200, body: { probe: { available } } }));
      expect(await readComputerAvailability(api, false)).toBe(true);
      expect(api.mock.calls).toEqual([['/api/computer/status']]);
    },
  );
});
import { createHostClient, type HostClient } from '../src/host/client';
import { FakeHost } from './fake-host';
import wire from './fixtures/host-wire.json';
import { afterEach } from 'vitest';
const clients: HostClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.stop();
});
const route = 'https://studio.tailnet-example.ts.net';
async function settled(client: HostClient, available: boolean) {
  for (let n = 0; n < 100; n++) {
    const snapshot = client.getSnapshot();
    if (snapshot.roster && snapshot.computerAvailable === available) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Host capability did not settle');
}
function paired(hostId: string, capability: () => boolean | undefined) {
  const host = new FakeHost();
  const sample = wire.rpc.list.at(-1)!.body.result.value.bots[0]!;
  host.methods.set('list', () => ({
    bots: [
      { ...sample, slug: 'tools-on', computerAccess: true },
      { ...sample, slug: 'tools-off', computerAccess: false },
    ],
  }));
  const client = createHostClient({
    hostId,
    credential: host.credential,
    routes: [route],
    carrier: {
      ...host.carrier,
      request: async (url, init) => {
        if (!url.endsWith('/api/computer/status')) return host.carrier.request(url, init);
        expect(init.headers?.['authorization']).toBe(`Device ${host.credential}`);
        const available = capability();
        if (available === false) return { status: 404, text: async () => '{}' };
        if (available === undefined) throw new TypeError('temporary offline');
        return { status: 200, text: async () => JSON.stringify({ probe: { available } }) };
      },
    },
  });
  clients.push(client);
  client.start();
  return client;
}
it('all Bots share their own Host capability while model tool opt-ins remain distinct', async () => {
  let capability: boolean | undefined = true;
  const supported = paired('supported-host', () => capability);
  const snapshot = await settled(supported, true);
  expect(snapshot.roster?.bots.map((bot) => bot.computerAccess)).toEqual([true, false]);
  const unsupported = paired('another-host', () => false);
  expect((await settled(unsupported, false)).computerAvailable).toBe(false);
  expect(supported.getSnapshot().computerAvailable).toBe(true);
  capability = undefined;
  await supported.refresh();
  expect(supported.getSnapshot().computerAvailable).toBe(true);
  capability = false;
  await supported.refresh();
  expect((await settled(supported, false)).computerAvailable).toBe(false);
});

it('discards old-generation credential refusals but honors current probe revocation', async () => {
  const host = new FakeHost();
  let releaseOld!: () => void;
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  let calls = 0;
  let oldRead = false;
  let revoke = false;
  const client = createHostClient({
    hostId: 'supported-host',
    credential: host.credential,
    routes: [route],
    carrier: {
      ...host.carrier,
      request: async (url, init) => {
        if (!url.endsWith('/api/computer/status')) return host.carrier.request(url, init);
        calls += 1;
        if (calls === 1) {
          await oldGate;
          return {
            status: 401,
            text: async () => {
              oldRead = true;
              return JSON.stringify({ code: 'device-revoked' });
            },
          };
        }
        return {
          status: revoke ? 401 : 200,
          text: async () =>
            JSON.stringify(revoke ? { code: 'device-revoked' } : { probe: { available: true } }),
        };
      },
    },
  });
  clients.push(client);
  client.start();
  await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
  expect(calls).toBe(1);
  client.stop();
  client.start();
  await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
  await settled(client, true);
  releaseOld();
  await vi.waitFor(() => expect(oldRead).toBe(true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(client.getSnapshot().connection.status).toBe('connected');
  revoke = true;
  await client.refresh();
  await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('refused'));
});
