import { atMessage, plainShape, sourceFilesBase, type DshImPlatformProfile } from './types.js';

export const slackProfile: DshImPlatformProfile<'slack'> = {
  id: 'slack',
  receiptIdentity: 'native',
  receiveScope: (target) =>
    target.kind === 'conversation' && typeof target.route['channelId'] === 'string'
      ? { kind: 'group', conversationId: target.route['channelId'] }
      : undefined,
  people: {
    namespace: 'slack-workspace-user-id',
    sender: (event) =>
      /^[UW][A-Z0-9]+$/.test(event.actor.id) &&
      /^D[A-Z0-9]+$/.test(event.conversation.id) &&
      event.reply.actorId === event.actor.id &&
      event.reply.conversationId === event.conversation.id &&
      event.reply.messageId === event.messageId,
    management: true,
  },
  features: {
    interactions: true,
    reactions: true,
    reachableConversations: true,
    targetPost: { required: [] },
    mentionMarkup: true,
  },
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
