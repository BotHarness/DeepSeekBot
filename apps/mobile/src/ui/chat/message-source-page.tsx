import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationMessage } from '../../host/conversation';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { useStrings } from '../strings';
import { messageSource } from './message-source';
import { MessageSourceHeader } from './message-source-header';

export function MessageSourcePage({
  message,
  onClose,
  onCopy,
}: {
  message: ConversationMessage;
  onClose(): void;
  onCopy(text: string): void;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const t = useStrings();
  const [ready, setReady] = useState(false);
  const source = messageSource(message);
  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onShow={() => setReady(true)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.base,
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <MessageSourceHeader onClose={onClose} onCopy={() => onCopy(source)} />
        {ready ? (
          <ScrollView
            testID="message-source-scroll"
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: space.x5, paddingBottom: insets.bottom + space.x5 }}
          >
            <Text tone="muted" variant="meta" style={{ marginBottom: space.x5 }}>
              {t.selectCopyHint}
            </Text>
            <Text selectable testID="message-source-text">
              {source}
            </Text>
          </ScrollView>
        ) : (
          <LoadingIndicator size="control" color={theme.color.accent} />
        )}
      </View>
    </Modal>
  );
}
