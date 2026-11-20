import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempRoot } from './helpers.js';
import { runRelationshipCommand } from '../src/bots/cli-relationships.js';
import { enrollRelationshipClient } from '../src/devices/relationship-enrollment.js';

const failure = vi.hoisted(() => ({ mode: 'none', writes: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return {
    ...fs,
    writeFileSync(...args: Parameters<typeof fs.writeFileSync>) {
      failure.writes++;
      if (failure.mode === 'write' && failure.writes === 2) {
        fs.writeFileSync(args[0], 'partial', args[2]);
        throw new Error('synthetic disk full');
      }
      return fs.writeFileSync(...args);
    },
    renameSync(...args: Parameters<typeof fs.renameSync>) {
      if (failure.mode === 'rename') throw new Error('synthetic replacement refusal');
      return fs.renameSync(...args);
    },
  };
});
vi.mock('../src/devices/relationship-enrollment.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/devices/relationship-enrollment.js')>()),
  enrollRelationshipClient: vi.fn(),
  commitRelationshipEnrollment: vi.fn(async () => 'committed'),
}));
beforeEach(() => {
  failure.mode = 'none';
  failure.writes = 0;
  vi.clearAllMocks();
});
afterEach(() => {
  failure.mode = 'none';
});

it.each(['write', 'rename'])(
  'preserves the recoverable private key when committed-file %s fails',
  async (mode) => {
    const root = createTempRoot('relationship-private-file-');
    const out = join(root, 'client.private.json');
    const id = 'ab'.repeat(16);
    const host = {
      hostId: 'peer',
      hostName: 'Peer',
      deviceId: 'device',
      credential: 'device.synthetic-private',
      routes: ['https://peer.example'],
      relationshipId: id,
      relationshipEnrollment: { publicKey: 'cd'.repeat(32) },
    };
    vi.mocked(enrollRelationshipClient).mockResolvedValueOnce({
      ok: true,
      enrollmentPublicKey: 'cd'.repeat(32),
      host,
    });
    const relationship = {
      id,
      peer: {
        id: host.hostId,
        name: host.hostName,
        publicKey: 'ef'.repeat(32),
        routes: host.routes,
      },
      state: 'active',
      direction: 'outgoing',
      expiresAt: Date.now() + 60_000,
      peerRevocationPending: false,
    };
    const http = vi.fn(async () => ({
      bytes: new TextEncoder().encode(JSON.stringify({ relationships: [relationship] })),
    }));
    failure.mode = mode;
    await expect(
      runRelationshipCommand(['enroll', id], { out }, async () => ({ http })),
    ).rejects.toMatchObject({ code: 'output-unavailable' });
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual(host);
    expect(readdirSync(root)).toEqual(['client.private.json']);
    expect(enrollRelationshipClient).toHaveBeenCalledOnce();
  },
);
