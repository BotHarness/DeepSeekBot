import { View } from 'react-native';
import { BotAvatar } from '../../ui/bot-avatar';
import type { Conversation } from '../../ui/chat/conversations';
import { GroupMark } from '../../ui/chat/group-mark';
import { useDesignTheme } from '../../ui/design/theme';
import { edge, radius, space } from '../../ui/design/tokens';
import { PinIcon } from '../../ui/shell/icons';
import { humanInitial } from '../../ui/shell/human-avatar-initial';

export function PinnedAvatar({
  conversation,
  size,
  selected,
}: {
  conversation: Conversation | undefined;
  size: number;
  selected: boolean;
}) {
  const theme = useDesignTheme();
  const inner = size - (edge.focus + space.x1) * 2;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: radius.round,
        borderWidth: edge.focus,
        borderColor: selected ? theme.color.fg : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {conversation === undefined ? (
        <PinIcon color={selected ? theme.color.fg : theme.color.muted} size={inner} />
      ) : conversation.kind === 'bot' ? (
        <BotAvatar bot={conversation.bot} size={inner} corner={inner / 2} ring={false} />
      ) : (
        <GroupMark
          avatar={conversation.person === true ? undefined : conversation.channel.avatar}
          initial={
            conversation.person === true ? (humanInitial(conversation.channel.name) ?? '#') : '#'
          }
          size={inner}
          corner={inner / 2}
          fill={theme.color.base}
          variant="meta"
          strong={false}
        />
      )}
    </View>
  );
}
