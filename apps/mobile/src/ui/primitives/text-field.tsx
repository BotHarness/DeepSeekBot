import type { ComponentPropsWithRef } from 'react';

import { useDesignTheme, type DesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { TextInput } from './system-text';

type FieldProps = ComponentPropsWithRef<typeof TextInput> & {
  invalid?: boolean;
};

export function fieldStyle(theme: DesignTheme, { multiline = false, invalid = false } = {}) {
  return {
    minHeight: multiline ? theme.touch * 2 : theme.touch,
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

export function TextField({ style, invalid = false, multiline, editable, ...props }: FieldProps) {
  const theme = useDesignTheme();
  return (
    <TextInput
      placeholderTextColor={theme.color.subtle}
      clearButtonMode={multiline || editable === false ? 'never' : 'while-editing'}
      {...props}
      multiline={multiline}
      editable={editable}
      style={[fieldStyle(theme, { multiline: multiline === true, invalid }), style]}
    />
  );
}
