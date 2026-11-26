import fc from 'fast-check';
import { expect, it } from 'vitest';

import { fakeServices, setup } from './connect-account-fixtures.js';

it('refuses device-authorization timing outside the supported range', async () => {
  const services = fakeServices();
  const { account } = setup(services);
  const fetch = services.fetcher.getMockImplementation()!;
  const invalidTiming = fc.record({
    field: fc.constantFrom('interval', 'expires_in'),
    value: fc.oneof(
      fc.constantFrom(null, 'Infinity', 'invalid', ''),
      fc.boolean(),
      fc.double({ max: 0, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 2_147_484 }),
    ),
  });
  try {
    await fc.assert(
      fc.asyncProperty(invalidTiming, async ({ field, value }) => {
        services.fetcher.mockImplementation(async (input, init) => {
          const response = await fetch(input, init);
          if (!String(input).endsWith('/authorize/device')) return response;
          return Response.json({ ...(await response.json()), [field]: value });
        });
        await expect(account.signIn()).resolves.toEqual({ ok: false, code: 'relay-unavailable' });
        expect(account.status()).toEqual({ state: 'signed-out' });
      }),
      { examples: [[{ field: 'expires_in', value: 'Infinity' }]] },
    );
  } finally {
    await account.close();
  }
});
