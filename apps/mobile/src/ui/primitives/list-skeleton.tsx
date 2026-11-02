import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useStrings } from '../strings';

export function ListSkeleton({ layout = 'list' }: { layout?: 'list' | 'messages' }) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t.contextLoading}
      testID={layout === 'messages' ? 'message-skeleton' : 'list-skeleton'}
      style={{ gap: space.x6, padding: space.x5 }}
    >
      {layout === 'messages'
        ? [0, 1, 2].map((key) => (
            <View
              key={key}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                alignSelf: key === 1 ? 'flex-end' : 'flex-start',
                width: key === 1 ? '55%' : '75%',
                height: theme.type.body.line * (key === 1 ? 2 : 3),
                borderRadius: radius.lg,
                backgroundColor: theme.layer.canvas.inset,
              }}
            />
          ))
        : [0, 1, 2].map((key) => (
            <View
              key={key}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{ flexDirection: 'row', gap: space.x3 }}
            >
              <View
                style={{
                  width: theme.touch,
                  height: theme.touch,
                  borderRadius: radius.round,
                  backgroundColor: theme.layer.canvas.inset,
                }}
              />
              <View style={{ flex: 1, gap: space.x3 }}>
                <View
                  style={{
                    width: '60%',
                    height: theme.type.body.line,
                    borderRadius: radius.sm,
                    backgroundColor: theme.layer.canvas.inset,
                  }}
                />
                <View
                  style={{
                    height: theme.type.meta.line,
                    borderRadius: radius.sm,
                    backgroundColor: theme.layer.canvas.inset,
                  }}
                />
              </View>
            </View>
          ))}
    </View>
  );
}
