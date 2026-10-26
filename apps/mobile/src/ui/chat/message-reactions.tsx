import { Pressable, View } from 'react-native';

import { reactedByMe, type ConversationReaction } from '../../host/conversation';
import { edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { useStrings, t } from '../strings';
import { BADGE_HEIGHT } from './bubble-shape';
import { PopIn } from './pop-in';

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
  still,
  human,
  botName,
  onToggle,
}: {
  reactions: readonly ConversationReaction[];
  still?: ReadonlySet<string>;
  human: boolean;
  botName: (id: string) => string;
  onToggle?: (emoji: string, active: boolean) => void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const slop = Math.max(0, (theme.touch - BADGE_HEIGHT) / 2);
  return (
    <View
      style={{
        flexDirection: human ? 'row-reverse' : 'row',
        gap: space.x1,
      }}
    >
      {reactions.map((reaction) => {
        const mine = reactedByMe(reaction);
        return (
          <PopIn key={reaction.emoji} enabled={still?.has(reaction.emoji) !== true}>
            <Pressable
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
                paddingHorizontal: space.x4,
                minHeight: BADGE_HEIGHT,
                borderRadius: radius.round,
                borderWidth: edge.focus,
                borderColor: theme.color.base,
                backgroundColor: mine
                  ? theme.layer.raised.chosen
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
          </PopIn>
        );
      })}
    </View>
  );
}
