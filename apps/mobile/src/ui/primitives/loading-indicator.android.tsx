import {
  CircularProgressIndicator,
  Host,
  LoadingIndicator as ComposeLoadingIndicator,
} from '@expo/ui/jetpack-compose';
import { fillMaxSize } from '@expo/ui/jetpack-compose/modifiers';
import { View, type ColorValue } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { loadingIndicator } from '../design/tokens';
import { useStrings } from '../strings';
import type { LoadingIndicatorSize } from './loading-indicator';

export function LoadingIndicator({
  color,
  accessibilityLabel,
  size = 'page',
}: {
  color?: ColorValue;
  accessibilityLabel?: string;
  size?: LoadingIndicatorSize;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const box = size === 'page' ? loadingIndicator.size : loadingIndicator.control;
  const tint = color ?? theme.color.accent;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? t.loading}
      style={{ width: box, height: box, alignSelf: 'center' }}
    >
      <View importantForAccessibility="no-hide-descendants" pointerEvents="none">
        <Host
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
          style={{ width: box, height: box }}
        >
          {size === 'page' ? (
            <ComposeLoadingIndicator color={tint} />
          ) : (
            <CircularProgressIndicator
              color={tint}
              strokeWidth={loadingIndicator.controlStroke}
              strokeCap="round"
              modifiers={[fillMaxSize()]}
            />
          )}
        </Host>
      </View>
    </View>
  );
}
