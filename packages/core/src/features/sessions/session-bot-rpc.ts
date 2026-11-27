import { unwrapAsync } from '../../kernel/rpc-result.js';
import type { SessionBotCreated, createSessionBotMethods } from './session-bot-methods.js';
import type { ExternalSessionSummary } from './external-sessions.js';

export const sessionBotRpc = {
  externalSessions(): Promise<{ sessions: ExternalSessionSummary[] }> {
    return unwrapAsync(this.methods.externalSessions());
  },
  createFromSessions(
    displayName: string,
    sessionIds: string[],
    description?: string,
    roles?: string[],
    persona?: string,
    operationKey?: string,
    language?: 'zh' | 'en',
    workspacePaths?: string[],
    addWorkspaces?: boolean,
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
        workspacePaths,
        addWorkspaces,
      }),
    );
  },
} satisfies ThisType<{ readonly methods: ReturnType<typeof createSessionBotMethods> }>;
