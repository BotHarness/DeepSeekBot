import type { ExternalSource } from '../../messaging/inbound.js';
import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrapAsync } from '../../bridge/rpc-result.js';
import type { PairingRequest, PairingReviewInput } from '../../messaging/pairing.js';
import type { SenderAccessInput } from '../../messaging/sender-access.js';
import type {
  MessagingDefaults,
  MessagingDefaultsInput,
  MessagingDefaultsPlatform,
} from '../../messaging/defaults.js';
import type { MessagingIdentity, MessagingIdentityInput } from '../../messaging/identity.js';
import type { MessagingConversationInput } from '../../messaging/conversations.js';
import type { ChannelBridgeInput, ChannelBridgeSnapshot } from '../../messaging/channel-bridge.js';
import type {
  ConversationIngestInput,
  ConversationIngestSnapshot,
} from '../../messaging/conversation-ingest.js';
import type { ThreadReceptionInput } from '../../messaging/thread-policy.js';
import type { GroupReceptionInput } from '../../messaging/group-policy.js';
import type {
  MessagingSnapshot,
  MessagingGrant,
  OutboxIntent,
  MessagingReadMode,
} from '../../messaging/outbound.js';
import type { MessagingTarget } from '../../messaging/provider.js';
import type { MemoryFileTarget } from '../../memory/file-actions.js';
import type { MessagingAppsView } from '../../bridge/methods.js';
import type { MessagingBridgeMethods } from './methods.js';

export function messagingChannelTarget(
  methods: MessagingBridgeMethods,
  slug: string,
  grantId: string,
  channelId: string | null,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.messagingChannelTarget({ slug, grantId, channelId }));
}

export function messagingThreadPolicy(
  methods: MessagingBridgeMethods,
  slug: string,
  sourceEventId: string,
  policy: ThreadReceptionInput,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.messagingThreadPolicy({ slug, sourceEventId, policy }));
}

export function messagingGroupPolicy(
  methods: MessagingBridgeMethods,
  slug: string,
  grantId: string,
  policy: GroupReceptionInput,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.messagingGroupPolicy({ slug, grantId, policy }));
}

export function messagingDefaults(
  methods: MessagingBridgeMethods,
  platform?: MessagingDefaultsPlatform,
): Promise<MessagingDefaults> {
  return unwrapAsync(methods.messagingDefaults(platform === undefined ? {} : { platform }));
}

export function messagingDefaultsSet(
  methods: MessagingBridgeMethods,
  input: MessagingDefaultsInput,
): Promise<MessagingDefaults> {
  return unwrapAsync(methods.messagingDefaultsSet(input));
}

export function channelBridges(
  methods: MessagingBridgeMethods,
  channelId: string,
  mode?: MessagingReadMode,
): Promise<ChannelBridgeSnapshot> {
  return unwrapAsync(methods.channelBridges({ channelId, ...(mode ? { mode } : {}) }));
}

export function channelIngests(
  methods: MessagingBridgeMethods,
  channelId: string,
): Promise<ConversationIngestSnapshot> {
  return unwrapAsync(methods.channelIngests({ channelId }));
}

export function channelIngest(
  methods: MessagingBridgeMethods,
  channelId: string,
  input: ConversationIngestInput,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.channelIngest({ channelId, input }));
}

export function channelBridge(
  methods: MessagingBridgeMethods,
  channelId: string,
  input: ChannelBridgeInput,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.channelBridge({ channelId, input }));
}

export function messagingReceive(
  methods: MessagingBridgeMethods,
  slug: string,
  grantId: string,
  enabled: boolean,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.messagingReceive({ slug, grantId, enabled }));
}

export function messagingSource(
  methods: MessagingBridgeMethods,
  slug: string,
  sourceEventId: string,
) {
  return unwrapAsync(methods.messagingSource({ slug, sourceEventId }));
}

export function failureAlertsSet(
  methods: MessagingBridgeMethods,
  slug: string,
  enabled: boolean,
  expectedRevision: number,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.failureAlertsSet({ slug, enabled, expectedRevision }));
}

export function failureAlertsTest(
  methods: MessagingBridgeMethods,
  slug: string,
): Promise<{
  delivery: import('../../messaging/failure-alerts.js').FailureAlertDelivery;
}> {
  return unwrapAsync(methods.failureAlertsTest({ slug }));
}

export function failureAlertsRetry(
  methods: MessagingBridgeMethods,
  slug: string,
  id: string,
): Promise<{
  delivery: import('../../messaging/failure-alerts.js').FailureAlertDelivery;
}> {
  return unwrapAsync(methods.failureAlertsRetry({ slug, id }));
}

export function pairingReview(
  methods: MessagingBridgeMethods,
  slug: string,
  input: PairingReviewInput,
): Promise<{ pairing: PairingRequest }> {
  return unwrapAsync(methods.pairingReview({ slug, input }));
}

export function senderAccess(
  methods: MessagingBridgeMethods,
  slug: string,
  input: SenderAccessInput,
): Promise<void> {
  return unwrapAsync(methods.senderAccess({ slug, input }));
}

export function messagingIdentity(
  methods: MessagingBridgeMethods,
  slug: string,
  input: MessagingIdentityInput,
): Promise<{ identity: MessagingIdentity }> {
  return unwrapAsync(methods.messagingIdentity({ slug, input }));
}

export function messagingApps(methods: MessagingBridgeMethods): Promise<MessagingAppsView> {
  return unwrapAsync(methods.messagingApps());
}

export function messagingSnapshot(
  methods: MessagingBridgeMethods,
  slug: string,
  mode?: MessagingReadMode,
): Promise<MessagingSnapshot> {
  return unwrapAsync(methods.messagingSnapshot({ slug, ...(mode ? { mode } : {}) }));
}

export function messagingReachable(
  methods: MessagingBridgeMethods,
  slug: string,
  bindingId: string,
  cursor?: string,
): Promise<import('../../messaging/provider.js').MessagingReachablePage> {
  return unwrapAsync(
    methods.messagingReachable({
      slug,
      bindingId,
      ...(cursor ? { cursor } : {}),
    }),
  );
}

export function messagingPostRequest(
  methods: MessagingBridgeMethods,
  slug: string,
  bindingId: string,
  conversationId: string,
  requestId: string,
  text: string,
): Promise<{ intent: OutboxIntent | null }> {
  return unwrapAsync(
    methods.messagingPostRequest({
      slug,
      bindingId,
      conversationId,
      requestId,
      text,
    }),
  );
}

export function messagingPostConversation(
  methods: MessagingBridgeMethods,
  slug: string,
  bindingId: string,
  conversationId: string,
  requestId: string,
  text: string,
): Promise<{ intent: OutboxIntent }> {
  return unwrapAsync(
    methods.messagingPostConversation({
      slug,
      bindingId,
      conversationId,
      requestId,
      text,
    }),
  );
}

export function messagingPostLimit(
  methods: MessagingBridgeMethods,
  slug: string,
  bindingId: string,
  expectedRevision: number,
  limit: number | null,
): Promise<{ identity: MessagingIdentity }> {
  return unwrapAsync(
    methods.messagingPostLimit({
      slug,
      bindingId,
      expectedRevision,
      limit,
    }),
  );
}

export function messagingTargets(
  methods: MessagingBridgeMethods,
  providerId: string,
  accountRef: string,
): Promise<{ targets: MessagingTarget[] }> {
  return unwrapAsync(methods.messagingTargets({ providerId, accountRef }));
}

export function messagingAuthorize(
  methods: MessagingBridgeMethods,
  botSlug: string,
  providerId: string,
  accountRef: string,
  targetRef: string,
  fingerprint: string,
  targetDigest: string,
): Promise<{ grant: MessagingGrant }> {
  return unwrapAsync(
    methods.messagingAuthorize({
      botSlug,
      providerId,
      accountRef,
      targetRef,
      fingerprint,
      targetDigest,
    }),
  );
}

export function messagingRevoke(
  methods: MessagingBridgeMethods,
  slug: string,
  grantId: string,
): Promise<{ revoked: true }> {
  return unwrapAsync(methods.messagingRevoke({ slug, grantId }));
}

export function messagingConversation(
  methods: MessagingBridgeMethods,
  slug: string,
  input: MessagingConversationInput,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.messagingConversation({ slug, input }));
}

export function messagingSend(
  methods: MessagingBridgeMethods,
  slug: string,
  grantId: string,
  requestId: string,
  text: string,
): Promise<{ intent: OutboxIntent }> {
  return unwrapAsync(methods.messagingSend({ slug, grantId, requestId, text }));
}

export function channelMediaTarget(
  methods: MessagingBridgeMethods,
  channelId: string,
  sourceEventId: string,
  attachmentId: string,
): Promise<{ target: MemoryFileTarget }> {
  return unwrapAsync(
    methods.channelMediaTarget({
      channelId,
      sourceEventId,
      attachmentId,
    }),
  );
}

export const messagingRpcMethods = {
  channelMediaTarget(
    channelId: string,
    sourceEventId: string,
    attachmentId: string,
  ): Promise<{ target: MemoryFileTarget }> {
    return channelMediaTarget(this.methods, channelId, sourceEventId, attachmentId);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const channelMessagingRpc = {
  messagingChannelTarget(
    slug: string,
    grantId: string,
    channelId: string | null,
  ): Promise<{ updated: true }> {
    return messagingChannelTarget(this.methods, slug, grantId, channelId);
  },

  messagingThreadPolicy(
    slug: string,
    sourceEventId: string,
    policy: ThreadReceptionInput,
  ): Promise<{ updated: true }> {
    return messagingThreadPolicy(this.methods, slug, sourceEventId, policy);
  },

  messagingGroupPolicy(
    slug: string,
    grantId: string,
    policy: GroupReceptionInput,
  ): Promise<{ updated: true }> {
    return messagingGroupPolicy(this.methods, slug, grantId, policy);
  },

  messagingDefaults(platform?: MessagingDefaultsPlatform): Promise<MessagingDefaults> {
    return messagingDefaults(this.methods, platform);
  },

  messagingDefaultsSet(input: MessagingDefaultsInput): Promise<MessagingDefaults> {
    return messagingDefaultsSet(this.methods, input);
  },

  channelBridges(channelId: string, mode?: MessagingReadMode): Promise<ChannelBridgeSnapshot> {
    return channelBridges(this.methods, channelId, mode);
  },

  channelIngests(channelId: string): Promise<ConversationIngestSnapshot> {
    return channelIngests(this.methods, channelId);
  },

  channelIngest(channelId: string, input: ConversationIngestInput): Promise<{ updated: true }> {
    return channelIngest(this.methods, channelId, input);
  },

  channelBridge(channelId: string, input: ChannelBridgeInput): Promise<{ updated: true }> {
    return channelBridge(this.methods, channelId, input);
  },

  messagingReceive(slug: string, grantId: string, enabled: boolean): Promise<{ updated: true }> {
    return messagingReceive(this.methods, slug, grantId, enabled);
  },

  messagingSource(slug: string, sourceEventId: string): Promise<{ source: ExternalSource }> {
    return messagingSource(this.methods, slug, sourceEventId);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const messagingPolicyRpc = {
  failureAlertsSet(
    slug: string,
    enabled: boolean,
    expectedRevision: number,
  ): Promise<{ updated: true }> {
    return failureAlertsSet(this.methods, slug, enabled, expectedRevision);
  },

  failureAlertsTest(slug: string): Promise<{
    delivery: import('../../messaging/failure-alerts.js').FailureAlertDelivery;
  }> {
    return failureAlertsTest(this.methods, slug);
  },

  failureAlertsRetry(
    slug: string,
    id: string,
  ): Promise<{
    delivery: import('../../messaging/failure-alerts.js').FailureAlertDelivery;
  }> {
    return failureAlertsRetry(this.methods, slug, id);
  },

  pairingReview(slug: string, input: PairingReviewInput): Promise<{ pairing: PairingRequest }> {
    return pairingReview(this.methods, slug, input);
  },

  senderAccess(slug: string, input: SenderAccessInput): Promise<void> {
    return senderAccess(this.methods, slug, input);
  },

  messagingIdentity(
    slug: string,
    input: MessagingIdentityInput,
  ): Promise<{ identity: MessagingIdentity }> {
    return messagingIdentity(this.methods, slug, input);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const messagingConnectionRpc = {
  messagingApps(): Promise<MessagingAppsView> {
    return messagingApps(this.methods);
  },

  messagingSnapshot(slug: string, mode?: MessagingReadMode): Promise<MessagingSnapshot> {
    return messagingSnapshot(this.methods, slug, mode);
  },

  messagingReachable(
    slug: string,
    bindingId: string,
    cursor?: string,
  ): Promise<import('../../messaging/provider.js').MessagingReachablePage> {
    return messagingReachable(this.methods, slug, bindingId, cursor);
  },

  messagingPostRequest(
    slug: string,
    bindingId: string,
    conversationId: string,
    requestId: string,
    text: string,
  ): Promise<{ intent: OutboxIntent | null }> {
    return messagingPostRequest(this.methods, slug, bindingId, conversationId, requestId, text);
  },

  messagingPostConversation(
    slug: string,
    bindingId: string,
    conversationId: string,
    requestId: string,
    text: string,
  ): Promise<{ intent: OutboxIntent }> {
    return messagingPostConversation(
      this.methods,
      slug,
      bindingId,
      conversationId,
      requestId,
      text,
    );
  },

  messagingPostLimit(
    slug: string,
    bindingId: string,
    expectedRevision: number,
    limit: number | null,
  ): Promise<{ identity: MessagingIdentity }> {
    return messagingPostLimit(this.methods, slug, bindingId, expectedRevision, limit);
  },

  messagingTargets(
    providerId: string,
    accountRef: string,
  ): Promise<{ targets: MessagingTarget[] }> {
    return messagingTargets(this.methods, providerId, accountRef);
  },

  messagingAuthorize(
    botSlug: string,
    providerId: string,
    accountRef: string,
    targetRef: string,
    fingerprint: string,
    targetDigest: string,
  ): Promise<{ grant: MessagingGrant }> {
    return messagingAuthorize(
      this.methods,
      botSlug,
      providerId,
      accountRef,
      targetRef,
      fingerprint,
      targetDigest,
    );
  },

  messagingRevoke(slug: string, grantId: string): Promise<{ revoked: true }> {
    return messagingRevoke(this.methods, slug, grantId);
  },

  messagingConversation(
    slug: string,
    input: MessagingConversationInput,
  ): Promise<{ updated: true }> {
    return messagingConversation(this.methods, slug, input);
  },

  messagingSend(
    slug: string,
    grantId: string,
    requestId: string,
    text: string,
  ): Promise<{ intent: OutboxIntent }> {
    return messagingSend(this.methods, slug, grantId, requestId, text);
  },
} satisfies ThisType<BridgeRpcReceiver>;
