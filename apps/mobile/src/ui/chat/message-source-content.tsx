import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export function MessageSourceContent({ source }: { source: string }) {
  const insets = useSafeAreaInsets();
  const t = useStrings();
  return (
    <ScrollView
      testID="message-source-scroll"
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: space.x5, paddingBottom: insets.bottom + space.x5 }}
    >
      <Text tone="muted" variant="meta" style={{ marginBottom: space.x5 }}>
        {t.selectCopyHint}
      </Text>
      <Text selectable testID="message-source-text">
        {source}
      </Text>
    </ScrollView>
  );
}
