import { expect, it } from 'vitest';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { createNoiseIdentity } from '../src/devices/noise-identity.js';

it('keeps one Host identity across concurrent reads and restart; never replaces a corrupt key', async () => {
  type Entry = Awaited<ReturnType<CredentialProvider['modifyRecord']>>;
  let entry: Entry;
  const provider: Pick<CredentialProvider, 'modifyRecord'> = {
    async modifyRecord(_key, mutate) {
      entry = await mutate(entry);
      return entry;
    },
  };
  const first = createNoiseIdentity(() => provider);
  const [a, b] = await Promise.all([first.publicIdentity(), first.publicIdentity()]);
  expect(a).toEqual(b);
  const copy = await first.key();
  copy.fill(0);
  expect(await first.publicIdentity()).toEqual(a);
  first.close();
  await expect(first.key()).rejects.toThrow('channel-closed');
  const restarted = createNoiseIdentity(() => provider);
  expect(await restarted.publicIdentity()).toEqual(a);
  restarted.close();
  entry = { kind: 'grant', payload: { version: 1, privateKey: 'corrupt' } };
  const corrupt = createNoiseIdentity(() => provider);
  await expect(corrupt.publicIdentity()).rejects.toThrow('host-key-invalid');
  expect(entry).toEqual({ kind: 'grant', payload: { version: 1, privateKey: 'corrupt' } });
  corrupt.close();
});
