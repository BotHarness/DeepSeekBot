import type { Rect } from './menu-placement';
import type { BubbleGroup } from './bubble-shape';
import { useRef, useState, type ReactNode } from 'react';
import { Modal, ScrollView, Pressable, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { ConversationMessage } from '../../host/conversation';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { Button } from '../primitives/button';
import { useStrings } from '../strings';
import { BubbleBody } from './message-bubble';
import { SELECTION_LIMIT } from './message-selection';

export function SelectionBar({
  count,
  onCopy,
  onScreenshot,
  onCancel,
}: {
  count: number;
  onCopy(): void;
  onScreenshot(): void;
  onCancel(): void;
}) {
  const t = useStrings();
  return (
    <View style={{ padding: space.x3, gap: space.x2 }}>
      <Text variant="meta">
        {count} / {SELECTION_LIMIT}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }}>
        <Button label={t.copy} testID="selection-copy" disabled={count === 0} onPress={onCopy} />
        <Button
          label={t.feedback.screenshot}
          testID="selection-screenshot"
          disabled={count === 0}
          onPress={onScreenshot}
        />
        <Button label={t.cancel} testID="selection-cancel" onPress={onCancel} />
      </View>
    </View>
  );
}
export function SelectionScreenshot({
  messages,
  botName,
  renderCard,
  onClose,
}: {
  messages: readonly ConversationMessage[];
  botName(id: string): string;
  renderCard(message: ConversationMessage): ReactNode;
  onClose(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const view = useRef<ViewInstance>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [height, setHeight] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [images, setImages] = useState<Record<string, boolean>>({});
  const imagesReady = messages.every((message) =>
    message.attachments.every(
      (attachment) =>
        attachment.kind !== 'image' ||
        attachment.source === undefined ||
        images[message.id + attachment.key] === true,
    ),
  );
  const share = async () => {
    if (!imagesReady || pending.current || height === 0 || height > 16000) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    let uri: string | undefined;
    try {
      uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) throw new Error('sharing-unavailable');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
    } catch {
      setError(true);
    } finally {
      if (uri) releaseCapture(uri);
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: theme.color.base,
        }}
      >
        <ScrollView contentContainerStyle={{ padding: space.x4 }}>
          <View
            ref={view}
            collapsable={false}
            testID="selection-image-preview"
            onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
            style={{ padding: space.x5, gap: space.x4, backgroundColor: theme.color.base }}
          >
            {messages.map((message) => (
              <View key={message.id} style={{ gap: space.x2 }}>
                <Text variant="meta" tone="muted">
                  {message.author === 'bot'
                    ? message.bot
                      ? botName(message.bot)
                      : 'Bot'
                    : message.author === 'human'
                      ? t.activityRow.human
                      : t.feedback.system}{' '}
                  · {new Date(message.at).toLocaleString()}
                </Text>
                <View pointerEvents="none" key={attempt}>
                  {message.card ? (
                    renderCard(message)
                  ) : (
                    <BubbleBody
                      message={message}
                      group={{ first: true, last: true }}
                      onImageReady={(key, ready) => {
                        setImages((previous) =>
                          previous[message.id + key] === ready
                            ? previous
                            : { ...previous, [message.id + key]: ready },
                        );
                        if (!ready) setError(true);
                      }}
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={{ padding: space.x4, gap: space.x2 }}>
          {error ? (
            <View>
              <Text accessibilityRole="alert">{t.feedback.imageFailed}</Text>
              <Button
                label={t.retry}
                onPress={() => {
                  setError(false);
                  setImages({});
                  setAttempt((value) => value + 1);
                }}
              />
            </View>
          ) : null}
          {height > 16000 ? <Text>{t.feedback.imageTooLarge}</Text> : null}
          <Button
            label={t.shareText}
            testID="selection-image-share"
            disabled={!imagesReady || height === 0 || height > 16000}
            busy={busy}
            onPress={() => void share()}
          />
          <Button label={t.close} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export function MessageSelectionRow({
  message,
  selected,
  onToggle,
  onOpen,
  children,
}: {
  message: ConversationMessage;
  selected: boolean | undefined;
  onToggle(): void;
  onOpen?: ((message: ConversationMessage, anchor: Rect, group: BubbleGroup) => void) | undefined;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  const ref = useRef<ViewInstance>(null);
  const selecting = selected !== undefined;
  return (
    <Pressable
      ref={ref}
      accessible={selecting}
      {...(selecting
        ? {
            accessibilityRole: 'checkbox' as const,
            accessibilityState: { checked: selected },
            accessibilityLabel: t.feedback.select + ': ' + message.body,
            onPress: onToggle,
          }
        : {})}
      disabled={message.delivery !== 'committed'}
      onLongPress={
        onOpen === undefined || selecting
          ? undefined
          : () => {
              ref.current?.measureInWindow((x, y, width, height) =>
                onOpen(message, { x, y, width, height }, { first: true, last: true }),
              );
            }
      }
      testID={'select-message-' + message.id}
      style={{ backgroundColor: selected ? theme.layer.raised.chosen : undefined }}
    >
      <View pointerEvents={selecting ? 'none' : 'auto'}>{children}</View>
    </Pressable>
  );
}
