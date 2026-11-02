import { Pressable, View } from 'react-native';

import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useLiquidGlass } from '../primitives/drawer-material';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ComposerFieldMaterial } from './composer-chrome';
import type { MentionCandidate } from './mention-draft';

const AVATAR = 24;
const RING = 6;

export function MentionSuggestions({
  candidates,
  onChoose,
}: {
  candidates: readonly MentionCandidate[];
  onChoose(candidate: MentionCandidate): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const corner = glass ? radius.xl : radius.lg;
  if (candidates.length === 0) return null;
  return (
    <View
      accessibilityLabel={t.mentionSuggestions}
      style={{
        marginBottom: space.x2,
        paddingVertical: glass ? space.x3 : space.x1,
        borderRadius: corner,
        overflow: 'hidden',
        ...(glass
          ? {}
          : {
              borderWidth: edge.hairline,
              borderColor: theme.layer.sheet.edge,
              backgroundColor: theme.layer.sheet.fill,
            }),
      }}
    >
      {glass ? <ComposerFieldMaterial cornerRadius={corner} /> : null}
      {candidates.map((candidate) => {
        const name = candidate.kind === 'bot' ? candidate.bot.displayName : candidate.label;
        const detail =
          candidate.kind === 'bot'
            ? undefined
            : t.mentionAllHint(candidate.preview.recipients.length);
        return (
          <Pressable
            key={candidate.kind === 'bot' ? candidate.bot.slug : 'all'}
            accessibilityRole="button"
            accessibilityLabel={`@${name}`}
            {...(detail === undefined ? {} : { accessibilityHint: detail })}
            onPress={() => onChoose(candidate)}
            style={({ pressed }) => ({
              minHeight: theme.touch,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x3,
              paddingHorizontal: glass ? space.x5 : space.x4,
              backgroundColor: pressed ? theme.layer.sheet.pressed : undefined,
            })}
          >
            {candidate.kind === 'bot' ? (
              <BotAvatar bot={candidate.bot} size={AVATAR} />
            ) : (
              <View
                style={{
                  width: AVATAR + RING,
                  height: AVATAR + RING,
                  borderRadius: radius.round,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.color.surface,
                }}
              >
                <Text strong tone="muted">
                  @
                </Text>
              </View>
            )}
            <Text strong numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </Text>
            {detail === undefined ? null : (
              <Text variant="meta" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                {detail}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
