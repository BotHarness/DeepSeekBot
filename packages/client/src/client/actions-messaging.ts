import {
  reviewPairing,
  changeExternalSenderAccess,
  setApprovalRoute,
  testApprovalRoute,
  retryApprovalNotification,
  retryQuestionNotification,
  setFailureAlerts,
  testFailureAlerts,
  retryFailureAlerts,
  loadChannelBridges,
  manageChannelBridge,
  loadChannelIngests,
  manageChannelIngest,
  loadMessagingSnapshot,
  loadMessagingReachable,
  postMessagingConversation,
  readMessagingPostRequest,
  setMessagingPostLimit,
  manageMessagingIdentity,
  manageMessagingConversation,
  loadMessagingTargets,
  authorizeMessaging,
  revokeMessaging,
  sendMessaging,
  setMessagingReceive,
  setMessagingGroupPolicy,
  setMessagingThreadPolicy,
  setMessagingChannelTarget,
  readMessagingSource,
  type BridgeCall,
} from './bridge.js';
import type { BridgeActions } from './actions.js';

export interface MessagingActions {
  messagingChannelTarget(slug: string, grantId: string, channelId: string | null): Promise<void>;
  messagingReceive(slug: string, grantId: string, enabled: boolean): Promise<void>;
  approvalRoute(slug: string, pairingId: string | null, expectedRevision: number): Promise<void>;
  approvalTest(slug: string): Promise<void>;
  approvalRetry(slug: string, id: string): Promise<void>;
  questionRetry(slug: string, id: string): Promise<void>;
  failureAlertsSet(slug: string, enabled: boolean, expectedRevision: number): Promise<void>;
  failureAlertsTest(slug: string): Promise<void>;
  failureAlertsRetry(slug: string, id: string): Promise<void>;
  messagingPostLimit?(
    slug: string,
    bindingId: string,
    expectedRevision: number,
    limit: number | null,
  ): Promise<void>;
  messagingRevoke(slug: string, grantId: string): Promise<void>;
}

export function createMessagingActions(call: BridgeCall) {
  return {
    messagingChannelTarget: (slug, grantId, channelId) =>
      setMessagingChannelTarget(call, slug, grantId, channelId),
    messagingThreadPolicy: (slug, sourceEventId, policy) =>
      setMessagingThreadPolicy(call, slug, sourceEventId, policy),
    messagingGroupPolicy: (slug, grantId, policy) =>
      setMessagingGroupPolicy(call, slug, grantId, policy),
    messagingReceive: (slug, grantId, enabled) => setMessagingReceive(call, slug, grantId, enabled),
    messagingSource: (slug, sourceEventId) => readMessagingSource(call, slug, sourceEventId),
    channelBridges: (channelId, mode) => loadChannelBridges(call, channelId, mode),
    channelBridge: (channelId, input) => manageChannelBridge(call, channelId, input),
    channelIngests: (channelId) => loadChannelIngests(call, channelId),
    channelIngest: (channelId, input) => manageChannelIngest(call, channelId, input),
    approvalRoute: (slug, pairingId, expectedRevision) =>
      setApprovalRoute(call, slug, pairingId, expectedRevision),
    approvalTest: (slug) => testApprovalRoute(call, slug),
    approvalRetry: (slug, id) => retryApprovalNotification(call, slug, id),
    questionRetry: (slug, id) => retryQuestionNotification(call, slug, id),
    failureAlertsSet: (slug, enabled, expectedRevision) =>
      setFailureAlerts(call, slug, enabled, expectedRevision),
    failureAlertsTest: (slug) => testFailureAlerts(call, slug),
    failureAlertsRetry: (slug, id) => retryFailureAlerts(call, slug, id),
    pairingReview: (slug, input) => reviewPairing(call, slug, input),
    senderAccess: (slug, input) => changeExternalSenderAccess(call, slug, input),
    messagingIdentity: (slug, input) => manageMessagingIdentity(call, slug, input),
    messagingConversation: (slug, input) => manageMessagingConversation(call, slug, input),
    messagingSnapshot: (slug, mode) => loadMessagingSnapshot(call, slug, mode),
    messagingReachable: (slug, bindingId, cursor) =>
      loadMessagingReachable(call, slug, bindingId, cursor),
    messagingPostConversation: (slug, bindingId, conversationId, requestId, text) =>
      postMessagingConversation(call, slug, bindingId, conversationId, requestId, text),
    messagingPostRequest: (slug, bindingId, conversationId, requestId, text) =>
      readMessagingPostRequest(call, slug, bindingId, conversationId, requestId, text),
    messagingPostLimit: (slug, bindingId, expectedRevision, limit) =>
      setMessagingPostLimit(call, slug, bindingId, expectedRevision, limit),
    messagingTargets: (providerId, accountRef) =>
      loadMessagingTargets(call, providerId, accountRef),
    messagingAuthorize: (input) => authorizeMessaging(call, input),
    messagingRevoke: (slug, grantId) => revokeMessaging(call, slug, grantId),
    messagingSend: (slug, grantId, requestId, text) =>
      sendMessaging(call, slug, grantId, requestId, text),
  } satisfies MessagingActions &
    Pick<
      BridgeActions,
      | 'channelBridges'
      | 'channelBridge'
      | 'channelIngests'
      | 'channelIngest'
      | 'messagingThreadPolicy'
      | 'messagingGroupPolicy'
      | 'messagingSource'
      | 'pairingReview'
      | 'senderAccess'
      | 'messagingIdentity'
      | 'messagingConversation'
      | 'messagingSnapshot'
      | 'messagingReachable'
      | 'messagingPostConversation'
      | 'messagingPostRequest'
      | 'messagingTargets'
      | 'messagingAuthorize'
      | 'messagingSend'
    >;
}
