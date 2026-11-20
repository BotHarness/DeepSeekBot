import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import type { HeaderModel } from './composer-labels';
import { ModelTargetIcon } from './model-target-icon';
import { barLabelProps, headerContentScale } from './native-header';

export function HeaderSessionModel({ model }: { model: HeaderModel }) {
  const theme = useDesignTheme();
  const iconSize = Math.round(theme.type.meta.size * headerContentScale(theme));
  return (
    <View
      testID="chat-header-model"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        flexShrink: 1,
        minWidth: 0,
      }}
    >
      <ModelTargetIcon target={model} size={iconSize} color={theme.color.muted} />
      <Text
        {...barLabelProps}
        variant="meta"
        tone="muted"
        numberOfLines={1}
        style={{ flexShrink: 1 }}
      >
        {model.short}
      </Text>
    </View>
  );
}
