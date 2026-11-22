import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';

export type HeaderTitleButtonProps = Pick<
  PressableProps,
  | 'testID'
  | 'accessibilityLabel'
  | 'accessibilityHint'
  | 'accessibilityState'
  | 'disabled'
  | 'style'
  | 'android_ripple'
> & {
  children: ReactNode;
  onPress?: (() => void) | undefined;
  accessibilityRole?: 'button';
  staticLabel?: boolean;
};

export function HeaderTitleButton({ staticLabel, ...props }: HeaderTitleButtonProps) {
  if (staticLabel)
    return (
      <View
        testID={props.testID}
        style={typeof props.style === 'function' ? props.style({ pressed: false }) : props.style}
      >
        {props.children}
      </View>
    );
  return <Pressable {...props} accessibilityRole="button" />;
}
