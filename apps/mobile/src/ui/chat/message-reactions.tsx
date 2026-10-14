import { Pressable, View } from 'react-native';

import { reactedByMe, type ConversationReaction } from '../../host/conversation';
import { edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { t } from '../strings';

export function reactionSummary(
  reaction: ConversationReaction,
  botName: (id: string) => string,
): string {
  const names = reaction.actors.map((actor) =>
    actor.kind === 'human' ? t.reactionYou : botName(actor.id),
  );
  return t.reactionSummary(names.join(t.reactionSeparator), reaction.emoji);
}

export function ReactionChips({
  reactions,
  human,
  botName,
  onToggle,
}: {
  reactions: readonly ConversationReaction[];
  human: boolean;
  botName: (id: string) => string;
  onToggle?: (emoji: string, active: boolean) => void;
}) {
  const theme = useDesignTheme();
  const slop = Math.max(0, (theme.touch - theme.type.meta.line - space.x2 * 2) / 2);
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: space.x2,
        justifyContent: human ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        alignSelf: human ? 'flex-end' : 'flex-start',
      }}
    >
      {reactions.map((reaction) => {
        const mine = reactedByMe(reaction);
        return (
          <Pressable
            key={reaction.emoji}
            accessibilityRole="button"
            accessibilityLabel={reactionSummary(reaction, botName)}
            accessibilityHint={mine ? t.unreact(reaction.emoji) : t.react(reaction.emoji)}
            accessibilityState={{ selected: mine }}
            disabled={onToggle === undefined}
            hitSlop={{ top: slop, bottom: slop }}
            onPress={() => onToggle?.(reaction.emoji, !mine)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x2,
              paddingHorizontal: space.x3,
              paddingVertical: space.x2,
              borderRadius: radius.round,
              borderWidth: edge.hairline,
              borderColor: mine ? theme.color.accent : theme.layer.canvas.edge,
              backgroundColor: mine
                ? theme.layer.canvas.chosen
                : pressed
                  ? theme.layer.raised.pressed
                  : theme.layer.raised.fill,
            })}
          >
            <Text variant="meta">{reaction.emoji}</Text>
            <Text variant="meta" tone={mine ? 'fg' : 'muted'} strong={mine}>
              {String(reaction.actors.length)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
