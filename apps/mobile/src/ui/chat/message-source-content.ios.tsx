import { useHeaderHeight } from 'expo-router/react-navigation';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { TextInput } from '../primitives/system-text';
import { useStrings } from '../strings';

export function MessageSourceContent({ source }: { source: string }) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const header = useHeaderHeight();
  const t = useStrings();
  return (
    <View style={{ flex: 1, paddingTop: header }}>
      <Text tone="muted" variant="meta" style={{ margin: space.x5 }}>
        {t.selectCopyHint}
      </Text>
      <TextInput
        testID="message-source-text"
        accessibilityLabel={t.selectCopy}
        value={source}
        multiline
        editable={false}
        dataDetectorTypes="none"
        scrollEnabled
        style={{
          flex: 1,
          color: theme.color.fg,
          fontSize: theme.type.body.size,
          lineHeight: theme.type.body.line,
          fontWeight: theme.weight.regular,
          textAlignVertical: 'top',
          paddingHorizontal: space.x5,
          paddingBottom: insets.bottom + space.x5,
        }}
      />
    </View>
  );
}
