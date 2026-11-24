import { atMessage, plainShape, sourceFilesBase, type DshImPlatformProfile } from './types.js';

export const discordProfile: DshImPlatformProfile<'discord'> = {
  id: 'discord',
  receiptIdentity: 'native',
  receiveScope: (target) =>
    target.kind === 'channel' && typeof target.route['channelId'] === 'string'
      ? { kind: 'group', conversationId: target.route['channelId'] }
      : undefined,
  features: { reachableConversations: true, mentionMarkup: true },
  files: {
    readAllowed: () => true,
    replyAllowed: () => true,
    replyPayload: 'basic',
  },
  voiceSource: () => false,
  inbound: (host, has) => ({
    options: sourceFilesBase(host, has) ? { sourceFiles: true } : {},
    inspect: (event) => ({
      accepted: plainShape(event, has),
      attachmentMessageId: atMessage(event),
    }),
  }),
};
