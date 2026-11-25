import { atMessage, plainShape, sourceFilesBase, type DshImPlatformProfile } from './types.js';

export const discordProfile: DshImPlatformProfile<'discord'> = {
  id: 'discord',
  receiptIdentity: 'native',
  receiveScope: (target) =>
    target.kind === 'channel' && typeof target.route['channelId'] === 'string'
      ? { kind: 'group', conversationId: target.route['channelId'] }
      : undefined,
  people: {
    namespace: 'discord-user-id',
    sender: (event) =>
      /^[0-9]{5,30}$/.test(event.actor.id) &&
      event.conversation.kind === 'dm' &&
      /^[0-9]{5,30}$/.test(event.conversation.id) &&
      event.reply.actorId === event.actor.id &&
      event.reply.conversationId === event.conversation.id &&
      event.reply.messageId === event.messageId,
    management: true,
  },
  features: { interactions: true, reachableConversations: true, mentionMarkup: true },
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
