import type { credentialKey } from '@deepseek-ai/dsh-credentials';

import { AccountError } from './connect-account-requests.js';
import {
  storedAccountSchema,
  type AccountRecord,
  type Credentials,
  type StoredAccount,
} from './connect-account-types.js';

export function createConnectAccountStorage(
  options: { credentials: () => Credentials | undefined },
  key: ReturnType<typeof credentialKey>,
) {
  const native = (): Credentials => {
    const provider = options.credentials();
    if (provider === undefined) throw new AccountError('credential-unavailable');
    return provider;
  };

  const readStored = async (): Promise<StoredAccount | undefined> => {
    try {
      const stored = await native().readRecord(key);
      return stored?.kind === 'grant'
        ? storedAccountSchema.safeParse(stored.payload).data
        : undefined;
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError('credential-unavailable');
    }
  };

  const read = async (): Promise<AccountRecord | undefined> => {
    const current = await readStored();
    return current?.kind === 'session' ? current : undefined;
  };

  const save = async (next: StoredAccount): Promise<void> => {
    try {
      await native().modifyRecord(key, async () => ({ kind: 'grant', payload: { ...next } }));
    } catch {
      throw new AccountError('credential-unavailable');
    }
  };

  return { native, readStored, read, save };
}
