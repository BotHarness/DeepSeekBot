import { atMessage, isImage, sourceFilesBase, type DshImPlatformProfile } from './types.js';

export const weixinProfile: DshImPlatformProfile = {
  id: 'weixin',
  setupKind: 'qr',
  receiptIdentity: 'client-acknowledgement',
  receiveScope: (target) =>
    target.kind === 'user' && typeof target.route['toUserId'] === 'string'
      ? { kind: 'dm', conversationId: target.route['toUserId'] }
      : undefined,
  features: {
    postSupportFlag: true,
    typing: true,
    targetPost: {
      required: ['proactive-text-checked', 'proactive-fence-checked'],
    },
  },
  files: {
    readAllowed: () => true,
    replyAllowed: (has, file) =>
      has('reply-file-fence-checked') &&
      (!isImage(file.mediaType) || has('reply-image-fence-checked')) &&
      (!file.mediaType?.startsWith('video/') || has('reply-video-fence-checked')),
    replyPayload: 'full',
  },
  voiceSource: () => true,
  inbound: (host, has) => {
    const files = host.fileVersion === 1;
    const videos = files && has('source-video-checked') && has('reply-video-fence-checked');
    return {
      options: {
        ...(files && has('source-image-checked') && has('reply-image-fence-checked')
          ? { sourceImages: true }
          : {}),
        ...(sourceFilesBase(host, has) && has('reply-file-fence-checked')
          ? { sourceFiles: true }
          : {}),
        ...(has('source-quote-checked') ? { sourceQuotes: true } : {}),
        ...(has('source-voice-transcript-checked') ? { sourceVoiceTranscripts: true } : {}),
        ...(files && has('source-voice-audio-checked') ? { sourceVoiceAudio: true } : {}),
        ...(videos ? { sourceVideos: true } : {}),
      },
      inspect: (event) => ({
        accepted:
          !event.contentParts &&
          (event.attachments?.length ?? 0) <= 1 &&
          !(event.quote && !has('source-quote-checked')) &&
          !(event.voice && !has('source-voice-transcript-checked')) &&
          event.video?.durationMs === undefined &&
          event.video?.posterAttachmentId === undefined &&
          !(
            event.video &&
            (!has('source-video-checked') ||
              !has('reply-video-fence-checked') ||
              event.attachments?.length !== 1 ||
              event.attachments[0]?.mediaType !== 'video/unknown')
          ),
        attachmentMessageId: atMessage(event),
      }),
    };
  },
};
