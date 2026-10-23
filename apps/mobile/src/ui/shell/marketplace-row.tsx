import { Pressable, View } from 'react-native';
import type { MarketplaceEntry } from '../../../../../packages/core/src/marketplace/client';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { MarketplaceArt } from './marketplace-art';
import { t } from '../strings';

export function MarketplaceRow({ bot, onPress }: { bot: MarketplaceEntry; onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={`marketplace-bot-${bot.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${bot.displayName ?? bot.name}, ${bot.fullName}`}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg) }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        gap: space.x2,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      <MarketplaceArt bot={bot} />
      <View style={{ paddingHorizontal: space.x5, paddingBottom: space.x5, gap: space.x3 }}>
        <Text variant="title" strong>
          {bot.displayName ?? bot.name}
        </Text>
        <Text tone="muted">{bot.fullName}</Text>
        {bot.description ? <Text numberOfLines={3}>{bot.description}</Text> : null}
        {bot.descriptionGenerated ? (
          <Text variant="meta" tone="muted">
            {t.marketplace.generated}
          </Text>
        ) : null}
        {bot.roles.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }}>
            {bot.roles.map((role) => (
              <View
                key={role}
                style={{
                  borderRadius: radius.sm,
                  paddingHorizontal: space.x3,
                  paddingVertical: space.x1,
                  backgroundColor: theme.layer.canvas.chosen,
                }}
              >
                <Text variant="meta">{role}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View>
          <Text variant="meta" tone="muted">
            {t.marketplace.stars(bot.stars)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
