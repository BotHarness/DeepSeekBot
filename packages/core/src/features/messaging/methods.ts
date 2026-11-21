import { asSlug, invalidInput, type BridgeResult } from '../../bridge/method-utils.js';
import { pairingReviewInput, type PairingRequest } from '../../messaging/pairing.js';
import { senderAccessInput } from '../../messaging/sender-access.js';
import { channelBridgeInput, type ChannelBridgeSnapshot } from '../../messaging/channel-bridge.js';
import {
  conversationIngestInput,
  type ConversationIngestSnapshot,
} from '../../messaging/conversation-ingest.js';
import {
  messagingDefaultsInput,
  messagingDefaultsPlatform,
  type MessagingDefaults,
} from '../../messaging/defaults.js';
import type { MessagingIdentity } from '../../messaging/identity.js';
import { threadReceptionInput } from '../../messaging/thread-policy.js';
import { groupReceptionInput } from '../../messaging/group-policy.js';
import type { ExternalSource } from '../../messaging/inbound.js';
import type {
  OutboundMessaging,
  MessagingApp,
  MessagingSnapshot,
  MessagingGrant,
  OutboxIntent,
} from '../../messaging/outbound.js';
import { MessagingError, type MessagingTarget } from '../../messaging/provider.js';
import { OperationalDatabaseError } from '../../database/owner.js';
import { z } from 'zod';
import { ChannelAttachmentError } from '../../attachments/store.js';
import { type MemoryFileTarget } from '../../memory/file-actions.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';

export interface MessagingAppsView {
  apps: MessagingApp[];
  setups: NonNullable<MessagingSnapshot['appSetups']>;
}

export function createMessagingCall(deps: Pick<BridgeMethodsDeps, 'externalMessaging' | 'warn'>) {
  const messagingCall = async <T>(
    operation: (service: OutboundMessaging) => Promise<T>,
  ): Promise<BridgeResult<T>> => {
    if (deps.externalMessaging === undefined)
      return {
        ok: false,
        error: {
          code: 'messaging-unavailable',
          message: 'External messaging is unavailable',
        },
      };
    try {
      return { ok: true, value: await operation(deps.externalMessaging) };
    } catch (error) {
      if (error instanceof MessagingError)
        return { ok: false, error: { code: error.code, message: error.code } };
      const storage = error instanceof OperationalDatabaseError;
      deps.warn?.(
        JSON.stringify({
          module: 'messaging',
          initiator: 'client',
          phase: 'rpc-failed',
          reason: storage ? 'operational-storage-unavailable' : 'unexpected-error',
        }),
      );
      return {
        ok: false,
        error: {
          code: storage ? 'messaging-storage-unavailable' : 'messaging-unavailable',
          message: storage
            ? 'External messaging storage is unavailable'
            : 'External messaging is unavailable',
        },
      };
    }
  };
  return messagingCall;
}
export interface MessagingBridgeMethods {
  failureAlertsSet(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  failureAlertsTest(payload: unknown): Promise<
    BridgeResult<{
      delivery: import('../../messaging/failure-alerts.js').FailureAlertDelivery;
    }>
  >;
  failureAlertsRetry(payload: unknown): Promise<
    BridgeResult<{
      delivery: import('../../messaging/failure-alerts.js').FailureAlertDelivery;
    }>
  >;
  pairingReview(payload: unknown): Promise<BridgeResult<{ pairing: PairingRequest }>>;
  senderAccess(payload: unknown): Promise<BridgeResult<void>>;
  channelBridges(payload: unknown): Promise<BridgeResult<ChannelBridgeSnapshot>>;
  channelIngests(payload: unknown): Promise<BridgeResult<ConversationIngestSnapshot>>;
  channelIngest(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  channelBridge(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingIdentity(payload: unknown): Promise<BridgeResult<{ identity: MessagingIdentity }>>;
  messagingChannelTarget(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingThreadPolicy(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingGroupPolicy(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingReceive(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingSource(payload: unknown): Promise<BridgeResult<{ source: ExternalSource }>>;
  messagingDefaults(payload: unknown): Promise<BridgeResult<MessagingDefaults>>;
  messagingDefaultsSet(payload: unknown): Promise<BridgeResult<MessagingDefaults>>;
  messagingApps(): Promise<BridgeResult<MessagingAppsView>>;
  messagingSnapshot(payload: unknown): Promise<BridgeResult<MessagingSnapshot>>;
  messagingReachable(
    payload: unknown,
  ): Promise<BridgeResult<import('../../messaging/provider.js').MessagingReachablePage>>;
  messagingPostConversation(payload: unknown): Promise<BridgeResult<{ intent: OutboxIntent }>>;
  messagingPostRequest(payload: unknown): Promise<BridgeResult<{ intent: OutboxIntent | null }>>;
  messagingPostLimit(payload: unknown): Promise<BridgeResult<{ identity: MessagingIdentity }>>;
  messagingTargets(payload: unknown): Promise<BridgeResult<{ targets: MessagingTarget[] }>>;
  messagingAuthorize(payload: unknown): Promise<BridgeResult<{ grant: MessagingGrant }>>;
  messagingRevoke(payload: unknown): Promise<BridgeResult<{ revoked: true }>>;
  messagingConversation(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingSend(payload: unknown): Promise<BridgeResult<{ intent: OutboxIntent }>>;
  channelMediaTarget(payload: unknown): Promise<BridgeResult<{ target: MemoryFileTarget }>>;
}

export function createMessagingBridgeMethods(
  deps: BridgeMethodsDeps,
  messagingCall: ReturnType<typeof createMessagingCall>,
): MessagingBridgeMethods {
  return {
    channelBridges(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(128),
          mode: z.enum(['saved', 'status']).optional(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Known Group Channel required'));
      return messagingCall((service) =>
        service.channelBridges(input.data.channelId, input.data.mode),
      );
    },
    channelIngests(payload) {
      const input = z
        .object({ channelId: z.string().min(1).max(128) })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Known Group Channel required'));
      return messagingCall(async (service) => service.inbound.ingests(input.data.channelId));
    },
    channelIngest(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(128),
          input: conversationIngestInput,
        })
        .strict()
        .safeParse(payload);
      if (!input.success)
        return Promise.resolve(invalidInput('Invalid external conversation command'));
      return messagingCall(async (service) => {
        await service.inbound.ingest(input.data.channelId, input.data.input);
        return { updated: true as const };
      });
    },
    channelBridge(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(128),
          input: channelBridgeInput,
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid Channel Bridge command'));
      return messagingCall(async (service) => {
        await service.inbound.channelBridge(input.data.channelId, input.data.input);
        return { updated: true as const };
      });
    },
    messagingChannelTarget(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          grantId: z.string().uuid(),
          channelId: z.string().min(1).max(128).nullable(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid Bridge Channel target'));
      return messagingCall(async (service) => {
        await service.inbound.setChannelTarget(
          input.data.slug,
          input.data.grantId,
          input.data.channelId,
        );
        return { updated: true as const };
      });
    },
    messagingThreadPolicy(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          sourceEventId: z.string().min(1).max(128),
          policy: threadReceptionInput,
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid external Thread policy'));
      return messagingCall(async (service) => {
        await service.inbound.setThread(
          input.data.slug,
          input.data.sourceEventId,
          input.data.policy,
          { kind: 'human' },
        );
        return { updated: true as const };
      });
    },
    messagingGroupPolicy(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          grantId: z.string().uuid(),
          policy: groupReceptionInput,
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid external group policy'));
      return messagingCall(async (service) => {
        await service.inbound.setPolicy(input.data.slug, input.data.grantId, input.data.policy, {
          kind: 'human',
        });
        return { updated: true as const };
      });
    },
    messagingReceive(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          grantId: z.string().uuid(),
          enabled: z.boolean(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid receive setting'));
      return messagingCall(async (service) => {
        await service.inbound.setEnabled(input.data.slug, input.data.grantId, input.data.enabled);
        return { updated: true as const };
      });
    },
    messagingSource(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          sourceEventId: z.string().min(1).max(128),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid external source'));
      return messagingCall(async (service) => ({
        source: service.inbound.read(input.data.slug, input.data.sourceEventId),
      }));
    },
    failureAlertsSet(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          enabled: z.boolean(),
          expectedRevision: z.number().int().nonnegative(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid failure-alert settings'));
      return messagingCall(async (service) => {
        service.failureAlerts.set(input.data.slug, input.data.enabled, input.data.expectedRevision);
        return { updated: true as const };
      });
    },
    failureAlertsTest(payload) {
      const input = z
        .object({ slug: z.string().min(1) })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid Bot'));
      return messagingCall(async (service) => ({
        delivery: await service.failureAlerts.test(input.data.slug),
      }));
    },
    failureAlertsRetry(payload) {
      const input = z
        .object({ slug: z.string().min(1), id: z.string().uuid() })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid notification'));
      return messagingCall(async (service) => ({
        delivery: await service.failureAlerts.retry(input.data.slug, input.data.id),
      }));
    },
    senderAccess(payload) {
      const input = z
        .object({ slug: z.string().min(1), input: senderAccessInput })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid sender access'));
      return messagingCall(async (service) =>
        service.senderAccess(input.data.slug, input.data.input),
      );
    },
    pairingReview(payload) {
      const input = z
        .object({ slug: z.string().min(1), input: pairingReviewInput })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid pairing review'));
      return messagingCall(async (service) => ({
        pairing: await service.reviewPairing(input.data.slug, input.data.input),
      }));
    },
    messagingIdentity(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          input: z.discriminatedUnion('kind', [
            z
              .object({
                kind: z.literal('bind'),
                providerId: z.string().min(1).max(128),
                accountRef: z.string().min(1).max(512),
                fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
              })
              .strict(),
            z
              .object({
                kind: z.literal('update'),
                id: z.string().uuid(),
                expectedRevision: z.number().int().positive(),
                name: z.string().trim().min(1).max(120),
                enabled: z.boolean(),
                inheritEnabled: z.boolean().optional(),
                typingEnabled: z.boolean().optional(),
                inheritTyping: z.boolean().optional(),
                expectedDefaultRevision: z.number().int().min(0).optional(),
                newConversations: z.enum(['auto', 'ask', 'inherit']).optional(),
              })
              .strict(),
            z
              .object({
                kind: z.literal('reconnect'),
                id: z.string().uuid(),
                expectedRevision: z.number().int().positive(),
              })
              .strict(),
            z
              .object({
                kind: z.literal('unbind'),
                id: z.string().uuid(),
                expectedRevision: z.number().int().positive(),
              })
              .strict(),
          ]),
        })
        .strict()
        .safeParse(payload);
      if (!input.success || deps.registry.get(input.data.slug) === undefined)
        return Promise.resolve(invalidInput('Known Bot and valid identity operation required'));
      return messagingCall(async (service) => ({
        identity: await service.identity(input.data.slug, input.data.input),
      }));
    },
    messagingDefaults(payload) {
      const parsed = z
        .object({ platform: messagingDefaultsPlatform.optional() })
        .strict()
        .safeParse(payload);
      if (!parsed.success)
        return Promise.resolve(invalidInput('Valid qualified platform required'));
      return messagingCall(async (service) => service.defaults(parsed.data.platform ?? 'feishu'));
    },
    messagingDefaultsSet(payload) {
      const parsed = messagingDefaultsInput.safeParse(payload);
      if (!parsed.success)
        return Promise.resolve(invalidInput('Valid qualified platform defaults required'));
      return messagingCall((service) => service.setDefaults(parsed.data));
    },
    messagingApps() {
      return messagingCall(async (service) => ({
        apps: await service.apps(),
        setups: await service.setups(),
      }));
    },
    messagingSnapshot(payload) {
      const input = z
        .object({ slug: z.string(), mode: z.enum(['saved', 'status']).optional() })
        .strict()
        .safeParse(payload);
      const slug = asSlug(payload);
      if (!input.success || slug === undefined || deps.registry.get(slug) === undefined)
        return Promise.resolve(invalidInput('Known bot required'));
      return messagingCall((service) => service.snapshot(slug, input.data.mode));
    },
    messagingReachable(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          bindingId: z.string().uuid(),
          cursor: z.string().min(1).max(2048).optional(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid reachable group query'));
      return messagingCall((service) =>
        service.reachable(input.data.slug, input.data.bindingId, input.data.cursor),
      );
    },
    messagingPostRequest(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          bindingId: z.string().uuid(),
          conversationId: z.string().min(1).max(512),
          requestId: z.string().min(8).max(128),
          text: z.string().trim().min(1).max(4000),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid proactive request query'));
      return messagingCall(async (service) => ({
        intent:
          service.postRequest(
            input.data.slug,
            input.data.bindingId,
            input.data.conversationId,
            input.data.requestId,
            input.data.text,
          ) ?? null,
      }));
    },
    messagingPostConversation(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          bindingId: z.string().uuid(),
          conversationId: z.string().min(1).max(512),
          requestId: z.string().min(8).max(128),
          text: z.string().trim().min(1).max(4000),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid proactive post'));
      return messagingCall(async (service) => ({
        intent: await service.postConversation(
          input.data.slug,
          input.data.bindingId,
          input.data.conversationId,
          input.data.requestId,
          input.data.text,
        ),
      }));
    },
    messagingPostLimit(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          bindingId: z.string().uuid(),
          expectedRevision: z.number().int().positive(),
          limit: z.number().int().min(1).max(10000).nullable(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid post limit'));
      return messagingCall(async (service) => ({
        identity: await service.setPostLimit(
          input.data.slug,
          input.data.bindingId,
          input.data.expectedRevision,
          input.data.limit,
        ),
      }));
    },
    messagingTargets(payload) {
      const input = z
        .object({
          providerId: z.string().min(1),
          accountRef: z.string().min(1),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid target query'));
      return messagingCall(async (service) => ({
        targets: await service.targets(input.data.providerId, input.data.accountRef),
      }));
    },
    messagingAuthorize(payload) {
      const input = z
        .object({
          botSlug: z.string().min(1),
          providerId: z.string().min(1),
          accountRef: z.string().min(1),
          targetRef: z.string().min(1),
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          targetDigest: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid authorization'));
      return messagingCall(async (service) => ({
        grant: await service.authorize(input.data),
      }));
    },
    messagingRevoke(payload) {
      const input = z
        .object({ slug: z.string().min(1), grantId: z.string().uuid() })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid grant'));
      return messagingCall(async (service) => {
        service.revoke(input.data.slug, input.data.grantId);
        return { revoked: true as const };
      });
    },
    messagingConversation(payload) {
      const conversation = z
        .object({
          kind: z.enum(['dm', 'group']),
          id: z.string().min(1).max(512),
        })
        .strict();
      const revision = z.number().int().min(0);
      const input = z
        .object({
          slug: z.string().min(1),
          input: z.discriminatedUnion('kind', [
            z
              .object({
                kind: z.literal('open-group'),
                grantId: z.string().uuid(),
                expectedRevision: revision,
                open: z.boolean(),
              })
              .strict(),
            z
              .object({
                kind: z.literal('mute'),
                grantId: z.string().uuid(),
                expectedRevision: revision,
                muted: z.boolean(),
              })
              .strict(),
            z
              .object({
                kind: z.literal('block'),
                grantId: z.string().uuid(),
                expectedRevision: revision,
              })
              .strict(),
            z
              .object({
                kind: z.literal('block-held'),
                bindingId: z.string().uuid(),
                conversation,
                expectedRevision: revision,
              })
              .strict(),
            z
              .object({
                kind: z.literal('allow'),
                bindingId: z.string().uuid(),
                conversation,
                from: z.enum(['held', 'blocked']),
                expectedRevision: revision,
              })
              .strict(),
          ]),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid conversation change'));
      return messagingCall(async (service) => {
        await service.conversation(input.data.slug, input.data.input);
        return { updated: true as const };
      });
    },
    messagingSend(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          grantId: z.string().uuid(),
          requestId: z.string().min(8).max(128),
          text: z.string().min(1).max(4000),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid send'));
      return messagingCall(async (service) => {
        const { slug, grantId, requestId, text } = input.data;
        const snapshot = await service.snapshot(slug);
        const grant = snapshot.grants.find((value) => value.id === grantId);
        return {
          intent:
            grant?.platform === 'weixin' || grant?.platform === 'qq'
              ? await service.post(slug, grantId, requestId, text)
              : await service.send(slug, grantId, requestId, text),
        };
      });
    },
    channelMediaTarget(payload) {
      const input = z
        .object({
          channelId: z.string().min(1),
          sourceEventId: z.string().min(1),
          attachmentId: z.string().min(1),
        })
        .strict()
        .safeParse(payload);
      if (!input.success || deps.attachments === undefined)
        return Promise.resolve(invalidInput('Channel media and attachment storage are required'));
      return messagingCall(async (service) => {
        try {
          const media = await service.readChannelMedia({
            ...input.data,
            signal: AbortSignal.timeout(30_000),
          });
          await media.body.cancel();
          if (!media.ref.fileId) throw new MessagingError('source-unavailable');
          return { target: deps.attachments!.fileTarget(media.ref.fileId) };
        } catch (error) {
          if (error instanceof ChannelAttachmentError) throw new MessagingError(error.code);
          throw error;
        }
      });
    },
  };
}
