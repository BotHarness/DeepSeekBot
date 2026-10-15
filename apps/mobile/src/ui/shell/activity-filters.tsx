import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { INBOX_SECTIONS, type InboxSection } from '../../host/inbox';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';

export type ActivitySection = 'all' | InboxSection;

export type ActivityFilter = { section: ActivitySection; bot: string | undefined };

export const ALL_ACTIVITY: ActivityFilter = { section: 'all', bot: undefined };

const SECTIONS: readonly ActivitySection[] = ['all', ...INBOX_SECTIONS];

export function Chip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const height = theme.type.body.line + space.x3 * 2;
  const slop = Math.max(0, (theme.touch - height) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={count === undefined ? label : t.filterChip(label, count)}
      hitSlop={{ top: slop, bottom: slop }}
      onPress={onPress}
      style={({ pressed }) => ({
        height,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        paddingHorizontal: space.x4,
        borderRadius: radius.round,
        borderWidth: edge.hairline,
        borderColor: selected ? theme.color.accent : theme.layer.canvas.edge,
        backgroundColor: selected
          ? theme.layer.canvas.chosen
          : pressed
            ? theme.layer.canvas.pressed
            : theme.layer.canvas.fill,
      })}
    >
      <Text strong={selected} numberOfLines={1}>
        {label}
      </Text>
      {count === undefined ? null : (
        <Text variant="meta" tone="muted">
          {String(count)}
        </Text>
      )}
    </Pressable>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.x3, paddingHorizontal: space.x5 }}
    >
      {children}
    </ScrollView>
  );
}

export function ActivityFilters({
  counts,
  bots,
  filter,
  onFilter,
}: {
  counts: Record<ActivitySection, number>;
  bots: ReadonlyArray<{ slug: string; name: string }>;
  filter: ActivityFilter;
  onFilter(next: ActivityFilter): void;
}) {
  return (
    <View accessibilityLabel={t.filterActivity} style={{ gap: space.x3, paddingTop: space.x3 }}>
      <ChipRow>
        {SECTIONS.map((section) => (
          <Chip
            key={section}
            label={section === 'all' ? t.filterAll : t.inboxSections[section]}
            count={counts[section]}
            selected={filter.section === section}
            onPress={() => onFilter({ ...filter, section })}
          />
        ))}
      </ChipRow>
      {bots.length < 2 ? null : (
        <ChipRow>
          <Chip
            label={t.filterAllBots}
            selected={filter.bot === undefined}
            onPress={() => onFilter({ ...filter, bot: undefined })}
          />
          {bots.map((bot) => (
            <Chip
              key={bot.slug}
              label={bot.name}
              selected={filter.bot === bot.slug}
              onPress={() =>
                onFilter({ ...filter, bot: filter.bot === bot.slug ? undefined : bot.slug })
              }
            />
          ))}
        </ChipRow>
      )}
    </View>
  );
}
