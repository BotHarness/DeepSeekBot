import type { ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { TextInput } from '../primitives/system-text';
import { Text } from '../primitives/text';
import { ArrowUpIcon, CheckIcon } from '../shell/icons';
import { t } from '../strings';
import { HeaderCircleButton } from './header-chrome';

export function DraftEditor({
  value,
  placeholder,
  canSend,
  onChange,
  onSend,
  onClose,
  above,
  selection,
  onSelection,
}: {
  value: string;
  placeholder: string;
  canSend: boolean;
  onChange(value: string): void;
  onSend(): void;
  onClose(): void;
  above?: ReactNode;
  selection?: { start: number; end: number } | undefined;
  onSelection?: ((caret: number) => void) | undefined;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        behavior="padding"
        style={{ flex: 1, backgroundColor: theme.color.base }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            paddingHorizontal: space.x4,
            paddingTop: insets.top + space.x2,
            paddingBottom: space.x3,
          }}
        >
          <HeaderCircleButton label={t.done} onPress={onClose}>
            <CheckIcon color={theme.color.accent} size={theme.type.title.line} />
          </HeaderCircleButton>
          <Text variant="title" style={{ flex: 1 }}>
            {t.editDraft}
          </Text>
          {canSend ? (
            <HeaderCircleButton label={t.send} onPress={onSend}>
              <ArrowUpIcon color={theme.color.accent} size={theme.type.title.line} />
            </HeaderCircleButton>
          ) : null}
        </View>
        {above}
        <TextInput
          autoFocus
          multiline
          value={value}
          onChangeText={onChange}
          {...(selection === undefined ? {} : { selection })}
          {...(onSelection === undefined
            ? {}
            : {
                onSelectionChange: (event: { nativeEvent: { selection: { end: number } } }) =>
                  onSelection(event.nativeEvent.selection.end),
              })}
          placeholder={placeholder}
          accessibilityLabel={t.editDraft}
          placeholderTextColor={theme.color.subtle}
          style={{
            flex: 1,
            textAlignVertical: 'top',
            paddingHorizontal: space.x5,
            paddingTop: space.x3,
            paddingBottom: Math.max(insets.bottom, space.x3),
            color: theme.color.fg,
            fontSize: theme.type.body.size,
            lineHeight: theme.type.body.line,
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}
