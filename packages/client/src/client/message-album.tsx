import { useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { albumLayout, type AlbumTile } from './album-layout.js';
import { downloadFromUrl, useAttachmentDownloadMenu } from './attachment-download-menu.js';
import type { BridgeActions } from './actions.js';
import { channelAttachmentUrl, type AttachmentVariant } from './bridge.js';
import { useHostFileMenu, type HostFileCommands } from './host-file-menu.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  galleryImageKey,
  ImageGalleryLightbox,
  useImageGallery,
  type GalleryImage,
} from './message-image-gallery.js';
import { useMessageHost } from './message-host.js';
import { useMessageResource } from './message-resource.js';
import type { ChannelAttachmentRef, ChannelMessage } from './store.js';

const INLINE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const SINGLE_ASPECT_MIN = 0.75;
const SINGLE_ASPECT_MAX = 2;

export function inlineImageAttachment(mime: string): boolean {
  return INLINE_IMAGE_TYPES.includes(mime);
}

export type AttachmentActions =
  | (Pick<
      BridgeActions,
      | 'messageAttachmentTarget'
      | 'messageAttachmentApplications'
      | 'messageAttachmentOpen'
      | 'messageAttachmentDownload'
    > &
      Partial<Pick<BridgeActions, 'fileOpenPreferences'>>)
  | undefined;

export function useAttachmentCommands(
  actions: AttachmentActions,
  messageId: string,
): HostFileCommands | undefined {
  return useMemo<HostFileCommands | undefined>(
    () =>
      actions === undefined
        ? undefined
        : {
            target: (owner, id) => actions.messageAttachmentTarget(owner, messageId, id),
            applications: (owner, id) =>
              actions.messageAttachmentApplications(owner, messageId, id),
            open: (owner, id, choice) =>
              actions.messageAttachmentOpen(owner, messageId, id, choice),
            download: (owner, id) => actions.messageAttachmentDownload(owner, messageId, id),
            preferences: actions.fileOpenPreferences,
          },
    [actions, messageId],
  );
}

function voiceAttachmentOf(message: ChannelMessage): ChannelAttachmentRef | undefined {
  const voice = message.voice;
  return voice?.state === 'ready'
    ? message.attachments?.find((ref) => (ref.fileId ?? ref.hash) === voice.attachment)
    : undefined;
}

export function messageFileAttachments(message: ChannelMessage): {
  voice: ChannelAttachmentRef | undefined;
  images: ChannelAttachmentRef[];
  files: ChannelAttachmentRef[];
  all: ChannelAttachmentRef[];
} {
  const voice = voiceAttachmentOf(message);
  const all = (message.attachments ?? []).filter((ref) => ref !== voice);
  return {
    voice,
    images: all.filter((ref) => inlineImageAttachment(ref.mime)),
    files: all.filter((ref) => !inlineImageAttachment(ref.mime)),
    all,
  };
}

export function bubbleMedia(message: ChannelMessage): 'bare' | 'captioned' | undefined {
  if (message.contentPurged === true || message.bridgeMedia !== undefined) return undefined;
  const { images, files } = messageFileAttachments(message);
  if (images.length === 0) return undefined;
  const bare =
    message.body.trim().length === 0 &&
    files.length === 0 &&
    message.voice === undefined &&
    message.genui === undefined &&
    message.genuiUnavailable !== true &&
    (message.clearedAttachments?.length ?? 0) === 0;
  return bare ? 'bare' : 'captioned';
}

function singleAspect(ref: ChannelAttachmentRef, fallback: number): number {
  if (ref.width === undefined || ref.height === undefined || ref.width <= 0 || ref.height <= 0)
    return fallback;
  return Math.min(SINGLE_ASPECT_MAX, Math.max(SINGLE_ASPECT_MIN, ref.width / ref.height));
}

function tileVariant(tile: AlbumTile): AttachmentVariant {
  return tile.rect.width >= 0.6 ? '800' : '320';
}

function AlbumCell({
  image,
  tile,
  index,
  channelId,
  messageId,
  commands,
  onOpen,
  t,
}: {
  image: ChannelAttachmentRef;
  tile: AlbumTile;
  index: number;
  channelId: string | undefined;
  messageId: string;
  commands: HostFileCommands | undefined;
  onOpen(item: GalleryImage): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const host = useMessageHost();
  const owner = channelId === undefined ? undefined : { channelId, messageId };
  const resource = useMessageResource(
    owner === undefined ? undefined : channelAttachmentUrl(image, owner, tileVariant(tile)),
  );
  const url = resource.url;
  const original =
    host === undefined && owner !== undefined ? channelAttachmentUrl(image, owner) : url;
  const id = image.fileId;
  const menu = useHostFileMenu(commands, channelId, t);
  const hostMenu = id !== undefined && commands !== undefined && channelId !== undefined;
  const fallback = useAttachmentDownloadMenu(
    hostMenu
      ? undefined
      : host === undefined
        ? original === undefined
          ? undefined
          : () => downloadFromUrl(original, image.name)
        : () => void resource.download(image.name),
    t,
  );
  const style: CSSProperties = {
    gridColumn: `${tile.column + 1} / span ${tile.columnSpan}`,
    gridRow: `${tile.row + 1} / span ${tile.rowSpan}`,
  };
  return (
    <div
      className="bh-message-album-cell"
      data-attachment-index={index}
      style={style}
      onContextMenu={(event) => (hostMenu ? menu.open(id, event) : fallback.open(event))}
      onKeyDown={(event) => (hostMenu ? menu.onKey(id, event) : fallback.onKey(event))}
    >
      {resource.failed ? (
        <button
          type="button"
          className="bh-message-album-tile bh-message-album-retry"
          data-album-tile={index}
          onClick={resource.retry}
        >
          {t('bridgeMedia.retry')}
        </button>
      ) : (
        <button
          type="button"
          className="bh-message-image-link bh-message-album-tile"
          data-album-tile={index}
          aria-label={
            tile.overflow > 0
              ? t('message.album.more', { name: image.name, count: String(tile.overflow) })
              : t('message.image.open', { name: image.name })
          }
          disabled={url === undefined && original === undefined}
          onClick={() => {
            const src = original ?? url;
            if (src === undefined) return;
            onOpen({ key: galleryImageKey(messageId, image), src, alt: image.name });
          }}
        >
          {url === undefined ? null : (
            <img
              className="bh-message-image"
              src={url}
              alt={image.name}
              loading="lazy"
              decoding="async"
            />
          )}
          {tile.overflow > 0 ? (
            <span className="bh-message-album-more" aria-hidden="true">
              +{tile.overflow}
            </span>
          ) : null}
        </button>
      )}
      {menu.menu}
      {menu.feedback}
      {fallback.menu}
    </div>
  );
}

export function MessageAlbum({
  images,
  channelId,
  messageId,
  actions,
  indexOf,
  t,
}: {
  images: readonly ChannelAttachmentRef[];
  channelId: string | undefined;
  messageId: string;
  actions?: AttachmentActions;
  indexOf?: ((ref: ChannelAttachmentRef) => number) | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const commands = useAttachmentCommands(actions, messageId);
  const gallery = useImageGallery();
  const [alone, setAlone] = useState<GalleryImage>();
  const layout = albumLayout(images.length);
  if (layout.tiles.length === 0) return null;
  const many = images.length > 1;
  const style: CSSProperties = {
    gridTemplateColumns: layout.columns.map((weight) => `${weight}fr`).join(' '),
    gridTemplateRows: layout.rows.map((weight) => `${weight}fr`).join(' '),
    aspectRatio: String(many ? layout.aspectRatio : singleAspect(images[0]!, layout.aspectRatio)),
  };
  const open = (item: GalleryImage): void => {
    if (gallery === undefined) setAlone(item);
    else gallery.open(item.key, item);
  };
  return (
    <div
      className="bh-message-album"
      data-album-count={images.length}
      {...(many
        ? {
            role: 'group',
            'aria-label': t('message.album.label', { count: String(images.length) }),
          }
        : {})}
      style={style}
    >
      {layout.tiles.map((tile) => {
        const image = images[tile.index]!;
        return (
          <AlbumCell
            key={`${image.fileId ?? image.hash}-${tile.index}`}
            image={image}
            tile={tile}
            index={indexOf?.(image) ?? tile.index}
            channelId={channelId}
            messageId={messageId}
            commands={commands}
            onOpen={open}
            t={t}
          />
        );
      })}
      {alone === undefined ? null : (
        <ImageGalleryLightbox
          images={[alone]}
          index={0}
          onIndex={() => undefined}
          onClose={() => setAlone(undefined)}
          t={t}
        />
      )}
    </div>
  );
}
