import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';

import { useDesignTheme } from '../design/theme';
import { edge, profileShell, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';

export type HeroBanner = { source: string; headers?: Record<string, string> | undefined };

export function ProfileHero({
  banner,
  avatar,
  name,
  children,
}: {
  banner?: HeroBanner | undefined;
  avatar: ReactNode;
  name: string;
  children?: ReactNode;
}) {
  const theme = useDesignTheme();
  const { width } = useWindowDimensions();
  return (
    <View
      testID="profile-identity"
      pointerEvents="box-none"
      style={{ gap: space.x3, paddingHorizontal: space.x5, paddingBottom: space.x4 }}
    >
      <View
        pointerEvents="box-none"
        style={{
          minHeight: (width - space.x5 * 2) / profileShell.bannerAspect,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: space.x3,
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        {banner === undefined ? null : (
          <Image
            pointerEvents="none"
            testID="profile-banner"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            source={{
              uri: banner.source,
              ...(banner.headers === undefined ? {} : { headers: banner.headers }),
            }}
            recyclingKey={banner.source}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
        )}
        <View
          pointerEvents="box-none"
          style={{
            padding: profileShell.avatarEdge,
            borderRadius: radius.round,
            backgroundColor: theme.overlay.fill,
          }}
        >
          {avatar}
        </View>
        <View
          pointerEvents="box-none"
          style={{
            marginTop: -profileShell.chipOverlap,
            maxWidth: '90%',
            paddingHorizontal: space.x3,
            paddingVertical: space.x1,
            borderRadius: radius.round,
            borderWidth: edge.hairline,
            borderColor: theme.color.border,
            backgroundColor: theme.overlay.fill,
          }}
        >
          <Text
            pointerEvents="none"
            testID="profile-name"
            accessibilityRole="header"
            strong
            style={{ textAlign: 'center' }}
          >
            {name}
          </Text>
        </View>
      </View>
      {children === undefined ? null : (
        <View pointerEvents="box-none" style={{ alignItems: 'center', gap: space.x2 }}>
          {children}
        </View>
      )}
    </View>
  );
}
