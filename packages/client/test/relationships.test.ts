import { afterEach, expect, it, vi } from 'vitest';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { pairingLink } from '../../core/src/devices/http.js';
import { createRemoteHosts } from '../src/client/remote-hosts.js';
import { pairReciprocalHost } from '../src/client/relationships.js';

afterEach(() => vi.unstubAllGlobals());

it('retires a late initiation after the user cancels without issuing a client grant', async () => {
  const source = createRemoteHosts({ carrier: new FakeHost().carrier });
  const enrollment = vi.spyOn(source, 'enrollRelationship');
  const abort = new AbortController();
  const requests: unknown[] = [];
  let complete: ((value: Response) => void) | undefined;
  let initiationSignal: AbortSignal | null | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: unknown, input: RequestInit) => {
      const body = JSON.parse(String(input.body));
      requests.push(body);
      if (body.action === 'initiate') {
        initiationSignal = input.signal;
        return new Promise<Response>((resolve) => {
          complete = resolve;
        });
      }
      return Promise.resolve(Response.json({}));
    }),
  );
  const result = pairReciprocalHost(
    source,
    pairingLink({
      v: 1,
      host: { id: 'peer', name: 'Peer' },
      routes: ['http://127.0.0.1:57001'],
      offer: 'test',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      encryption: {
        protocol: 'connect-noise-xk-v1',
        publicKey: '11'.repeat(32),
        noise: 'Noise_XK_25519_ChaChaPoly_SHA256',
        required: true,
        fingerprint: 'test',
      },
    }),
    'Desktop',
    'local',
    { signal: abort.signal, confirmFingerprint: async () => true },
  );
  try {
    await vi.waitFor(() => expect(complete).toBeDefined());
    abort.abort();
    expect(initiationSignal?.aborted).toBe(false);
    complete!(
      Response.json({
        local: { publicKey: '22'.repeat(32) },
        relationship: {
          id: 'r'.repeat(32),
          peer: { id: 'peer', name: 'Peer', publicKey: '11'.repeat(32), routes: [] },
          direction: 'outgoing',
          state: 'pending',
          expiresAt: Date.now() + 60_000,
          peerRevocationPending: false,
        },
      }),
    );
    expect(await result).toEqual({ ok: false, code: 'cancelled' });
    expect(enrollment).not.toHaveBeenCalled();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({
      action: 'cancel',
      id: 'r'.repeat(32),
      confirm: true,
    });
  } finally {
    source.close();
  }
});
