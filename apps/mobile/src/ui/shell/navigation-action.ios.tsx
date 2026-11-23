import { Button, Host, Image } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import {
  NavigationActionPressable,
  type NavigationActionProps,
} from './navigation-action-pressable';

export function NavigationAction(props: NavigationActionProps) {
  return props.close ? (
    <NavigationCloseAction {...props} />
  ) : (
    <NavigationActionPressable {...props} />
  );
}

function NavigationCloseAction({ size, label, onPress }: NavigationActionProps) {
  const theme = useDesignTheme();
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26;
  return (
    <Host key={theme.scheme} style={{ width: size, height: size }} colorScheme={theme.scheme}>
      <Button
        onPress={onPress}
        modifiers={[
          buttonStyle(glass ? 'glass' : 'bordered'),
          buttonBorderShape('circle'),
          accessibilityLabel(label),
          foregroundStyle(theme.color.fg),
        ]}
      >
        <Image
          systemName="xmark"
          modifiers={[
            font({ textStyle: 'title2' }),
            frame({ width: size - space.x5, height: size - space.x5 }),
          ]}
        />
      </Button>
    </Host>
  );
}
