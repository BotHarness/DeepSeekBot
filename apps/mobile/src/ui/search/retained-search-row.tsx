import { Pressable } from 'react-native';
import type { SearchHit } from '../../host/retained-search';
import { shortTime } from '../chat/conversations';
import { useStrings } from '../strings';
import { Text } from '../primitives/text';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';

export function RetainedSearchRow({ hit, onPress }: { hit: SearchHit; onPress(): void }) {
  const theme = useDesignTheme();
  const t = useStrings();
  return (
    <Pressable
      testID={`search-result-${hit.key}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        paddingHorizontal: space.x5,
        paddingVertical: space.x4,
        gap: space.x2,
        backgroundColor: pressed ? theme.layer.raised.chosen : 'transparent',
      })}
    >
      <Text strong>{hit.target.name}</Text>
      {hit.message && <Text numberOfLines={3}>{hit.message.body}</Text>}
      <Text variant="meta" tone="muted">
        {hit.source.name}
        {hit.message
          ? ` · ${hit.message.author === 'human' ? t.reactionYou : hit.message.author} · ${shortTime(hit.message.at, new Date())}`
          : ''}
      </Text>
    </Pressable>
  );
}
