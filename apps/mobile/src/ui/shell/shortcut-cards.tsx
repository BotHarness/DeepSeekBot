import { Pressable, ScrollView } from 'react-native';

import type { ConversationFilter } from '../chat/conversations';
import { edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { t } from '../strings';

const CARDS = ['needs-you', 'working'] as const;

export function ShortcutCards({
  counts,
  filter,
  onFilter,
}: {
  counts: Record<(typeof CARDS)[number], number>;
  filter: ConversationFilter;
  onFilter(next: ConversationFilter): void;
}) {
  const theme = useDesignTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: space.x3,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
      }}
    >
      {CARDS.map((card) => {
        const selected = filter === card;
        return (
          <Pressable
            key={card}
            onPress={() => onFilter(selected ? 'all' : card)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${t.shortcut[card]}, ${counts[card]}`}
            style={({ pressed }) => ({
              minWidth: theme.touch * 3,
              minHeight: theme.touch,
              gap: space.x1,
              paddingHorizontal: space.x4,
              paddingVertical: space.x3,
              borderRadius: radius.lg,
              borderWidth: edge.hairline,
              borderColor: selected ? theme.color.accent : theme.color.border,
              backgroundColor: pressed || selected ? theme.color.selected : theme.color.surface,
            })}
          >
            <Text
              variant="title"
              tone={card === 'needs-you' && counts[card] > 0 ? 'warning' : 'fg'}
            >
              {counts[card]}
            </Text>
            <Text variant="meta" tone="muted">
              {t.shortcut[card]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
