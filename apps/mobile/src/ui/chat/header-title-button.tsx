import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';

export type HeaderTitleControl = Pick<PressableProps, 'testID'> &
  (
    | ({ kind: 'button'; onPress?: (() => void) | undefined } & Pick<
        PressableProps,
        | 'accessibilityLabel'
        | 'accessibilityHint'
        | 'accessibilityState'
        | 'disabled'
        | 'android_ripple'
      >)
    | { kind: 'heading'; accessibilityLabel: string; onPress?: never }
  );

export type HeaderTitleButtonProps = HeaderTitleControl &
  Pick<PressableProps, 'style'> & {
    children: ReactNode;
  };

export function HeaderTitleButton({ kind, ...props }: HeaderTitleButtonProps) {
  if (kind === 'heading')
    return (
      <View
        testID={props.testID}
        accessible
        accessibilityRole="header"
        accessibilityLabel={props.accessibilityLabel}
        style={typeof props.style === 'function' ? props.style({ pressed: false }) : props.style}
      >
        {props.children}
      </View>
    );
  return <Pressable {...props} accessibilityRole="button" />;
}
