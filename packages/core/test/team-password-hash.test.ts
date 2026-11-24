import { argon2id } from '@noble/hashes/argon2.js';
import { expect, it } from 'vitest';

import { ARGON2_PARAMS, nativeArgon2, verifyPassword } from '../src/team/password.js';

const salt = '00112233445566778899aabbccddeeff';
const nobleHash = (password: string) =>
  Buffer.from(argon2id(password, Buffer.from(salt, 'hex'), ARGON2_PARAMS)).toString('hex');

it('verifies hashes stored by the JavaScript argon2id path', async () => {
  const stored = {
    algorithm: 'argon2id' as const,
    salt,
    hash: nobleHash('owner-password-1'),
    params: ARGON2_PARAMS,
  };
  expect(stored.hash).toBe('402c1a7bcf5e4a4861eadf71f4f9287385bc394521f2085fdd5d08e86c0ecd0f');
  expect(await verifyPassword('owner-password-1', stored)).toBe(true);
  expect(await verifyPassword('owner-password-2', stored)).toBe(false);
});

it.skipIf(nativeArgon2 === undefined)(
  'derives the same argon2id key natively as the JavaScript path',
  async () => {
    for (const password of ['member-password-1', 'pässwörd-ünïcode-密码', 'x'.repeat(1024)])
      expect((await nativeArgon2!(password, salt)).toString('hex')).toBe(nobleHash(password));
  },
);
