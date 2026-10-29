import type { ReactNode } from 'react';
import { Pressable, type PressableProps } from 'react-native';

export type HeaderTitleButtonProps = Pick<
  PressableProps,
  | 'testID'
  | 'accessibilityLabel'
  | 'accessibilityHint'
  | 'accessibilityState'
  | 'disabled'
  | 'style'
  | 'android_ripple'
> & { children: ReactNode; onPress?: (() => void) | undefined; accessibilityRole?: 'button' };

export function HeaderTitleButton(props: HeaderTitleButtonProps) {
  return <Pressable {...props} accessibilityRole="button" />;
}
