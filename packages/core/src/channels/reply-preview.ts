import { isChannelAttachmentRef, type ChannelAttachmentRef } from '../attachments/ref.js';
import type { ChannelMessageAuthor } from './message-author.js';

export type ChannelReplyPreviewMedia<Ref = ChannelAttachmentRef> =
  | { kind: 'image'; count: number; thumbnail?: Ref }
  | { kind: 'voice'; durationMs?: number }
  | { kind: 'file'; name: string; count: number };

export interface ChannelReplyPreview<Ref = ChannelAttachmentRef> {
  author: ChannelMessageAuthor;
  body: string;
  media?: ChannelReplyPreviewMedia<Ref>;
}

export const REPLY_THUMBNAIL_MIMES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export const REPLY_PREVIEW_LIMIT = 140;

export interface ReplyPreviewSource<Ref extends { name: string; mime: string }> {
  author: ChannelMessageAuthor;
  body: string;
  attachments?: readonly Ref[] | undefined;
  voice?: { state: string; durationMs?: number | undefined } | undefined;
  bridgeMedia?:
    | {
        voice?: { durationMs?: number | undefined } | undefined;
        items: readonly { kind: string; name: string }[];
      }
    | undefined;
}

function withDuration(durationMs: number | undefined): ChannelReplyPreviewMedia<never> {
  return durationMs === undefined ? { kind: 'voice' } : { kind: 'voice', durationMs };
}

export function replyPreviewMedia<Ref extends { name: string; mime: string }>(
  target: ReplyPreviewSource<Ref>,
  projectThumbnail: (ref: Ref) => Ref = (ref) => ref,
): ChannelReplyPreviewMedia<Ref> | undefined {
  if (target.voice !== undefined)
    return withDuration(target.voice.state === 'ready' ? target.voice.durationMs : undefined);
  const attachments = target.attachments ?? [];
  const images = attachments.filter((ref) => REPLY_THUMBNAIL_MIMES.has(ref.mime));
  const first = images[0];
  if (first !== undefined)
    return { kind: 'image', count: images.length, thumbnail: projectThumbnail(first) };
  if (attachments[0] !== undefined)
    return { kind: 'file', name: attachments[0].name, count: attachments.length };
  const bridged = target.bridgeMedia;
  if (bridged === undefined) return undefined;
  if (bridged.voice !== undefined) return withDuration(bridged.voice.durationMs);
  const bridgedImages = bridged.items.filter((item) => item.kind === 'image').length;
  if (bridgedImages > 0) return { kind: 'image', count: bridgedImages };
  const firstItem = bridged.items[0];
  return firstItem === undefined
    ? undefined
    : { kind: 'file', name: firstItem.name, count: bridged.items.length };
}

export function replyPreviewBody(body: string): string {
  const characters = Array.from(body.replace(/\s+/gu, ' ').trim());
  return characters.length > REPLY_PREVIEW_LIMIT
    ? characters.slice(0, REPLY_PREVIEW_LIMIT).join('') + '...'
    : characters.join('');
}

export function replyPreviewOf<Ref extends { name: string; mime: string }>(
  target: ReplyPreviewSource<Ref>,
  projectThumbnail?: (ref: Ref) => Ref,
): ChannelReplyPreview<Ref> {
  const media = replyPreviewMedia(target, projectThumbnail);
  return {
    author: target.author,
    body: replyPreviewBody(target.body),
    ...(media === undefined ? {} : { media }),
  };
}

const optionalDuration = (value: unknown): boolean =>
  value === undefined || (Number.isSafeInteger(value) && (value as number) >= 0);
const positiveCount = (value: unknown): boolean =>
  Number.isSafeInteger(value) && (value as number) > 0;

export function isChannelReplyPreviewMedia(value: unknown): value is ChannelReplyPreviewMedia {
  if (typeof value !== 'object' || value === null) return false;
  const media = value as Record<string, unknown>;
  switch (media['kind']) {
    case 'image':
      return (
        positiveCount(media['count']) &&
        (media['thumbnail'] === undefined || isChannelAttachmentRef(media['thumbnail']))
      );
    case 'voice':
      return optionalDuration(media['durationMs']);
    case 'file':
      return (
        typeof media['name'] === 'string' &&
        media['name'].length > 0 &&
        positiveCount(media['count'])
      );
    default:
      return false;
  }
}
