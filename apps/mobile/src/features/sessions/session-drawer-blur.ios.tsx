import { Host, Rectangle } from '@expo/ui/swift-ui';
import { accessibilityHidden, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';

export function SessionDrawerBlur() {
  const theme = useDesignTheme();
  return (
    <Host
      key={theme.scheme}
      style={StyleSheet.absoluteFill}
      colorScheme={theme.scheme}
      ignoreSafeArea="all"
      pointerEvents="none"
    >
      <Rectangle
        modifiers={[foregroundStyle({ type: 'material', material: 'thin' }), accessibilityHidden()]}
      />
    </Host>
  );
}
