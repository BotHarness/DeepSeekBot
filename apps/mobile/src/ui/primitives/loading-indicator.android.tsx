import { Host, LoadingIndicator as ComposeLoadingIndicator } from '@expo/ui/jetpack-compose';
import { View, type ColorValue } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { loadingIndicator } from '../design/tokens';
import { t } from '../strings';

export function LoadingIndicator({
  color,
  accessibilityLabel,
}: {
  color?: ColorValue;
  accessibilityLabel?: string;
}) {
  const theme = useDesignTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? t.loading}
      style={{ width: loadingIndicator.size, height: loadingIndicator.size }}
    >
      <View importantForAccessibility="no-hide-descendants" pointerEvents="none">
        <Host
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
          style={{ width: loadingIndicator.size, height: loadingIndicator.size }}
        >
          <ComposeLoadingIndicator color={color ?? theme.color.accent} />
        </Host>
      </View>
    </View>
  );
}
