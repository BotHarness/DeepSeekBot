import { describe, expect, it, vi } from 'vitest';

import { runDevicesCommand } from '../src/bots/cli-devices.js';

const reply = (value: unknown) => ({
  bytes: new TextEncoder().encode(JSON.stringify(value)),
});

const LINK = 'deepseekbot://pair?p=c2VjcmV0LW9mZmVy';

describe('devices CLI', () => {
  it('lists devices with the Host identity and routes, without Connect state', async () => {
    const http = vi.fn(async () =>
      reply({
        host: { id: 'h', name: 'studio' },
        devices: [{ id: 'd', name: 'Pixel', pairedAt: '2026-10-21T00:00:00.000Z' }],
        routes: { tailscale: 'running', routes: [] },
        connect: { state: 'off' },
      }),
    );
    expect(await runDevicesCommand('devices', [], {}, async () => ({ http }))).toEqual({
      host: { id: 'h', name: 'studio' },
      devices: [{ id: 'd', name: 'Pixel', pairedAt: '2026-10-21T00:00:00.000Z' }],
      routes: { tailscale: 'running', routes: [] },
    });
    expect(http.mock.calls[0]).toEqual(['/api/botharness/devices']);
  });

  it('writes the pairing link only to the --out file and prints a receipt', async () => {
    const http = vi.fn(async () =>
      reply({
        link: LINK,
        qr: { size: 25, path: 'M0 0h1v1h-1z' },
        expiresAt: '2026-10-21T00:10:00.000Z',
        receipt: 'r3ceipt',
        routes: ['https://studio.tail1.ts.net'],
        reachable: true,
      }),
    );
    const write = vi.fn();
    const result = await runDevicesCommand(
      'device-offer',
      [],
      { out: '/private/offer.txt' },
      async () => ({ http }),
      write,
      () => false,
    );
    expect(result).toEqual({
      receipt: 'r3ceipt',
      expiresAt: '2026-10-21T00:10:00.000Z',
      routes: ['https://studio.tail1.ts.net'],
      reachable: true,
      link: { path: '/private/offer.txt' },
    });
    expect(JSON.stringify(result)).not.toContain(LINK);
    expect(write).toHaveBeenCalledWith('/private/offer.txt', LINK);
    expect(http.mock.calls[0]).toEqual(['/api/botharness/devices/offer', {}]);
  });

  it('reports the receipt, never the link, when the --out file already exists', async () => {
    const http = vi.fn(async () =>
      reply({
        link: LINK,
        expiresAt: '2026-10-21T00:10:00.000Z',
        receipt: 'r3ceipt',
      }),
    );
    const error = (await runDevicesCommand(
      'device-offer',
      [],
      { out: '/private/offer.txt' },
      async () => ({ http }),
      () => {
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      },
      () => false,
    ).catch((caught: unknown) => caught)) as { code: string; message: string };
    expect(error).toMatchObject({ code: 'output-exists' });
    expect(error.message).toContain('r3ceipt');
    expect(error.message).not.toContain(LINK);
  });

  it('reads offer status and revokes by id through the Devices routes', async () => {
    const http = vi.fn(async (path: string) =>
      reply(
        path.endsWith('/offer-status')
          ? { receipt: 'r3ceipt', state: 'redeemed', deviceId: 'd' }
          : {
              revoked: true,
              closedStreams: 1,
              device: { id: 'd', name: 'Pixel' },
            },
      ),
    );
    expect(
      await runDevicesCommand('device-offer-status', ['r3ceipt'], {}, async () => ({ http })),
    ).toEqual({ receipt: 'r3ceipt', state: 'redeemed', deviceId: 'd' });
    expect(
      await runDevicesCommand('device-revoke', ['d'], { confirm: true }, async () => ({ http })),
    ).toEqual({
      revoked: true,
      closedStreams: 1,
      device: { id: 'd', name: 'Pixel' },
    });
    expect(http.mock.calls).toEqual([
      ['/api/botharness/devices/offer-status', { receipt: 'r3ceipt' }],
      ['/api/botharness/devices/revoke', { deviceId: 'd' }],
    ]);
  });

  it('refuses an existing --out file before opening an offer', async () => {
    const connect = vi.fn();
    await expect(
      runDevicesCommand(
        'device-offer',
        [],
        { out: '/private/offer.txt' },
        connect,
        vi.fn(),
        () => true,
      ),
    ).rejects.toMatchObject({ code: 'output-exists' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('refuses incomplete input before connecting', async () => {
    const connect = vi.fn();
    for (const [command, rest, values, code] of [
      ['devices', ['x'], {}, 'usage'],
      ['devices', [], { out: '/private/offer.txt' }, 'usage'],
      ['device-offer', [], {}, 'out-required'],
      ['device-offer', [], { out: 'offer.txt' }, 'usage'],
      ['device-offer-status', [], {}, 'usage'],
      ['device-revoke', ['d'], {}, 'confirm-required'],
      ['device-revoke', [], { confirm: true }, 'usage'],
    ] as const)
      await expect(runDevicesCommand(command, [...rest], values, connect)).rejects.toMatchObject({
        code,
      });
    expect(connect).not.toHaveBeenCalled();
  });
});
