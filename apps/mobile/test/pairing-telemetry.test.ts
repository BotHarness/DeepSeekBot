import { expect, it, vi } from 'vitest';
import { pairHost } from '../src/host/pairing';
import { FakeHost } from './fake-host';

it('counts a submitted invalid link once and requires saved-Host persistence for success', async () => {
  const finish = vi.fn();
  const pairing = vi.fn(() => ({ finish }));
  const save = vi.fn(async (): Promise<void> => {
    throw new Error('SENTINEL disk error');
  });
  const host = new FakeHost();
  const base = {
    deviceName: 'SENTINEL phone',
    carrier: host.carrier,
    save,
    telemetry: { pairing },
    method: 'paste' as const,
  };
  expect(await pairHost({ ...base, text: 'SENTINEL invalid link' })).toEqual({
    ok: false,
    code: 'link-invalid',
  });
  expect(pairing).toHaveBeenCalledWith('paste');
  expect(finish).toHaveBeenLastCalledWith('refused', 'link-invalid');
  expect(save).not.toHaveBeenCalled();
  const text =
    'deepseekbot://pair?p=' +
    Buffer.from(
      JSON.stringify({
        v: 1,
        host: { id: host.hostId, name: 'SENTINEL name' },
        offer: host.offer,
        routes: ['https://studio.tailnet-example.ts.net'],
        expiresAt: '2099-01-01T00:00:00Z',
      }),
    ).toString('base64url');
  expect(await pairHost({ ...base, text })).toEqual({ ok: false, code: 'storage-failure' });
  expect(finish).toHaveBeenLastCalledWith('failed', 'storage-failure');
  host.offer = 'offer-1';
  save.mockResolvedValueOnce(undefined);
  expect(await pairHost({ ...base, method: 'qr', text })).toEqual({ ok: true });
  expect(finish).toHaveBeenLastCalledWith('success');
});
