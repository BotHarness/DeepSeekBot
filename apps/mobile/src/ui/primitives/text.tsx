import { Text as NativeText, type TextProps } from 'react-native';

import type { ColorRole } from '../design/resolve-theme';
import { useDesignTheme } from '../design/theme';

export type TextVariant = 'meta' | 'body' | 'title';

export function Text({
  variant = 'body',
  tone = 'fg',
  strong = variant === 'title',
  style,
  ...props
}: TextProps & { variant?: TextVariant; tone?: ColorRole; strong?: boolean }) {
  const theme = useDesignTheme();
  const role = theme.type[variant];
  return (
    <NativeText
      {...props}
      style={[
        {
          color: theme.color[tone],
          fontSize: role.size,
          lineHeight: role.line,
          fontWeight: strong ? theme.weight.strong : theme.weight.regular,
        },
        style,
      ]}
    />
  );
}
