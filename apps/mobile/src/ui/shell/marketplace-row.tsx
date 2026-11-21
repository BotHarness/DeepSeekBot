import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { MarketplaceEntry } from '../../../../../packages/core/src/marketplace/client';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { MarketplaceArt } from './marketplace-art';
import { useStrings } from '../strings';

export function MarketplaceCard({
  testID,
  label,
  onPress,
  children,
}: {
  testID: string;
  label: string;
  onPress(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
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
      {children}
    </Pressable>
  );
}

export function MarketplaceCardCopy({
  title,
  attribution,
  count,
  children,
}: {
  title: string;
  attribution: string;
  count: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: space.x5, paddingBottom: space.x5, gap: space.x3 }}>
      <Text variant="title" strong>
        {title}
      </Text>
      <Text tone="muted">{attribution}</Text>
      {children}
      <View>
        <Text variant="meta" tone="muted">
          {count}
        </Text>
      </View>
    </View>
  );
}

export function MarketplaceRow({ bot, onPress }: { bot: MarketplaceEntry; onPress(): void }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const title = bot.displayName ?? bot.name;
  return (
    <MarketplaceCard
      testID={`marketplace-bot-${bot.id}`}
      label={`${title}, ${bot.fullName}`}
      onPress={onPress}
    >
      <MarketplaceArt bot={bot} />
      <MarketplaceCardCopy
        title={title}
        attribution={bot.fullName}
        count={t.marketplace.stars(bot.stars)}
      >
        {bot.description ? <Text numberOfLines={3}>{bot.description}</Text> : null}
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
      </MarketplaceCardCopy>
    </MarketplaceCard>
  );
}
