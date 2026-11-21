import type { RemoteSource } from './client';
import type {
  AttachmentRef,
  ChannelWireMessage,
  JournalEntry,
  WireReplyPreview,
} from '@botharness/host-protocol/wire';
import type {
  MessageAttachment,
  MessageVoice,
  ReplyThumbnail,
  OutgoingFile,
} from './conversation-contract';

const PREVIEWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export const ATTACHMENT_PATH = '/api/botharness/attachment';

function attachmentPath(params: Record<string, string>): string {
  return `${ATTACHMENT_PATH}?${new URLSearchParams(params)}`;
}

function versionedSources(
  resolve: (path: string) => RemoteSource,
  owner: { channelId: string; messageId: string },
  fileId: string,
  version: string,
  image: boolean,
): { source: RemoteSource; thumbnail?: RemoteSource; preview?: RemoteSource } {
  const variant = (name?: string): RemoteSource => {
    const resolved = resolve(
      attachmentPath({
        ...owner,
        fileId,
        v: version,
        ...(name === undefined ? {} : { variant: name }),
      }),
    );
    return {
      ...resolved,
      cacheKey: mediaCacheKey(resolved.scope, fileId, version, name),
    };
  };
  if (!image) return { source: variant() };
  return {
    source: variant(),
    thumbnail: variant(THUMBNAIL_VARIANT),
    preview: variant(PREVIEW_VARIANT),
  };
}

export function mediaCacheKey(
  scope: string | undefined,
  fileId: string,
  version?: string,
  variant?: string,
): string {
  const file = `${scope === undefined ? '' : `${scope}/`}${fileId}:`;
  if (version === undefined) return file;
  return variant === undefined ? `${file}${version}` : `${file}${version}:${variant}`;
}

function refSources(
  resolve: (path: string) => RemoteSource,
  owner: { channelId: string; messageId: string },
  ref: AttachmentRef,
  image: boolean,
): { source: RemoteSource; thumbnail?: RemoteSource; preview?: RemoteSource } {
  if (ref.fileId !== undefined && ref.version !== undefined)
    return versionedSources(resolve, owner, ref.fileId, ref.version, image);
  return {
    source: resolve(
      attachmentPath(
        ref.fileId === undefined
          ? { hash: ref.hash ?? '', name: ref.name, ...owner }
          : { ...owner, fileId: ref.fileId },
      ),
    ),
  };
}

export const THUMBNAIL_VARIANT = '320';
export const PREVIEW_VARIANT = '800';

export function attachmentsOf(
  entry: JournalEntry,
  resolve: (path: string) => RemoteSource,
  picked: readonly (OutgoingFile | undefined)[] = [],
): MessageAttachment[] {
  const message = entry.message;
  const owner = { channelId: entry.channelId, messageId: message.id };
  const stored = (message.attachments ?? []).map((ref, index): MessageAttachment => {
    const file = picked[index];
    return {
      key: `${message.id}:${index}`,
      ...((ref.fileId ?? ref.hash) === undefined ? {} : { identity: ref.fileId ?? ref.hash! }),
      kind: PREVIEWABLE.has(ref.mime) ? 'image' : 'file',
      name: ref.name,
      mime: ref.mime,
      size: ref.size,
      ...(file?.uri !== undefined
        ? { source: { uri: file.uri, headers: {} } }
        : refSources(resolve, owner, ref, PREVIEWABLE.has(ref.mime))),
      ...(ref.thumbhash === undefined ? {} : { thumbhash: ref.thumbhash }),
      ...(ref.width === undefined || ref.height === undefined
        ? {}
        : { width: ref.width, height: ref.height }),
      local: file?.uri !== undefined,
    };
  });
  const sourceEventId = message.bridgeOrigin?.sourceEventId;
  const bridged = (message.bridgeMedia?.items ?? [])
    .filter((item) => item.id !== message.bridgeMedia?.video?.posterAttachmentId)
    .map((item): MessageAttachment => ({
      key: `${message.id}:bridge:${item.id}`,
      identity: `${sourceEventId ?? message.id}:bridge:${item.id}`,
      kind: item.kind === 'video' ? 'file' : item.kind,
      name: item.name,
      ...(item.sizeBytes === undefined ? {} : { size: item.sizeBytes }),
      ...(sourceEventId === undefined
        ? {}
        : {
            source: resolve(
              attachmentPath({
                channelId: entry.channelId,
                sourceEventId,
                attachmentId: item.id,
              }),
            ),
          }),
      local: false,
    }));
  const cleared = (message.clearedAttachments ?? []).map((item, index): MessageAttachment => ({
    key: `${message.id}:cleared:${index}`,
    kind: 'file',
    name: item.name,
    mime: item.mime,
    size: item.size,
    local: false,
    cleared: true,
  }));
  return [...stored, ...cleared, ...bridged];
}

export function replyThumbnailOf(
  channelId: string,
  replyTo: string,
  preview: WireReplyPreview | null | undefined,
  resolve: (path: string) => RemoteSource,
): ReplyThumbnail | undefined {
  const media = preview?.media;
  if (media?.kind !== 'image' || media.thumbnail === undefined) return undefined;
  const ref = media.thumbnail;
  const sources = refSources(resolve, { channelId, messageId: replyTo }, ref, true);
  return {
    source: sources.thumbnail ?? sources.source,
    ...(ref.thumbhash === undefined ? {} : { thumbhash: ref.thumbhash }),
  };
}

export function voiceOf(
  message: ChannelWireMessage,
  attachments: MessageAttachment[],
): { attachments: MessageAttachment[]; voice?: MessageVoice } {
  const voice = message.author.kind === 'bot' ? message.voice : undefined;
  if (voice === undefined) return { attachments };
  const audio =
    voice.attachment === undefined
      ? undefined
      : attachments.find((attachment) => attachment.identity === voice.attachment);
  return {
    attachments: audio === undefined ? attachments : attachments.filter((item) => item !== audio),
    voice: {
      state: voice.state,
      ...(audio === undefined ? {} : { audio: { ...audio, kind: 'audio' } }),
      ...(voice.durationMs === undefined ? {} : { durationMs: voice.durationMs }),
      ...(voice.error === undefined ? {} : { error: voice.error }),
    },
  };
}

export function withReplyThumbnail(thumbnail: ReplyThumbnail | undefined): {
  replyThumbnail?: ReplyThumbnail;
} {
  return thumbnail === undefined ? {} : { replyThumbnail: thumbnail };
}
