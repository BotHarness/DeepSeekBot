import { View } from 'react-native';

import { CountBadge } from '../primitives/count-badge';
import { barLabelProps } from './native-header';

export function SessionCountChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View
      testID="session-count-chip"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexShrink: 0 }}
    >
      <CountBadge
        count={count}
        tone="muted"
        maxFontSizeMultiplier={barLabelProps.maxFontSizeMultiplier}
      />
    </View>
  );
}
