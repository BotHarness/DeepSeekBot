import { View } from 'react-native';
import { BotPortrait } from '../../ui/bot-avatar';
import { GroupMark } from '../../ui/chat/group-mark';
import { useDesignTheme } from '../../ui/design/theme';
import { edge, radius, space } from '../../ui/design/tokens';
import { CountBadge } from '../../ui/primitives/count-badge';
import type { PinnedTarget } from './prototype-model';

export function PinnedAvatar({
  target,
  size,
  selected,
  ring = true,
  unread = true,
}: {
  target: PinnedTarget;
  size: number;
  selected: boolean;
  ring?: boolean;
  unread?: boolean;
}) {
  const theme = useDesignTheme();
  const inner = ring ? size - (edge.focus + space.x1) * 2 : size;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius.round,
          borderWidth: ring ? edge.focus : 0,
          borderColor: ring && selected ? theme.color.fg : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {target.kind === 'bot' ? (
          <BotPortrait bot={{ slug: target.slug, displayName: target.name }} size={inner} />
        ) : (
          <GroupMark
            avatar={undefined}
            initial="#"
            size={inner}
            corner={inner / 2}
            fill={theme.layer.raised.chosen}
            variant="meta"
          />
        )}
      </View>
      {unread && target.unread > 0 ? (
        <View style={{ position: 'absolute', top: -space.x2, right: -space.x3 }}>
          <CountBadge count={target.unread} tone="unread" compact />
        </View>
      ) : null}
    </View>
  );
}
