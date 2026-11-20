import * as botControl from '@botharness/host-client/bot-control';
import {
  type BotCompactResult,
  BridgeCallError,
  loadChannelAssignments,
  loadSessionSubagents,
  loadAssignmentWork,
  loadSessionProgress,
  loadSessionTranscript,
  loadSessionLive,
  loadSessionToolDetail,
  sendSessionRequest,
  sendOrchestratorMessage,
  type SessionProgress,
  type SessionTranscript,
  type SessionLiveSnapshot,
  type SessionToolDetail,
  type SessionSubagent,
  type AssignmentWork,
  errorMessage,
  loadSessions,
  setSessionArchived,
  stopSession,
  stopBot,
  bridgeHost,
  type BridgeCall,
} from './bridge.js';
import type { ClientStore, OwnedSessionSummary, ConversationSelection } from './store.js';
import type { ActionFolderAccess, BridgeActions } from './actions.js';

export interface SessionActions {
  stopBot(channelId: string, botSlug: string): Promise<'stopped' | 'not-working'>;
  cancelAutoContinue(channelId: string, botSlug: string, requestMessageId: string): Promise<void>;
  compactBot(botSlug: string): Promise<BotCompactResult>;
  newBotSession(botSlug: string): Promise<void>;
  openSession(sessionId: string): void;
  refreshSessions(slug: string): Promise<void>;
  readSessions(slug: string): Promise<OwnedSessionSummary[]>;
  setSessionArchived(slug: string, sessionId: string, archived: boolean): Promise<void>;
  stopSession(
    slug: string,
    session: string | { activityId: string },
    channelId?: string,
  ): Promise<void>;
  sessionSubagents?(
    slug: string,
    sessionId: string,
  ): Promise<{ subagents: SessionSubagent[]; omitted: number }>;
  assignmentWork?(slug: string, sessionId: string): Promise<AssignmentWork>;
  sessionProgress?(
    slug: string,
    sessionIds: readonly string[],
  ): Promise<Record<string, SessionProgress>>;
  sessionTranscript?(slug: string, sessionId: string): Promise<SessionTranscript>;
  sessionLive?(
    slug: string,
    sessionId: string,
    after: number | undefined,
    signal?: AbortSignal,
  ): Promise<SessionLiveSnapshot>;
  sessionToolDetail?(slug: string, sessionId: string, callId: string): Promise<SessionToolDetail>;
  sendSessionRequest?(slug: string, sessionId: string, text: string, steer: boolean): Promise<void>;
  sendOrchestratorMessage?(slug: string, sessionId: string, text: string): Promise<void>;
}

export function createSessionActions(
  call: BridgeCall,
  clientStore: ClientStore,
  folderAccess: ActionFolderAccess | undefined,
  getActions: () => Pick<BridgeActions, 'refreshChannelMessages'>,
) {
  const currentSelection = (): ConversationSelection | undefined =>
    clientStore.getSnapshot().selection;
  const selectedBotSlug = (selection: ConversationSelection | undefined): string | undefined => {
    if (selection?.kind === 'bot') return selection.slug;
    if (selection?.kind !== 'channel') return undefined;
    const channel = clientStore.getSnapshot().conversation.channel;
    return channel?.id === selection.channelId && channel.type === 'dm'
      ? channel.botSlug
      : undefined;
  };
  let sessionsRequestSeq = 0;
  const loadSessionsFor = async (slug: string, selection: ConversationSelection): Promise<void> => {
    const requestSeq = ++sessionsRequestSeq;
    const prior = clientStore.getSnapshot().sessions;
    if (prior.status === 'idle' || prior.items.length === 0)
      clientStore.setSessions({ status: 'loading', error: undefined });
    try {
      const items = await loadSessions(call, slug);
      if (currentSelection() !== selection || requestSeq !== sessionsRequestSeq) return;
      clientStore.setSessions({ status: 'ready', items, error: undefined });
    } catch (error) {
      if (currentSelection() !== selection || requestSeq !== sessionsRequestSeq) return;
      clientStore.setSessions({ status: 'error', error: errorMessage(error) });
    }
  };

  const actions = {
    async newBotSession(botSlug) {
      await botControl.newBotSession(bridgeHost(call), botSlug);
    },
    async compactBot(botSlug) {
      try {
        return await botControl.compactBot(bridgeHost(call), botSlug);
      } catch (error) {
        if (error instanceof BridgeCallError && error.code === 'bot-busy')
          return { outcome: 'busy', tokensBefore: null, tokensAfter: null };
        throw error;
      }
    },
    async stopBot(channelId, botSlug) {
      const stopped = await stopBot(call, botSlug, channelId);
      if (stopped.stopped.length === 0) return 'not-working';
      await getActions()
        .refreshChannelMessages(channelId)
        .catch(() => undefined);
      return 'stopped';
    },
    async cancelAutoContinue(channelId, botSlug, requestMessageId) {
      await botControl.stopBot(bridgeHost(call), {
        channelId,
        botSlug,
        autoContinueFor: requestMessageId,
      });
      await getActions()
        .refreshChannelMessages(channelId)
        .catch(() => undefined);
    },
    openSession(sessionId) {
      if (folderAccess?.openSession === undefined)
        throw new Error('DSH Session navigation is unavailable');
      folderAccess.openSession(sessionId);
    },
    readSessions: (slug) => loadSessions(call, slug),
    async refreshSessions(slug) {
      const selection = currentSelection();
      if (selection === undefined || selectedBotSlug(selection) !== slug) return;
      await loadSessionsFor(slug, selection);
    },
    async setSessionArchived(slug, sessionId, archived) {
      await setSessionArchived(call, slug, sessionId, archived);
      const selection = currentSelection();
      if (selection === undefined || selectedBotSlug(selection) !== slug) return;
      await loadSessionsFor(slug, selection);
    },
    async stopSession(slug, session, channelId) {
      const stopped = await stopSession(call, slug, session, channelId);
      if (stopped.messageId !== undefined && channelId !== undefined)
        await getActions()
          .refreshChannelMessages(channelId)
          .catch(() => undefined);
      const selection = currentSelection();
      if (selection === undefined || selectedBotSlug(selection) !== slug) return;
      await loadSessionsFor(slug, selection);
    },
    channelAssignments(channelId) {
      return loadChannelAssignments(call, channelId);
    },
    sessionSubagents(slug, sessionId) {
      return loadSessionSubagents(call, slug, sessionId);
    },
    assignmentWork(slug, sessionId) {
      return loadAssignmentWork(call, slug, sessionId);
    },
    sessionProgress(slug, sessionIds) {
      return loadSessionProgress(call, slug, sessionIds);
    },
    sessionTranscript(slug, sessionId) {
      return loadSessionTranscript(call, slug, sessionId);
    },
    sessionLive(slug, sessionId, after, signal) {
      return loadSessionLive(call, slug, sessionId, after, signal);
    },
    sessionToolDetail(slug, sessionId, callId) {
      return loadSessionToolDetail(call, slug, sessionId, callId);
    },
    sendSessionRequest(slug, sessionId, text, steer) {
      return sendSessionRequest(call, slug, sessionId, text, steer);
    },
    sendOrchestratorMessage(slug, sessionId, text) {
      return sendOrchestratorMessage(call, slug, sessionId, text);
    },
  } satisfies SessionActions & Pick<BridgeActions, 'channelAssignments'>;
  return { actions, currentSelection, selectedBotSlug, loadSessionsFor };
}
