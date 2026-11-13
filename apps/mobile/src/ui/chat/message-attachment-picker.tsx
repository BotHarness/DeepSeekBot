import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type { MessageAttachment } from '../../host/conversation';
import { edge, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SheetHeader } from '../primitives/sheet-header';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { useMounted } from '../mounted';
import { FileTypeIcon, fileTypeLabel } from './channel-media';
import { fileSize } from './message-attachments';
import { SheetFrame } from './sheet-frame';

export function MessageAttachmentPicker({
  attachments,
  onClose,
  onShare,
}: {
  attachments: readonly MessageAttachment[];
  onClose(): void;
  onShare(attachment: MessageAttachment): unknown;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const pending = useRef(false);
  const live = useRef(false);
  const mount = useMounted<ScrollView>(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const [busy, setBusy] = useState<string>();
  return (
    <SheetFrame
      visible
      label={t.attachmentDownloads}
      onClose={onClose}
      avoidKeyboard={false}
      animationType="slide"
    >
      <SheetHeader title={t.attachmentDownloads} onClose={onClose} />
      <ScrollView
        ref={mount}
        testID="message-attachment-list"
        accessibilityLabel={t.attachmentDownloads}
        style={{ flexShrink: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.x5 }}
      >
        {attachments.map((attachment, index) => (
          <Pressable
            key={attachment.key}
            accessibilityRole="button"
            accessibilityLabel={t.shareFile(attachment.name)}
            accessibilityState={{ disabled: busy !== undefined, busy: busy === attachment.key }}
            disabled={busy !== undefined}
            android_ripple={{ color: theme.layer.raised.pressed }}
            onPress={() => {
              if (pending.current) return;
              pending.current = true;
              setBusy(attachment.key);
              const close = () => {
                if (live.current) onClose();
              };
              void Promise.resolve()
                .then(() => (live.current ? onShare(attachment) : undefined))
                .then(close, close);
            }}
            style={({ pressed }) => ({
              minHeight: theme.touch,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x4,
              paddingVertical: space.x4,
              borderBottomWidth: edge.hairline,
              borderColor: theme.color.border,
              backgroundColor: pressed ? theme.layer.raised.pressed : undefined,
            })}
          >
            {busy === attachment.key ? (
              <LoadingIndicator size="control" />
            ) : (
              <FileTypeIcon attachment={attachment} />
            )}
            <View style={{ flex: 1, minWidth: 0, gap: space.x2 }}>
              <Text strong>{attachment.name}</Text>
              <Text variant="meta" tone="muted">
                {[
                  `${index + 1} / ${attachments.length}`,
                  fileTypeLabel(attachment) || t.fileKind,
                  attachment.size === undefined ? undefined : fileSize(attachment.size),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SheetFrame>
  );
}
