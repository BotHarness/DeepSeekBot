import {
  allowAutoRejectionOnce,
  clearAttentionItem,
  decideJoinRequest,
  snoozeAttentionItem,
} from '../../../../apps/mobile/src/host/attention-actions.js';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import {
  answerQuestion,
  decideApproval,
  loadApproval,
  loadQuestion,
  type RequestRef,
} from '../../../../apps/mobile/src/host/requests.js';
import type { BridgeActions } from './actions.js';
import {
  ignoreHumanAssignmentReport,
  loadTimelinePage,
  markReadPosition,
  type BridgeCall,
} from './bridge.js';
import type { HumanInboxCommands } from './human-inbox-view.js';
import type { ChannelMessage, HumanAttentionItem } from './store.js';

export type HostRequestActions = Pick<
  BridgeActions,
  | 'toolApprovalStatus'
  | 'toolApprovalState'
  | 'toolApprovalExecutionState'
  | 'decideToolApproval'
  | 'userQuestionStatus'
  | 'answerUserQuestion'
>;

export interface HostActivityActions extends HumanInboxCommands, HostRequestActions {
  message(item: HumanAttentionItem, signal?: AbortSignal): Promise<ChannelMessage>;
}

export function createHostActivityActions(options: {
  client(): HostClient;
  items(): readonly HumanAttentionItem[];
  refresh(): Promise<void>;
  open(channelId: string): Promise<void>;
}): HostActivityActions {
  const refs = new Map<string, RequestRef>();
  const ref = (channelId: string, messageId: string): RequestRef => {
    const key = JSON.stringify([channelId, messageId]);
    const item = options
      .items()
      .find((item) => item.channelId === channelId && item.messageId === messageId);
    if (item !== undefined) refs.set(key, { channelId, messageId, botSlug: item.botSlug });
    const value = refs.get(key);
    if (value === undefined) throw new Error('Activity request is unavailable');
    return value;
  };
  const call: BridgeCall = async (method, args, signal) => {
    signal?.throwIfAborted();
    const value = await options.client().call(method, args);
    signal?.throwIfAborted();
    return { ok: true, value };
  };
  const changed = async (run: () => Promise<unknown>): Promise<void> => {
    await run();
    await options.refresh();
  };
  const approval = (channelId: string, messageId: string) =>
    loadApproval(options.client(), ref(channelId, messageId));
  return {
    refreshHumanInbox: options.refresh,
    openChannelAtMessage: (channelId) => options.open(channelId),
    async decideGroupJoin(channelId, requestId, accept) {
      await changed(() => decideJoinRequest(options.client(), channelId, requestId, accept));
      return true;
    },
    dismissHumanInbox: (item) => changed(() => clearAttentionItem(options.client(), item)),
    snoozeHumanInbox: (item, until) =>
      changed(() =>
        snoozeAttentionItem(options.client(), item, until === null ? null : new Date(until)),
      ),
    allowAutoRejectionOnce: (item) =>
      changed(() => allowAutoRejectionOnce(options.client(), item.id)),
    markRead: (channelId, messageId) => changed(() => markReadPosition(call, channelId, messageId)),
    ignoreHumanReport: (sourceEventId) =>
      changed(() => ignoreHumanAssignmentReport(call, sourceEventId)),
    async message(item, signal) {
      if (item.channelId === undefined || item.messageId === undefined)
        throw new Error('Activity message is unavailable');
      ref(item.channelId, item.messageId);
      const { page } = await loadTimelinePage(
        call,
        item.channelId,
        { direction: 'around', around: item.messageId, olderLimit: 0, newerLimit: 0 },
        signal,
      );
      const message = page.entries.find((entry) => entry.id === item.messageId);
      if (message?.author.kind !== 'bot' || message.author.slug !== item.botSlug)
        throw new Error('Activity request author changed');
      return message;
    },
    async toolApprovalStatus(channelId, messageId) {
      return (await approval(channelId, messageId)).status === 'pending' ? 'pending' : 'expired';
    },
    async toolApprovalState(channelId, messageId) {
      const value = await approval(channelId, messageId);
      return {
        status: value.status === 'pending' ? 'pending' : 'expired',
        ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
      };
    },
    async toolApprovalExecutionState(channelId, messageId) {
      return (await approval(channelId, messageId)).execution;
    },
    async decideToolApproval(channelId, messageId, outcome) {
      if (outcome === 'allowed-always-exact' || outcome === 'allowed-always-all')
        throw new Error('This approval choice is unavailable');
      await changed(() => decideApproval(options.client(), ref(channelId, messageId), outcome));
    },
    async userQuestionStatus(channelId, messageId) {
      const value = await loadQuestion(options.client(), ref(channelId, messageId));
      return value.status === 'decided' ? 'answered' : value.status;
    },
    answerUserQuestion: (channelId, messageId, answers) =>
      changed(() => answerQuestion(options.client(), ref(channelId, messageId), { answers })),
  };
}
