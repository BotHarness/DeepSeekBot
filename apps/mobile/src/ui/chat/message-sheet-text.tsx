import { ScrollView, useWindowDimensions } from 'react-native';

import { messageSheet, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';

export function MessageSheetText({ body }: { body: string }) {
  const theme = useDesignTheme();
  const { height } = useWindowDimensions();
  return (
    <ScrollView
      nestedScrollEnabled
      style={{
        maxHeight: height * messageSheet.textHeightRatio,
        borderRadius: radius.lg,
        backgroundColor: theme.layer.raised.fill,
      }}
      contentContainerStyle={{ padding: space.x4 }}
    >
      <Text selectable>{body}</Text>
    </ScrollView>
  );
}
