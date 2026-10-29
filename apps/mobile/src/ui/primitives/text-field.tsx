import type { ComponentPropsWithRef } from 'react';
import { Platform, View } from 'react-native';

import { useDesignTheme, type DesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { TextInput } from './system-text';
import { Text } from './text';

export type TextFieldProps = ComponentPropsWithRef<typeof TextInput> & {
  invalid?: boolean;
  label?: string;
  supportingText?: string;
};

export function fieldStyle(theme: DesignTheme, { multiline = false, invalid = false } = {}) {
  const lines = multiline ? 2 : 1;
  const minHeight = Math.max(
    theme.touch * lines,
    Platform.OS === 'ios'
      ? theme.type.body.line * theme.fontScale * lines + space.x3 * 2 + edge.hairline * 2
      : 0,
  );
  return {
    minHeight,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderRadius: radius.md,
    borderWidth: edge.hairline,
    borderColor: invalid ? theme.color.danger : theme.layer.field.edge,
    backgroundColor: theme.layer.field.fill,
    color: theme.color.fg,
    fontSize: theme.type.body.size,
    textAlignVertical: multiline ? ('top' as const) : ('center' as const),
  };
}

export function TextField({
  style,
  invalid = false,
  multiline,
  editable,
  label: _label,
  supportingText,
  ...props
}: TextFieldProps) {
  const theme = useDesignTheme();
  const input = (
    <TextInput
      placeholderTextColor={theme.color.subtle}
      clearButtonMode={multiline || editable === false ? 'never' : 'while-editing'}
      {...props}
      multiline={multiline}
      editable={editable}
      style={[fieldStyle(theme, { multiline: multiline === true, invalid }), style]}
    />
  );
  if (!supportingText) return input;
  return (
    <View style={{ gap: space.x1 }}>
      {input}
      <Text variant="meta" tone={invalid ? 'danger' : 'muted'}>
        {supportingText}
      </Text>
    </View>
  );
}
