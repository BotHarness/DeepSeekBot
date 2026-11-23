import fc from 'fast-check';
import { expect, it, vi } from 'vitest';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { discoverHostAddress } from '@botharness/host-client/password-sign-in';

it('rejects paths, user information, query strings and fragments before requesting discovery', async () => {
  const carrier: HostCarrier = {
    request: vi.fn(),
    openSocket: vi.fn(),
  };
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 1 }), async (segment) => {
      const host = 'studio.example';
      for (const input of [
        `https://${host}/${segment}/..`,
        `https://${host}?${segment}`,
        `https://${host}#${segment}`,
        `https://${segment}@${host}`,
        `http://${host}:${(segment % 65535) + 1}`,
      ]) {
        expect(await discoverHostAddress({ carrier, input })).toEqual({
          ok: false,
          code: 'insecure-transport',
        });
      }
    }),
  );
  expect(carrier.request).not.toHaveBeenCalled();
});
