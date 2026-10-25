import { Pressable, View } from 'react-native';

import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { ChevronDownIcon, ChevronRightIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { CountBadge } from '../primitives/count-badge';
import { countBadge } from './conversations';

export function SectionHeader({
  name,
  count,
  needsYou,
  unread,
  collapsed,
  onToggle,
  testID = 'section-header',
  onLongPress,
  onMenu,
}: {
  name: string;
  count: number;
  needsYou: number;
  unread: number;
  collapsed: boolean;
  onToggle(): void;
  testID?: string;
  onLongPress?: (() => void) | undefined;
  onMenu?: (() => void) | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const Chevron = collapsed ? ChevronRightIcon : ChevronDownIcon;
  const badge = collapsed ? countBadge({ needsYou, unread, muted: false }) : undefined;
  return (
    <Pressable
      testID={testID}
      onPress={onToggle}
      onLongPress={onLongPress}
      accessibilityActions={onMenu ? [{ name: 'actions', label: t.deletion.actions(name) }] : []}
      onAccessibilityAction={() => onMenu?.()}
      android_ripple={{ color: theme.layer.canvas.pressed }}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityLabel={t.sectionLabel(name, count, needsYou, unread)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        minHeight: theme.touch,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.fill,
      })}
    >
      <Chevron color={theme.color.muted} size={theme.type.meta.line} />
      <Text variant="meta" tone="muted" strong style={{ flexShrink: 1 }}>
        {name}
      </Text>
      <Text variant="meta" tone="subtle">
        {count}
      </Text>
      <View style={{ flex: 1 }} />
      {!collapsed && needsYou > 0 ? (
        <Text variant="meta" tone="warning" style={{ flexShrink: 1 }}>
          {t.sectionNeedsYou(needsYou)}
        </Text>
      ) : null}
      {badge === undefined ? null : <CountBadge count={badge.count} tone={badge.tone} />}
    </Pressable>
  );
}
