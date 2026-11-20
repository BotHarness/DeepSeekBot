import { Host } from '@expo/ui';
import { Button, RNHostView } from '@expo/ui/swift-ui';
import {
  accessibilityHint,
  accessibilityLabel,
  accessibilityValue,
  buttonStyle,
  disabled,
  glassEffect,
} from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import type { HeaderTitleButtonProps } from './header-title-button';
import { glassHeader } from './header-kind';

export function HeaderTitleButton(props: HeaderTitleButtonProps) {
  const theme = useDesignTheme();
  const t = useStrings();
  const style = typeof props.style === 'function' ? props.style({ pressed: false }) : props.style;
  const height = StyleSheet.flatten(style)?.minHeight;
  return (
    <Host style={{ width: '100%', height }} colorScheme={theme.scheme}>
      <Button
        {...(props.testID ? { testID: props.testID } : {})}
        {...(props.onPress ? { onPress: props.onPress } : {})}
        modifiers={[
          buttonStyle('plain'),
          ...(glassHeader
            ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' })]
            : []),
          disabled(props.disabled === true),
          ...(props.accessibilityLabel ? [accessibilityLabel(props.accessibilityLabel)] : []),
          ...(props.accessibilityHint ? [accessibilityHint(props.accessibilityHint)] : []),
          ...(props.accessibilityState?.busy ? [accessibilityValue(t.loading)] : []),
        ]}
      >
        <RNHostView matchContents={{ vertical: true }} boundedByHost>
          <View pointerEvents="none" accessibilityElementsHidden style={style}>
            {props.children}
          </View>
        </RNHostView>
      </Button>
    </Host>
  );
}
