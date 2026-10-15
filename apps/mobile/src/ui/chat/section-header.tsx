import { Pressable, View } from 'react-native';

import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { ChevronDownIcon, ChevronRightIcon } from '../shell/icons';
import { t } from '../strings';
import { NeedsYouBadge } from './conversation-row';

export function SectionHeader({
  name,
  count,
  needsYou,
  collapsed,
  onToggle,
}: {
  name: string;
  count: number;
  needsYou: number;
  collapsed: boolean;
  onToggle(): void;
}) {
  const theme = useDesignTheme();
  const Chevron = collapsed ? ChevronRightIcon : ChevronDownIcon;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityLabel={t.sectionLabel(name, count, needsYou)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        minHeight: theme.touch,
        paddingHorizontal: space.x5,
        paddingTop: space.x3,
        backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.fill,
      })}
    >
      <Chevron color={theme.color.muted} size={theme.type.meta.line} />
      <Text variant="meta" tone="muted" strong numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </Text>
      <Text variant="meta" tone="subtle">
        {count}
      </Text>
      <View style={{ flex: 1 }} />
      {collapsed && needsYou > 0 ? <NeedsYouBadge count={needsYou} /> : null}
    </Pressable>
  );
}
