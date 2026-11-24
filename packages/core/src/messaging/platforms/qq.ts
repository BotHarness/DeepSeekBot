import { atMessage, isImage, sourceFilesBase, type DshImPlatformProfile } from './types.js';

export const qqProfile: DshImPlatformProfile = {
  id: 'qq',
  receiptIdentity: 'native',
  receiveScope: (target) =>
    target.kind === 'group' && typeof target.route['groupOpenId'] === 'string'
      ? { kind: 'group', conversationId: target.route['groupOpenId'] }
      : undefined,
  features: {
    postSupportFlag: true,
    targetPost: {
      required: ['proactive-text-checked', 'proactive-fence-checked'],
    },
  },
  sendRequires: ['proactive-text-checked'],
  checkedSendFallback: (host, has) =>
    host.replyContextVersion === 1 &&
    host.replyReceiptVersion === 1 &&
    host.replyFenceVersion === 1 &&
    typeof host.consumeInbound === 'function' &&
    typeof host.qualifyReplyChecked === 'function' &&
    typeof host.replyChecked === 'function' &&
    [
      'exclusive-text-consumer',
      'reply-text-checked',
      'reply-context-checked',
      'reply-receipt-checked',
      'reply-fence-checked',
    ].every(has),
  files: {
    readAllowed: (has, attachment) =>
      isImage(attachment.mediaType) ||
      (attachment.mediaType === 'audio/unknown'
        ? has('source-voice-audio-checked')
        : has('source-generic-file-checked') && has('reply-file-fence-checked')),
    replyAllowed: (has, file) =>
      isImage(file.mediaType) ? has('reply-image-fence-checked') : has('reply-file-fence-checked'),
    replyPayload: 'full',
    requireReceipt: true,
  },
  voiceSource: () => true,
  inbound: (host, has) => {
    const files = host.fileVersion === 1;
    const images = files && has('source-image-checked') && has('reply-image-fence-checked');
    const generic =
      sourceFilesBase(host, has) &&
      has('source-generic-file-checked') &&
      has('reply-file-fence-checked');
    const direct = has('direct-message-consumer');
    return {
      options: {
        ...(direct ? { directMessages: true } : {}),
        ...(generic ? { sourceFiles: true } : {}),
        ...(images ? { sourceImages: true } : {}),
        ...(has('source-voice-transcript-checked') ? { sourceVoiceTranscripts: true } : {}),
        ...(files && has('source-voice-audio-checked') ? { sourceVoiceAudio: true } : {}),
      },
      inspect: (event) => {
        const attachments =
          event.attachments?.every((item) =>
            isImage(item.mediaType)
              ? images
              : event.voice && item.mediaType === 'audio/unknown'
                ? files && has('source-voice-audio-checked')
                : generic && item.mediaType === 'application/octet-stream',
          ) === true;
        const count = event.attachments?.length ?? 0;
        return {
          accepted:
            (event.conversation.kind === 'group' || (direct && event.conversation.kind === 'dm')) &&
            event.reply.threadId === undefined &&
            event.reply.rootId === undefined &&
            event.reply.parentId === undefined &&
            !(count > 0 && !attachments) &&
            !((event.contentParts || count > 1) && !attachments) &&
            !event.quote &&
            !(event.voice && !has('source-voice-transcript-checked')) &&
            !event.video,
          attachmentMessageId: atMessage(event),
        };
      },
    };
  },
};
