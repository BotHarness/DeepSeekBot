import { useRef, useState } from 'react';
import { Modal, ScrollView, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { ConversationMessage } from '../../host/conversation';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { Button } from '../primitives/button';
import { useStrings } from '../strings';
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
  onClose,
}: {
  messages: readonly ConversationMessage[];
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
  const share = async () => {
    if (pending.current || height === 0 || height > 16000) return;
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
                    ? 'Bot'
                    : message.author === 'human'
                      ? t.activityRow.human
                      : t.feedback.system}{' '}
                  · {new Date(message.at).toLocaleString()}
                </Text>
                <Text>{message.body}</Text>
                {message.attachments.map((attachment) => (
                  <Text key={attachment.key} tone="muted">
                    [{attachment.name}]
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={{ padding: space.x4, gap: space.x2 }}>
          {error ? <Text accessibilityRole="alert">{t.feedback.imageFailed}</Text> : null}
          {height > 16000 ? <Text>{t.feedback.imageTooLarge}</Text> : null}
          <Button
            label={t.shareText}
            testID="selection-image-share"
            disabled={height === 0 || height > 16000}
            busy={busy}
            onPress={() => void share()}
          />
          <Button label={t.close} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
