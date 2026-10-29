import { Button, Host, RNHostView } from '@expo/ui/swift-ui';
import {
  accessibilityHint,
  accessibilityLabel,
  accessibilityValue,
  buttonStyle,
  disabled,
} from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import type { HeaderTitleButtonProps } from './header-title-button';

export function HeaderTitleButton(props: HeaderTitleButtonProps) {
  const theme = useDesignTheme();
  const t = useStrings();
  return (
    <Host matchContents={{ vertical: true }} style={{ width: '100%' }} colorScheme={theme.scheme}>
      <Button
        {...(props.testID ? { testID: props.testID } : {})}
        {...(props.onPress ? { onPress: props.onPress } : {})}
        modifiers={[
          buttonStyle('plain'),
          disabled(props.disabled === true),
          ...(props.accessibilityLabel ? [accessibilityLabel(props.accessibilityLabel)] : []),
          ...(props.accessibilityHint ? [accessibilityHint(props.accessibilityHint)] : []),
          ...(props.accessibilityState?.busy ? [accessibilityValue(t.loading)] : []),
        ]}
      >
        <RNHostView matchContents={{ vertical: true }} boundedByHost>
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            style={
              typeof props.style === 'function' ? props.style({ pressed: false }) : props.style
            }
          >
            {props.children}
          </View>
        </RNHostView>
      </Button>
    </Host>
  );
}
