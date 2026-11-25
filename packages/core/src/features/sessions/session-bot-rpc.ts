import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrapAsync } from '../../bridge/rpc-result.js';
import type { SessionBotCreated } from './session-bot-methods.js';

export const sessionBotRpc = {
  createFromSessions(
    displayName: string,
    sessionIds: string[],
    description?: string,
    roles?: string[],
    persona?: string,
    operationKey?: string,
    language?: 'zh' | 'en',
  ): Promise<SessionBotCreated> {
    return unwrapAsync(
      this.methods.createFromSessions({
        displayName,
        sessionIds,
        description,
        roles,
        persona,
        operationKey,
        language,
      }),
    );
  },
} satisfies ThisType<BridgeRpcReceiver>;
