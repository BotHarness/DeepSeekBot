import {
  isImage,
  sourceFilesBase,
  type DshImInboundShape,
  type DshImPlatformProfile,
} from './types.js';

function isLarkVideo(event: DshImInboundShape, images: boolean): boolean {
  const video = event.video;
  const items = event.attachments ?? [];
  if (
    !video ||
    !event.mentionedAccount ||
    !event.reply.parentId ||
    event.reply.parentId === event.messageId ||
    event.contentParts ||
    event.voice ||
    video.playLength !== undefined ||
    video.reportedSizeBytes !== undefined ||
    items.length !== (video.posterAttachmentId === undefined ? 1 : 2)
  )
    return false;
  return (
    items.every((item) =>
      item.messageId !== event.reply.parentId
        ? false
        : item.id === video.itemId
          ? item.mediaType === 'video/unknown'
          : images && item.id === video.posterAttachmentId && item.mediaType === 'image/unknown',
    ) && items.some((item) => item.id === video.itemId)
  );
}

function isLarkVoice(event: DshImInboundShape): boolean {
  const voice = event.voice;
  const item = event.attachments?.[0];
  return (
    voice !== undefined &&
    event.mentionedAccount &&
    !!event.reply.parentId &&
    event.reply.parentId !== event.messageId &&
    !event.contentParts &&
    !event.video &&
    voice.transcript === 'unavailable' &&
    voice.encodeType === undefined &&
    voice.sampleRate === undefined &&
    voice.bitsPerSample === undefined &&
    event.attachments?.length === 1 &&
    item !== undefined &&
    item.id === voice.itemId &&
    item.messageId === event.reply.parentId &&
    item.mediaType === 'audio/unknown'
  );
}

export const feishuProfile: DshImPlatformProfile<'feishu'> = {
  id: 'feishu',
  setup: { platform: 'feishu', kind: 'credentials' },
  receiptIdentity: 'native',
  receiveScope: (target) => {
    const chatId = target.route['chatId'];
    const openId = target.route['openId'];
    if (target.kind === 'group' && typeof chatId === 'string')
      return { kind: 'group', conversationId: chatId };
    if (
      target.kind === 'user' &&
      typeof openId === 'string' &&
      /^ou_[A-Za-z0-9]+$/.test(openId) &&
      typeof chatId === 'string' &&
      /^oc_[A-Za-z0-9]+$/.test(chatId)
    )
      return { kind: 'dm', conversationId: chatId };
    return undefined;
  },
  features: {
    reactions: true,
    cards: true,
    interactions: true,
    reachableConversations: true,
    targetPost: { required: [] },
  },
  files: {
    readAllowed: (has, attachment) =>
      attachment.mediaType !== 'video/unknown' || has('source-video-checked'),
    replyAllowed: () => true,
    replyPayload: 'basic',
  },
  voiceSource: (event) => event.attachments?.length === 1,
  inbound: (host, has) => {
    const images = host.fileVersion === 1 && has('source-image-checked');
    const files = sourceFilesBase(host, has);
    const videos = files && has('source-video-checked');
    const voices = files && has('source-voice-audio-checked');
    return {
      options: {
        ...(files ? { sourceFiles: true } : {}),
        ...(images ? { sourceImages: true } : {}),
        ...(voices ? { sourceVoiceAudio: true } : {}),
        ...(videos ? { sourceVideos: true } : {}),
      },
      inspect: (event) => {
        const video = videos && isLarkVideo(event, images);
        const voice = voices && isLarkVoice(event);
        const allImages = !!event.attachments?.every((item) => isImage(item.mediaType));
        const several =
          !!event.contentParts ||
          (event.attachments?.length ?? 0) > 1 ||
          !!event.attachments?.some((item) => isImage(item.mediaType));
        return {
          accepted:
            !(several && !video && (!has('source-image-checked') || !allImages)) &&
            !event.quote &&
            !(event.voice && !voice) &&
            !(event.video && !video),
          attachmentMessageId: (item) =>
            video || !isImage(item.mediaType) ? event.reply.parentId : event.messageId,
        };
      },
    };
  },
};
