import { Pressable, ScrollView, View } from 'react-native';

import type { ConversationFilter } from '../chat/conversations';
import { edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { NeedsYouIcon, WorkingIcon } from './icons';

const CARDS = ['needs-you', 'working'] as const;

const ICON = { 'needs-you': NeedsYouIcon, working: WorkingIcon } as const;

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
        paddingVertical: space.x5,
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
            accessibilityLabel={`${t.shortcut[card]}, ${t.shortcutDetail[card](counts[card])}`}
            style={({ pressed }) => ({
              width: theme.touch * 3,
              gap: space.x3,
              padding: space.x5,
              borderRadius: radius.lg,
              borderWidth: edge.hairline,
              borderColor: selected ? theme.color.accent : theme.color.borderStrong,
              backgroundColor: selected
                ? theme.layer.raised.chosen
                : pressed
                  ? theme.layer.raised.pressed
                  : theme.layer.raised.fill,
            })}
          >
            <Icon
              card={card}
              color={
                card === 'needs-you' && counts[card] > 0 ? theme.color.warning : theme.color.fg
              }
              size={theme.type.title.line}
            />
            <View style={{ gap: space.x1 }}>
              <Text strong numberOfLines={1}>
                {t.shortcut[card]}
              </Text>
              <Text variant="meta" tone="muted" numberOfLines={1}>
                {t.shortcutDetail[card](counts[card])}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Icon({
  card,
  color,
  size,
}: {
  card: (typeof CARDS)[number];
  color: string;
  size: number;
}) {
  const Glyph = ICON[card];
  return <Glyph color={color} size={size} />;
}
