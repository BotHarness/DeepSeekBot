import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createTempRoot } from './helpers.js';

const enrollment = vi.hoisted(() => ({ run: vi.fn() }));
const revocation = vi.hoisted(() => ({ run: vi.fn(async () => 'revoked') }));
vi.mock('../src/devices/relationship-enrollment.js', async (original) => ({
  ...(await original<typeof import('../src/devices/relationship-enrollment.js')>()),
  enrollRelationshipClient: enrollment.run,
}));
vi.mock('../../../apps/mobile/src/host/pairing.js', async (original) => ({
  ...(await original<typeof import('../../../apps/mobile/src/host/pairing.js')>()),
  revokePairing: revocation.run,
}));
import { runRelationshipCommand } from '../src/bots/cli-relationships.js';

it('shares the command deadline with remote redemption and never writes a late credential', async () => {
  const id = 'a'.repeat(32);
  const abort = new AbortController();
  const out = join(createTempRoot('relationship-cli-deadline-'), 'grant.private.json');
  const relationship = {
    id,
    peer: { id: 'b', name: 'B', publicKey: 'ab'.repeat(32), routes: [] },
    direction: 'outgoing',
    state: 'active',
    expiresAt: Date.now() + 600_000,
    peerRevocationPending: false,
  };
  const http = async () => ({
    bytes: new TextEncoder().encode(JSON.stringify({ relationships: [relationship] })),
  });
  enrollment.run.mockImplementationOnce(async ({ signal }: { signal?: AbortSignal }) => {
    expect(signal).toBe(abort.signal);
    abort.abort();
    return {
      ok: true,
      enrollmentPublicKey: 'ab'.repeat(32),
      host: {
        hostId: 'b',
        hostName: 'B',
        deviceId: 'issued',
        credential: 'synthetic.private',
        routes: [],
      },
    };
  });
  await expect(
    runRelationshipCommand(['enroll', id], { out }, async () => ({ http }), abort.signal),
  ).rejects.toMatchObject({ code: 'timeout' });
  expect(existsSync(out)).toBe(false);
  expect(revocation.run).toHaveBeenCalledTimes(1);
});

it('does not contact the Host after the shared deadline has expired', async () => {
  const abort = new AbortController();
  abort.abort();
  const connect = vi.fn();
  await expect(runRelationshipCommand(['list'], {}, connect, abort.signal)).rejects.toMatchObject({
    code: 'timeout',
  });
  expect(connect).not.toHaveBeenCalled();
});

it('checks wall time before writing even when the timeout callback has not run yet', async () => {
  const id = 'a'.repeat(32);
  const out = join(createTempRoot('relationship-cli-wall-deadline-'), 'grant.private.json');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const relationship = {
    id,
    peer: { id: 'b', name: 'B', publicKey: 'ab'.repeat(32), routes: [] },
    direction: 'outgoing',
    state: 'active',
    expiresAt: 600_000,
    peerRevocationPending: false,
  };
  const http = async () => ({
    bytes: new TextEncoder().encode(JSON.stringify({ relationships: [relationship] })),
  });
  enrollment.run.mockImplementationOnce(async () => {
    clock.mockReturnValue(1100);
    return {
      ok: true,
      enrollmentPublicKey: 'ab'.repeat(32),
      host: {
        hostId: 'b',
        hostName: 'B',
        deviceId: 'issued',
        credential: 'synthetic.private',
        routes: [],
      },
    };
  });
  try {
    await expect(
      runRelationshipCommand(
        ['enroll', id],
        { out },
        async () => ({ http }),
        new AbortController().signal,
        1050,
      ),
    ).rejects.toMatchObject({ code: 'timeout' });
    expect(existsSync(out)).toBe(false);
  } finally {
    clock.mockRestore();
  }
});
