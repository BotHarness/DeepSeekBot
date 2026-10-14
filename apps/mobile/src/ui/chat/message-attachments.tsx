import { useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, View } from 'react-native';

import type { MessageAttachment } from '../../host/conversation';
import { over } from '../design/layers';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { FileIcon, PhotoIcon } from '../shell/icons';
import { t } from '../strings';

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentImage({
  attachment,
  human,
  width,
  height,
  onOpen,
}: {
  attachment: MessageAttachment;
  human: boolean;
  width: number;
  height: number;
  onOpen(attachment: MessageAttachment): void;
}) {
  const theme = useDesignTheme();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const source = attachment.source;
  const tone = human ? 'onAccent' : 'muted';
  const fill = human ? over(theme.color.selected, theme.color.accent) : theme.layer.raised.inset;
  const box = { width, height, borderRadius: radius.md, backgroundColor: fill };
  if (source === undefined || failed)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${attachment.name}, ${t.imageUnavailable}`}
        disabled={source === undefined}
        onPress={() => {
          setFailed(false);
          setAttempt((value) => value + 1);
        }}
        style={{ ...box, alignItems: 'center', justifyContent: 'center', gap: space.x2 }}
      >
        <PhotoIcon color={theme.color[tone]} size={theme.type.title.line} />
        <Text variant="meta" tone={tone} numberOfLines={2} style={{ textAlign: 'center' }}>
          {source === undefined ? t.attachmentElsewhere : t.imageUnavailable}
        </Text>
      </Pressable>
    );
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={t.openImage(attachment.name)}
      onPress={() => onOpen(attachment)}
    >
      <Image
        key={attempt}
        source={source}
        recyclingKey={attachment.key}
        cachePolicy="memory-disk"
        contentFit="cover"
        transition={150}
        onError={() => setFailed(true)}
        style={box}
      />
    </Pressable>
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
  const theme = useDesignTheme();
  const [busy, setBusy] = useState(false);
  const ink = human ? 'onAccent' : 'fg';
  const fill = human ? over(theme.color.selected, theme.color.accent) : theme.layer.raised.inset;
  const unavailable = attachment.source === undefined;
  const detail = unavailable
    ? t.attachmentElsewhere
    : busy
      ? t.downloading
      : attachment.size === undefined
        ? t.fileKind
        : fileSize(attachment.size);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.shareFile(attachment.name)}
      accessibilityState={{ busy, disabled: unavailable }}
      disabled={busy || unavailable}
      onPress={() => {
        setBusy(true);
        void onShare(attachment).finally(() => setBusy(false));
      }}
      style={{
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingHorizontal: space.x3,
        paddingVertical: space.x2,
        borderRadius: radius.md,
        backgroundColor: fill,
      }}
    >
      {busy ? (
        <ActivityIndicator color={theme.color[ink]} />
      ) : (
        <FileIcon color={theme.color[ink]} size={theme.type.title.line} />
      )}
      <View style={{ flexShrink: 1 }}>
        <Text tone={ink} numberOfLines={1} ellipsizeMode="middle">
          {attachment.name}
        </Text>
        <Text variant="meta" tone={human ? ink : 'muted'}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

export function MessageAttachments({
  attachments,
  human,
  onOpenImage,
  onShare,
}: {
  attachments: MessageAttachment[];
  human: boolean;
  onOpenImage(attachment: MessageAttachment): void;
  onShare(attachment: MessageAttachment): Promise<void>;
}) {
  const theme = useDesignTheme();
  const images = attachments.filter((attachment) => attachment.kind === 'image');
  const files = attachments.filter((attachment) => attachment.kind !== 'image');
  const single = images.length === 1;
  return (
    <View style={{ gap: space.x2 }}>
      {images.length === 0 ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }}>
          {images.map((attachment) => (
            <AttachmentImage
              key={attachment.key}
              attachment={attachment}
              human={human}
              width={single ? theme.touch * 5 : theme.touch * 3}
              height={single ? theme.touch * 4 : theme.touch * 3}
              onOpen={onOpenImage}
            />
          ))}
        </View>
      )}
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
