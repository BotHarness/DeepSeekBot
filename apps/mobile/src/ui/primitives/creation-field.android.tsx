import { Host, Text, TextField, useNativeState } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useContext, useLayoutEffect, useRef, type ComponentProps } from 'react';
import { View, type ViewInstance } from 'react-native';
import { useDesignTheme } from '../design/theme';
import type { CreationField as SharedCreationField } from './creation-field';
import { KeyboardFormNativeFocus } from './keyboard-form-context';

export function CreationField({
  value = '',
  onChangeText,
  accessibilityLabel,
  placeholder,
  multiline,
  editable,
  autoCapitalize,
  autoCorrect,
  keyboardType,
  maxLength,
  testID: id,
  invalid,
  onSubmitValue,
}: ComponentProps<typeof SharedCreationField>) {
  const theme = useDesignTheme();
  const focus = useContext(KeyboardFormNativeFocus);
  const wrapper = useRef<ViewInstance | null>(null);
  const focused = useRef(false);
  const text = useNativeState(value);
  const pendingEchoes = useRef<string[]>([]);
  useLayoutEffect(() => {
    const echoed = pendingEchoes.current.indexOf(value);
    if (echoed >= 0) pendingEchoes.current.splice(0, echoed + 1);
    else if (text.get() !== value) text.set(value);
  }, [text, value]);
  return (
    <View
      ref={wrapper}
      onLayout={() => {
        if (wrapper.current && focused.current) focus?.(wrapper.current, true);
      }}
    >
      <Host
        matchContents={{ vertical: true }}
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        ignoreSafeAreaKeyboardInsets
      >
        <TextField
          onFocusChanged={(next) => {
            focused.current = next;
            if (wrapper.current) focus?.(wrapper.current, next);
          }}
          value={text}
          onValueChange={(next) => {
            if (onSubmitValue && /[\r\n]/u.test(next)) {
              pendingEchoes.current.push('');
              text.set('');
              onSubmitValue(next);
              return;
            }
            pendingEchoes.current.push(next);
            onChangeText?.(next);
          }}
          enabled={editable !== false}
          singleLine={!multiline && !onSubmitValue}
          minLines={multiline ? 3 : 1}
          {...(onSubmitValue ? { maxLines: 1 } : {})}
          {...(maxLength === undefined ? {} : { maxLength })}
          isError={invalid ?? false}
          keyboardOptions={{
            capitalization: autoCapitalize ?? 'sentences',
            autoCorrectEnabled: autoCorrect ?? true,
            keyboardType: keyboardType === 'url' ? 'uri' : 'text',
            ...(onSubmitValue ? { imeAction: 'none' as const } : {}),
          }}
          colors={{
            focusedContainerColor: theme.layer.field.fill,
            unfocusedContainerColor: theme.layer.field.fill,
            disabledContainerColor: theme.layer.field.fill,
            focusedTextColor: theme.color.fg,
            unfocusedTextColor: theme.color.fg,
            focusedLabelColor: theme.color.accent,
            unfocusedLabelColor: theme.color.muted,
            focusedIndicatorColor: theme.color.accent,
            unfocusedIndicatorColor: theme.color.borderField,
          }}
          modifiers={[
            fillMaxWidth(),
            ...(id ? [testID(id)] : []),
            ...(accessibilityLabel ? [semantics({ contentDescription: accessibilityLabel })] : []),
          ]}
        >
          {accessibilityLabel ? (
            <TextField.Label>
              <Text>{accessibilityLabel}</Text>
            </TextField.Label>
          ) : null}
          {placeholder ? (
            <TextField.Placeholder>
              <Text>{placeholder}</Text>
            </TextField.Placeholder>
          ) : null}
        </TextField>
      </Host>
    </View>
  );
}
