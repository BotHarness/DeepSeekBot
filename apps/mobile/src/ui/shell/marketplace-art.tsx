import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';
import type { MarketplaceEntry } from '../../../../../packages/core/src/marketplace/client';
import { marketplaceAvatar, marketplaceBanner } from '../../marketplace/artwork';
import { useDesignTheme } from '../design/theme';
import { marketplaceArt, radius, space } from '../design/tokens';

export function MarketplaceArt({
  bot,
  profile = false,
}: {
  bot: MarketplaceEntry;
  profile?: boolean;
}) {
  const theme = useDesignTheme();
  const [failed, setFailed] = useState<string>();
  const requested = marketplaceBanner(bot);
  const source = failed === requested ? marketplaceBanner(bot, true) : requested;
  const size = profile ? marketplaceArt.profileAvatar : marketplaceArt.cardAvatar;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image
        testID="marketplace-banner"
        source={{ uri: source }}
        recyclingKey={source}
        contentFit="cover"
        cachePolicy="memory-disk"
        onError={() => setFailed(requested)}
        style={{
          width: '100%',
          aspectRatio: marketplaceArt.aspectRatio,
          backgroundColor: theme.layer.raised.fill,
        }}
      />
      <View
        style={{
          marginTop: -(profile ? marketplaceArt.profileOverlap : marketplaceArt.cardOverlap),
          marginHorizontal: space.x5,
          alignSelf: 'flex-start',
          padding: marketplaceArt.avatarEdge,
          borderRadius: radius.round,
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <Image
          testID="marketplace-avatar"
          source={{ uri: marketplaceAvatar(bot) }}
          contentFit="contain"
          cachePolicy="memory"
          style={{ width: size, height: size, borderRadius: radius.round }}
        />
      </View>
    </View>
  );
}
