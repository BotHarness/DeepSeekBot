import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { chatHeaderSurface } from '../design/tokens';
import { EdgeFade } from './header-chrome';

export function ChatHeaderSurface({ height, solid }: { height: number; solid: number }) {
  const theme = useDesignTheme();
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}
    >
      <EdgeFade
        edge="top"
        height={height}
        cover={solid}
        solid={0}
        color={theme.color.base}
        shape={chatHeaderSurface.fade}
      />
    </View>
  );
}
