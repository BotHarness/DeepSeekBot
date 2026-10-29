import type {
  MarketplaceAuthorAccount,
  MarketplaceClient,
  MarketplaceResult,
} from '../../../../packages/core/src/marketplace/client';
import type { ConnectResult } from '../host/connect-account';

export const ACCOUNT_NAME_MAX = 40;

export type AccountProfileState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'ready'; email: string | undefined; profile: MarketplaceAuthorAccount | null }
  | { status: 'error' };

export interface AccountProfileDeps {
  connect: {
    email(): Promise<string | undefined | null>;
    accessToken(): Promise<ConnectResult<string>>;
  };
  client: Pick<MarketplaceClient, 'author' | 'saveAuthor' | 'saveAuthorAvatar'>;
}

export interface AccountProfileEdit {
  name: string;
  avatar?: Uint8Array | null;
}

export class AccountProfileError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function validAccountName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && [...trimmed].length <= ACCOUNT_NAME_MAX && !/\p{Cc}/u.test(trimmed);
}

export function createAccountProfile(deps: AccountProfileDeps) {
  let state: AccountProfileState = { status: 'loading' };
  const listeners = new Set<() => void>();
  const publish = (next: AccountProfileState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const signed = async <T>(call: (token: string) => Promise<MarketplaceResult<T>>): Promise<T> => {
    const token = await deps.connect.accessToken();
    if (!token.ok) {
      if (token.code === 'sign-in-required') publish({ status: 'signed-out' });
      throw new AccountProfileError(token.code);
    }
    const result = await call(token.value);
    if (!result.ok) throw new AccountProfileError(result.code);
    return result.value;
  };

  const email = async () => (await deps.connect.email().catch(() => null)) ?? undefined;

  const refresh = async (): Promise<AccountProfileState> => {
    if ((await deps.connect.email().catch(() => null)) === null) {
      publish({ status: 'signed-out' });
      return state;
    }
    try {
      const profile = await signed((token) => deps.client.author(token));
      publish({ status: 'ready', email: await email(), profile });
    } catch {
      if (state.status !== 'signed-out' && state.status !== 'ready') publish({ status: 'error' });
    }
    return state;
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    refresh,

    async save(edit: AccountProfileEdit): Promise<MarketplaceAuthorAccount> {
      const name = edit.name.trim();
      if (!validAccountName(name)) throw new AccountProfileError('invalid-author-name');
      const current = state.status === 'ready' ? state.profile : null;
      let profile =
        current !== null && current.name === name
          ? current
          : await signed((token) =>
              deps.client.saveAuthor(token, { displayName: name, acceptTerms: false }),
            );
      if (edit.avatar !== undefined) {
        const avatar = edit.avatar;
        profile = await signed((token) => deps.client.saveAuthorAvatar(token, avatar));
      }
      publish({ status: 'ready', email: await email(), profile });
      return profile;
    },

    async saveAvatar(avatar: Uint8Array | null): Promise<MarketplaceAuthorAccount> {
      const current = state.status === 'ready' ? state : undefined;
      const name =
        current?.profile?.name ??
        [...(current?.email?.split('@')[0] ?? '')].slice(0, ACCOUNT_NAME_MAX).join('');
      return this.save({ name, avatar });
    },
  };
}

export function dataUrlBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export type AccountProfile = ReturnType<typeof createAccountProfile>;
