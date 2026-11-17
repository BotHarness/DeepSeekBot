import type {
  MarketplaceAuthoredBot,
  MarketplaceClient,
} from '../../../../packages/core/src/marketplace/client';
import type { MarketplaceLanguage } from '../../../../packages/core/src/marketplace/language';
import type { ConnectResult } from '@botharness/host-client/connect-account';

export type UploadedBotsState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error' }
  | { status: 'ready'; bots: readonly MarketplaceAuthoredBot[] };

export interface UploadedBotsDeps {
  connect: { accessToken(): Promise<ConnectResult<string>> };
  client: Pick<MarketplaceClient, 'authored' | 'deleteUpload'>;
}

export class UploadedBotsError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function createUploadedBots(deps: UploadedBotsDeps) {
  let state: UploadedBotsState = { status: 'loading' };
  let epoch = 0;
  let shownFor: string | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: UploadedBotsState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const token = async (current = epoch): Promise<string> => {
    const result = await deps.connect.accessToken();
    if (result.ok) return result.value;
    if (result.code === 'sign-in-required' && current === epoch) publish({ status: 'signed-out' });
    throw new UploadedBotsError(result.code);
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,

    async refresh(lang?: MarketplaceLanguage): Promise<UploadedBotsState> {
      const current = ++epoch;
      if (state.status !== 'ready') publish({ status: 'loading' });
      try {
        const access = await token(current);
        if (current === epoch && state.status === 'ready' && access !== shownFor)
          publish({ status: 'loading' });
        const result = await deps.client.authored(access, lang);
        if (current !== epoch) return state;
        shownFor = access;
        publish(result.ok ? { status: 'ready', bots: result.value } : { status: 'error' });
      } catch {
        if (current === epoch && state.status !== 'signed-out') publish({ status: 'error' });
      }
      return state;
    },

    async remove(id: string): Promise<void> {
      const result = await deps.client.deleteUpload(await token(), id);
      if (!result.ok) throw new UploadedBotsError(result.code);
      epoch++;
      if (state.status === 'ready')
        publish({ status: 'ready', bots: state.bots.filter((item) => item.bot.id !== id) });
    },
  };
}

export type UploadedBots = ReturnType<typeof createUploadedBots>;
