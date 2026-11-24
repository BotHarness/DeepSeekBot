import type { DshImOutboundService, DshImTarget } from '../../features/messaging/dsh-im-types.js';
import type { MessagingAttachment, MessagingSetupVariant } from '../provider.js';

export const messagingPlatformIds = ['feishu', 'slack', 'discord', 'weixin', 'qq'] as const;
export type MessagingPlatformId = (typeof messagingPlatformIds)[number];

export type DshImDescribedBot = Awaited<ReturnType<DshImOutboundService['describeBot']>>;
export type Capabilities = (capability: string) => boolean;

export interface DshImInboundShape {
  messageId: string;
  conversation: { kind: 'group' | 'dm' };
  mentionedAccount: boolean;
  attachments?: { id: string; messageId: string; mediaType?: string | undefined }[] | undefined;
  contentParts?: unknown[] | undefined;
  voice?:
    | {
        transcript: 'platform' | 'unavailable';
        itemId?: string | undefined;
        encodeType?: number | undefined;
        sampleRate?: number | undefined;
        bitsPerSample?: number | undefined;
      }
    | undefined;
  video?:
    | {
        itemId?: string | undefined;
        reportedSizeBytes?: number | undefined;
        playLength?: number | undefined;
        durationMs?: number | undefined;
        posterAttachmentId?: string | undefined;
      }
    | undefined;
  quote?: unknown;
  reply: {
    threadId?: string | undefined;
    rootId?: string | undefined;
    parentId?: string | undefined;
  };
}

export interface DshImConsumeOptions {
  sourceFiles?: true;
  sourceImages?: true;
  sourceVoiceTranscripts?: true;
  sourceVoiceAudio?: true;
  sourceVideos?: true;
  sourceQuotes?: true;
  directMessages?: true;
}

export interface DshImInboundPolicy {
  options: DshImConsumeOptions;
  inspect(event: DshImInboundShape): {
    accepted: boolean;
    attachmentMessageId(item: { mediaType?: string | undefined }): string | undefined;
  };
}

export interface DshImPlatformProfile<Id extends MessagingPlatformId = MessagingPlatformId> {
  id: Id;
  setup?: MessagingSetupVariant & { platform: Id };
  receiptIdentity: 'native' | 'client-acknowledgement';
  receiveScope(target: DshImTarget): { kind: 'group' | 'dm'; conversationId: string } | undefined;
  features: {
    postSupportFlag?: true;
    reactions?: true;
    typing?: true;
    cards?: true;
    reachableConversations?: true;
    targetPost?: { required: readonly string[] };
    mentionMarkup?: true;
  };
  sendRequires?: readonly string[];
  checkedSendFallback?(host: DshImOutboundService, has: Capabilities): boolean;
  files: {
    readAllowed(has: Capabilities, attachment: MessagingAttachment): boolean;
    replyAllowed(has: Capabilities, file: { mediaType?: string | undefined }): boolean;
    replyPayload: 'full' | 'basic';
    requireReceipt?: true;
  };
  voiceSource(event: DshImInboundShape): boolean;
  inbound(host: DshImOutboundService, has: Capabilities): DshImInboundPolicy;
}

export function sourceFilesBase(host: DshImOutboundService, has: Capabilities): boolean {
  return host.fileVersion === 1 && has('source-file-checked') && has('reply-file-checked');
}

export function plainShape(event: DshImInboundShape, has: Capabilities): boolean {
  return (
    !event.contentParts &&
    (event.attachments?.length ?? 0) <= 1 &&
    !event.quote &&
    !(event.voice && !has('source-voice-transcript-checked')) &&
    !event.video
  );
}

export const atMessage = (event: DshImInboundShape) => () => event.messageId;

export const isImage = (mediaType: string | undefined) => !!mediaType?.startsWith('image/');
