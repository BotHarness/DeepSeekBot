import { useState } from 'react';
import { Modal, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationMessage } from '../../host/conversation';
import { useDesignTheme } from '../design/theme';
import { NativePageNavigation } from '../primitives/native-page-navigation';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { messageSource } from './message-source';
import { MessageSourceHeader } from './message-source-header';
import { MessageSourceContent } from './message-source-content';

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
      <NativePageNavigation>
        <View
          style={{
            flex: 1,
            backgroundColor: theme.color.base,
            paddingTop: Platform.OS === 'ios' ? 0 : insets.top,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }}
        >
          {Platform.OS === 'ios' ? null : (
            <MessageSourceHeader onClose={onClose} onCopy={() => onCopy(source)} />
          )}
          {ready ? <MessageSourceContent source={source} /> : <LoadingIndicator />}
        </View>
        {Platform.OS === 'ios' ? (
          <MessageSourceHeader onClose={onClose} onCopy={() => onCopy(source)} />
        ) : null}
      </NativePageNavigation>
    </Modal>
  );
}
