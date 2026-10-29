import { describe, expect, it } from 'vitest';

import { createMarketplaceClient } from '../../../packages/core/src/marketplace/client';
import { createMarket } from '../../../packages/market/test/market-harness';
import { createAccountProfile, dataUrlBytes } from '../src/account/account-profile';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function profileWith(email: string | null) {
  const market = createMarket();
  const client = createMarketplaceClient({
    baseUrl: 'https://market.test',
    fetchImpl: (input, init) =>
      market.request(String(input).replace('https://market.test', ''), init),
  });
  const profile = createAccountProfile({
    connect: {
      email: async () => email,
      accessToken: async () =>
        email === null
          ? { ok: false, code: 'sign-in-required' }
          : { ok: true, value: 'token-alice' },
    },
    client,
  });
  return { market, profile };
}

describe('Account Profile', () => {
  it('is signed out without a Connect sign-in', async () => {
    const { profile } = profileWith(null);
    expect(await profile.refresh()).toEqual({ status: 'signed-out' });
  });

  it('names a new profile after the email, then renames it and keeps the avatar', async () => {
    const { profile } = profileWith('vain@example.com');
    expect(await profile.refresh()).toEqual({
      status: 'ready',
      email: 'vain@example.com',
      profile: null,
    });
    const first = await profile.saveAvatar(PNG);
    expect(first).toMatchObject({ name: 'vain', termsAcceptedAt: null });
    expect(first.avatar).toMatch(/\/v1\/authors\/[2-9a-z]{6}\/avatar\/[a-f0-9]{64}\.png$/u);

    const renamed = await profile.save({ name: '  Vain  ' });
    expect(renamed).toMatchObject({ id: first.id, name: 'Vain', avatar: first.avatar });
    expect(profile.getSnapshot()).toMatchObject({ status: 'ready', profile: { name: 'Vain' } });

    expect((await profile.saveAvatar(null)).avatar).toBeNull();
    await expect(profile.save({ name: '   ' })).rejects.toMatchObject({
      code: 'invalid-author-name',
    });
  });

  it('reads the bytes of a picked image', () => {
    expect([...dataUrlBytes('data:image/jpeg;base64,/9j/')]).toEqual([0xff, 0xd8, 0xff]);
  });
});
