import { use, useState, type ReactNode } from 'react';
import { ResourceImage as Image } from '../primitives/resource-image';
import { Pressable, View } from 'react-native';

import {
  albumLayout,
  type AlbumRect,
} from '../../../../../packages/client/src/client/album-layout';
import type { MessageAttachment, ReplyThumbnail } from '../../host/conversation';
import { over } from '../design/layers';
import { edge, fileTile, mediaBubble, radius, replyThumb, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { FileIcon, PhotoIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { useMediaLongPress } from './media-long-press';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { ChatOffline } from './chat-offline';

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FileTone = keyof typeof fileTile.fill;

const EXTENSION_TONES: Record<string, FileTone> = {
  pdf: 'pdf',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  tsv: 'sheet',
  numbers: 'sheet',
  doc: 'doc',
  docx: 'doc',
  rtf: 'doc',
  txt: 'doc',
  md: 'doc',
  pages: 'doc',
  odt: 'doc',
  ppt: 'slides',
  pptx: 'slides',
  key: 'slides',
  odp: 'slides',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  gz: 'archive',
  tar: 'archive',
  tgz: 'archive',
  mp3: 'media',
  m4a: 'media',
  wav: 'media',
  ogg: 'media',
  mp4: 'media',
  mov: 'media',
  webm: 'media',
  json: 'code',
  js: 'code',
  ts: 'code',
  tsx: 'code',
  py: 'code',
  html: 'code',
  css: 'code',
  yaml: 'code',
  yml: 'code',
  sh: 'code',
};

export function fileType(name: string): { label: string; tone: FileTone } {
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
  if (extension === '' || extension.length > 5) return { label: '', tone: 'other' };
  return { label: extension.toUpperCase(), tone: EXTENSION_TONES[extension] ?? 'other' };
}

export function albumWidth(screen: number): number {
  return Math.min(
    mediaBubble.maxWidth,
    Math.round((screen - space.x4 * 2) * mediaBubble.widthRatio),
  );
}

function AttachmentImage({
  attachment,
  human,
  width,
  height,
  onOpen,
  onImageReady,
  children,
}: {
  attachment: MessageAttachment;
  human: boolean;
  width: number;
  height: number;
  onOpen(attachment: MessageAttachment): void;
  onImageReady?: ((key: string, ready: boolean) => void) | undefined;
  children?: ReactNode;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const offline = use(ChatOffline);
  const longPress = useMediaLongPress();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const source = attachment.preview ?? attachment.source;
  const tone = human ? 'onAccent' : 'muted';
  const fill = human ? over(theme.color.selected, theme.color.accent) : theme.layer.raised.inset;
  const box = { width, height, backgroundColor: fill };
  if (source === undefined || failed) {
    const fallback =
      source === undefined
        ? t.attachmentElsewhere
        : offline
          ? t.imageNeedsConnection
          : t.imageUnavailable;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${attachment.name}, ${fallback}`}
        disabled={source === undefined || offline}
        {...longPress}
        onPress={() => {
          setFailed(false);
          setAttempt((value) => value + 1);
        }}
        style={{
          ...box,
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.x2,
          padding: space.x3,
          overflow: 'hidden',
        }}
      >
        <PhotoIcon color={theme.color[tone]} size={theme.type.title.line} />
        <Text variant="meta" tone={tone} style={{ textAlign: 'center' }}>
          {fallback}
        </Text>
        {children}
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={t.openImage(attachment.name)}
      onPress={() => onOpen(attachment)}
      {...longPress}
      style={box}
    >
      <Image
        key={attempt}
        source={source}
        {...(attachment.thumbhash === undefined
          ? {}
          : { placeholder: { thumbhash: attachment.thumbhash } })}
        recyclingKey={attachment.key}
        cachePolicy="memory-disk"
        contentFit="cover"
        transition={onImageReady === undefined ? 150 : 0}
        onDisplay={() => onImageReady?.(attachment.key, true)}
        onError={() => {
          setFailed(true);
          onImageReady?.(attachment.key, false);
        }}
        style={box}
      />
      {children}
    </Pressable>
  );
}

function tileFrame(rect: AlbumRect, width: number, height: number) {
  const half = mediaBubble.gap / 2;
  const left = rect.x * width + (rect.x > 0 ? half : 0);
  const right = (rect.x + rect.width) * width - (rect.x + rect.width < 1 - 1e-6 ? half : 0);
  const top = rect.y * height + (rect.y > 0 ? half : 0);
  const bottom = (rect.y + rect.height) * height - (rect.y + rect.height < 1 - 1e-6 ? half : 0);
  return { left, top, width: right - left, height: bottom - top };
}

export function MessageAlbum({
  images,
  human,
  width,
  onOpenImage,
  onImageReady,
  children,
}: {
  images: readonly MessageAttachment[];
  human: boolean;
  width: number;
  onOpenImage(attachment: MessageAttachment): void;
  onImageReady?: ((key: string, ready: boolean) => void) | undefined;
  children?: ReactNode;
}) {
  const t = useStrings();
  const layout = albumLayout(images.length);
  const height = Math.round(width / layout.aspectRatio);
  return (
    <View
      testID="message-album"
      accessibilityLabel={t.imageCount(images.length)}
      style={{ width, height }}
    >
      {layout.tiles.map((tile) => {
        const attachment = images[tile.index]!;
        const frame = tileFrame(tile.rect, width, height);
        return (
          <View
            key={attachment.key}
            testID="message-album-tile"
            style={{ position: 'absolute', ...frame }}
          >
            <AttachmentImage
              attachment={attachment}
              human={human}
              width={frame.width}
              height={frame.height}
              onOpen={onOpenImage}
              onImageReady={onImageReady}
            >
              {tile.overflow === 0 ? null : (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: mediaBubble.more,
                  }}
                >
                  <Text variant="title" strong style={{ color: mediaBubble.ink }}>
                    {`+${tile.overflow}`}
                  </Text>
                </View>
              )}
            </AttachmentImage>
          </View>
        );
      })}
      {children}
    </View>
  );
}

function AttachmentFile({
  attachment,
  human,
  onShare,
}: {
  attachment: MessageAttachment;
  human: boolean;
  onShare(attachment: MessageAttachment): Promise<void>;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [busy, setBusy] = useState(false);
  const longPress = useMediaLongPress();
  const ink = human ? 'onAccent' : 'fg';
  const unavailable = attachment.source === undefined;
  const type = fileType(attachment.name);
  const kind = type.label === '' ? t.fileKind : type.label;
  const detail = attachment.cleared
    ? t.attachmentCleared(fileSize(attachment.size ?? 0))
    : unavailable
      ? t.attachmentElsewhere
      : busy
        ? t.downloading
        : attachment.size === undefined
          ? kind
          : `${fileSize(attachment.size)} · ${kind}`;
  const tileFill = attachment.cleared
    ? 'transparent'
    : human
      ? theme.color.onAccent
      : fileTile.fill[type.tone];
  const tileInk = human ? theme.color.accent : fileTile.ink;
  return (
    <Pressable
      testID="message-file"
      accessibilityRole="button"
      accessibilityLabel={
        attachment.cleared ? `${attachment.name}, ${detail}` : t.shareFile(attachment.name)
      }
      accessibilityState={{ busy, disabled: unavailable }}
      disabled={busy || unavailable}
      {...longPress}
      onPress={() => {
        setBusy(true);
        void onShare(attachment).finally(() => setBusy(false));
      }}
      style={{
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
      }}
    >
      <View
        testID="message-file-tile"
        style={{
          width: fileTile.size,
          height: fileTile.size,
          borderRadius: fileTile.radius,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tileFill,
          borderWidth: attachment.cleared ? edge.hairline : 0,
          borderStyle: 'dashed',
          borderColor: theme.color.border,
        }}
      >
        {busy ? (
          <LoadingIndicator size="control" color={tileInk} />
        ) : type.label === '' || attachment.cleared ? (
          <FileIcon
            color={attachment.cleared ? theme.color[human ? 'onAccent' : 'muted'] : tileInk}
            size={theme.type.title.line}
          />
        ) : (
          <Text
            variant="meta"
            strong
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: tileInk, paddingHorizontal: space.x1 }}
          >
            {type.label}
          </Text>
        )}
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text tone={ink} strong numberOfLines={1} ellipsizeMode="middle">
          {attachment.name}
        </Text>
        <Text
          variant="meta"
          tone={human ? ink : 'muted'}
          numberOfLines={1}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

export function MessageFiles({
  files,
  human,
  onShare,
}: {
  files: readonly MessageAttachment[];
  human: boolean;
  onShare(attachment: MessageAttachment): Promise<void>;
}) {
  return (
    <View style={{ gap: space.x2 }}>
      {files.map((attachment) => (
        <AttachmentFile
          key={attachment.key}
          attachment={attachment}
          human={human}
          onShare={onShare}
        />
      ))}
    </View>
  );
}

export function QuoteThumbnail({ thumbnail }: { thumbnail: ReplyThumbnail }) {
  return (
    <Image
      testID="reply-quote-thumb"
      source={thumbnail.source}
      {...(thumbnail.thumbhash === undefined
        ? {}
        : { placeholder: { thumbhash: thumbnail.thumbhash } })}
      cachePolicy="memory-disk"
      contentFit="cover"
      accessible={false}
      style={{
        width: replyThumb.size,
        height: replyThumb.size,
        borderRadius: radius.xs,
        marginTop: space.x1,
      }}
    />
  );
}
