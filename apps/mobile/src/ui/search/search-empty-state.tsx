import { View } from 'react-native';
import { Text } from '../primitives/text';
import { space } from '../design/tokens';
export type SearchEmptyStateProps = { title: string };
export function SearchEmptyState({ title }: SearchEmptyStateProps) {
  return (
    <View
      testID="search-empty-state"
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.x6 }}
    >
      <Text tone="muted" style={{ textAlign: 'center' }}>
        {title}
      </Text>
    </View>
  );
}
