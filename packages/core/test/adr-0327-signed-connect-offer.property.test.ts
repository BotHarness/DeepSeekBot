import { createHmac } from 'node:crypto';

import fc from 'fast-check';
import { expect, it } from 'vitest';

import { RELAY_KEY, fakeServices, settle, setup } from './connect-account-fixtures.js';

it('refuses a correctly signed non-object offer payload', async () => {
  const { account } = setup(fakeServices({ pending: 0 }));
  const nonObject = fc
    .jsonValue()
    .filter((payload) => payload === null || typeof payload !== 'object' || Array.isArray(payload));
  try {
    await account.signIn();
    await settle(account);
    expect(account.status()).toMatchObject({ state: 'signed-in' });
    await fc.assert(
      fc.asyncProperty(nonObject, async (payload) => {
        const body = JSON.stringify(payload);
        const signature = createHmac('sha256', RELAY_KEY).update(body).digest('base64url');
        await expect(account.verifyOffer(body, signature)).resolves.toEqual({ ok: false });
      }),
      { examples: [[null]] },
    );
  } finally {
    await account.close();
  }
});
