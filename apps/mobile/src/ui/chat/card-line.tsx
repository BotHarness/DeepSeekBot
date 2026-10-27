import { View } from 'react-native';

import type { ColorRole } from '../design/theme';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { bubbleRow, bubbleShape, type BubbleGroup } from './bubble-shape';

export type CardLineTone = 'success' | 'danger' | 'subtle';

export function CardLine({
  text,
  tone,
  focused = false,
  group = { first: true, last: true },
}: {
  text: string;
  tone: CardLineTone;
  focused?: boolean;
  group?: BubbleGroup;
}) {
  const theme = useDesignTheme();
  const dot: ColorRole = tone;
  return (
    <View style={bubbleRow(group.first)}>
      <View
        testID="card-line"
        accessibilityLabel={text}
        style={{
          ...bubbleShape(false, group),
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          backgroundColor: theme.color.surface,
          borderWidth: focused ? edge.focus : 0,
          borderColor: theme.color.accent,
        }}
      >
        <View
          style={{
            width: space.x3,
            height: space.x3,
            borderRadius: radius.round,
            backgroundColor: theme.color[dot],
          }}
        />
        <Text tone="muted" style={{ flexShrink: 1 }}>
          {text}
        </Text>
      </View>
    </View>
  );
}
