import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  QUICK_REACTIONS,
  reactable,
  reactedByMe,
  type ConversationMessage,
} from '../../host/conversation';
import { edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { t } from '../strings';

export function MessageActions({
  message,
  onClose,
  onReact,
  onCopy,
}: {
  message: ConversationMessage | undefined;
  onClose(): void;
  onReact(message: ConversationMessage, emoji: string, active: boolean): void;
  onCopy(text: string): void;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const mine = new Set(
    (message?.reactions ?? []).filter(reactedByMe).map((reaction) => reaction.emoji),
  );
  return (
    <Modal
      visible={message !== undefined}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {message === undefined ? null : (
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.cancel}
            onPress={onClose}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
          />
          <View
            accessibilityViewIsModal
            accessibilityLabel={t.messageActions}
            onAccessibilityEscape={onClose}
            style={{
              backgroundColor: theme.layer.sheet.fill,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              borderTopWidth: edge.hairline,
              borderColor: theme.layer.sheet.edge,
              paddingTop: space.x4,
              paddingBottom: Math.max(insets.bottom, space.x4),
              overflow: 'hidden',
            }}
          >
            {reactable(message) ? (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-around',
                  paddingHorizontal: space.x4,
                  paddingBottom: space.x3,
                }}
              >
                {QUICK_REACTIONS.map((emoji) => {
                  const picked = mine.has(emoji);
                  return (
                    <Pressable
                      key={emoji}
                      accessibilityRole="button"
                      accessibilityLabel={picked ? t.unreact(emoji) : t.react(emoji)}
                      accessibilityState={{ selected: picked }}
                      onPress={() => {
                        onReact(message, emoji, !picked);
                        onClose();
                      }}
                      style={({ pressed }) => ({
                        width: theme.touch,
                        height: theme.touch,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: radius.round,
                        backgroundColor: picked
                          ? theme.layer.sheet.chosen
                          : pressed
                            ? theme.layer.sheet.pressed
                            : theme.layer.sheet.fill,
                      })}
                    >
                      <Text variant="title">{emoji}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {message.body.trim() === '' ? null : (
              <SettingsRow
                title={t.copy}
                onPress={() => {
                  onCopy(message.body);
                  onClose();
                }}
              />
            )}
            <SettingsRow title={t.cancel} tone="muted" onPress={onClose} />
          </View>
        </View>
      )}
    </Modal>
  );
}
