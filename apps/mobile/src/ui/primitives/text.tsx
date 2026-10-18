import type { RefAttributes } from 'react';
import { type TextInstance, type TextProps } from 'react-native';
import { Text as NativeText } from './system-text';

import { variantRamp } from '../design/system-type';
import type { ColorRole } from '../design/resolve-theme';
import { useDesignTheme } from '../design/theme';

export type TextVariant = 'meta' | 'body' | 'title' | 'display';

export function InlineText(props: TextProps & RefAttributes<TextInstance>) {
  return <NativeText {...props} />;
}

export function Text({
  variant = 'body',
  tone = 'fg',
  strong = variant === 'title' || variant === 'display',
  style,
  ...props
}: TextProps & { variant?: TextVariant; tone?: ColorRole; strong?: boolean }) {
  const theme = useDesignTheme();
  const role = theme.type[variant];
  return (
    <NativeText
      dynamicTypeRamp={variantRamp[variant]}
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
