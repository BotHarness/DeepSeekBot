import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { ChannelFile } from '../../host/channel-files';
import type { MessageAttachment } from '../../host/conversation';
import { useDesignTheme } from '../design/theme';
import { channelMedia, radius, space } from '../design/tokens';
import { ResourceImage as Image } from '../primitives/resource-image';
import { Text } from '../primitives/text';
import { FileIcon, PhotoIcon } from '../shell/icons';
import { useStrings } from '../strings';

export type ChannelFilesSegment = 'media' | 'files';

export function isMedia(file: ChannelFile): boolean {
  return file.attachment.kind === 'image';
}

export function mediaRows(files: readonly ChannelFile[]): ChannelFile[][] {
  const rows: ChannelFile[][] = [];
  for (let i = 0; i < files.length; i += channelMedia.columns)
    rows.push(files.slice(i, i + channelMedia.columns));
  return rows;
}

export function fileTypeLabel({ name, mime }: Pick<MessageAttachment, 'name' | 'mime'>): string {
  const extension = /\.([a-z0-9]{1,4})$/iu.exec(name)?.[1];
  if (extension !== undefined) return extension.toUpperCase();
  const subtype = mime?.split('/')[1]?.split(/[.+;-]/u)[0];
  return subtype !== undefined && /^[a-z0-9]{1,4}$/iu.test(subtype) ? subtype.toUpperCase() : '';
}

export function FileTypeIcon({ attachment }: { attachment: MessageAttachment }) {
  const theme = useDesignTheme();
  const label = fileTypeLabel(attachment);
  const Icon = attachment.kind === 'image' ? PhotoIcon : FileIcon;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: channelMedia.typeTile,
        height: channelMedia.typeTile,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.layer.raised.inset,
      }}
    >
      {label === '' ? (
        <Icon color={theme.color.muted} size={theme.type.title.line} />
      ) : (
        <Text variant="meta" tone="muted" strong numberOfLines={1} adjustsFontSizeToFit>
          {label}
        </Text>
      )}
    </View>
  );
}

export function MediaRow({
  files,
  available,
  onOpen,
  onActions,
}: {
  files: readonly ChannelFile[];
  available: boolean;
  onOpen(file: ChannelFile): void;
  onActions(file: ChannelFile): void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: channelMedia.gap,
        paddingBottom: channelMedia.gap,
      }}
    >
      {Array.from({ length: channelMedia.columns }, (_, index) => {
        const file = files[index];
        return file === undefined ? (
          <View key={`gap-${index}`} style={{ flex: 1 }} />
        ) : (
          <MediaTile
            key={file.key}
            file={file}
            available={available}
            onOpen={onOpen}
            onActions={onActions}
          />
        );
      })}
    </View>
  );
}

function MediaTile({
  file,
  available,
  onOpen,
  onActions,
}: {
  file: ChannelFile;
  available: boolean;
  onOpen(file: ChannelFile): void;
  onActions(file: ChannelFile): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const attachment = file.attachment;
  const source = attachment.source;
  const missing = source === undefined || failed;
  const rowId = file.key.toLowerCase().replace(/[^a-z0-9-]/gu, '-');
  const date = new Date(file.at).toLocaleString();
  return (
    <Pressable
      testID={`channel-media-${rowId}`}
      accessibilityRole="imagebutton"
      accessibilityLabel={
        missing
          ? `${attachment.name}, ${source === undefined ? t.attachmentElsewhere : t.imageUnavailable}`
          : `${t.openImage(attachment.name)}, ${date}`
      }
      accessibilityState={{ disabled: !available || source === undefined }}
      accessibilityActions={
        available
          ? [
              {
                name: 'longpress',
                label: t.conversationActions(attachment.name),
              },
            ]
          : []
      }
      onAccessibilityAction={() => onActions(file)}
      disabled={!available || source === undefined}
      onPress={() => {
        if (!failed) return onOpen(file);
        setFailed(false);
        setAttempt((value) => value + 1);
      }}
      onLongPress={available ? () => onActions(file) : undefined}
      style={({ pressed }) => ({
        flex: 1,
        aspectRatio: 1,
        overflow: 'hidden',
        borderRadius: radius.xs,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.x2,
        backgroundColor: theme.layer.raised.inset,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {missing ? (
        <>
          <PhotoIcon color={theme.color.muted} size={theme.type.title.line} />
          <Text
            variant="meta"
            tone="muted"
            numberOfLines={2}
            style={{ textAlign: 'center', paddingHorizontal: space.x2 }}
          >
            {attachment.cleared
              ? t.channelFiles.cleared
              : source === undefined
                ? t.attachmentElsewhere
                : t.imageUnavailable}
          </Text>
        </>
      ) : (
        <Image
          key={attempt}
          source={source}
          recyclingKey={attachment.key}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={150}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </Pressable>
  );
}
