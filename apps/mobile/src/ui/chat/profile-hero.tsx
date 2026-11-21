import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { useDesignTheme } from '../design/theme';
import { edge, profileShell, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';

export type HeroBanner = { source: string; headers?: Record<string, string> | undefined };

export function ProfileHero({
  banner,
  avatar,
  name,
  editName,
  editBanner,
  children,
}: {
  banner?: HeroBanner | undefined;
  avatar: ReactNode;
  name: string;
  editBanner?: { label: string; onPress(): void } | undefined;
  editName?: { label: string; onPress(): void } | undefined;
  children?: ReactNode;
}) {
  const theme = useDesignTheme();
  const { width } = useWindowDimensions();
  const nameChip: ViewStyle = {
    marginTop: -profileShell.chipOverlap,
    maxWidth: '90%',
    paddingHorizontal: space.x3,
    paddingVertical: space.x1,
    borderRadius: radius.round,
    borderWidth: edge.hairline,
    borderColor: theme.color.border,
    backgroundColor: theme.overlay.fill,
  };
  const bannerImage = banner && (
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
      style={StyleSheet.absoluteFill}
    />
  );
  const title = (
    <Text
      pointerEvents="none"
      testID="profile-name"
      accessibilityRole={editName ? undefined : 'header'}
      strong
      style={{ textAlign: 'center' }}
    >
      {name}
    </Text>
  );
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
        {editBanner ? (
          <Pressable
            testID="profile-banner-edit"
            accessibilityRole="button"
            accessibilityLabel={editBanner.label}
            onPress={editBanner.onPress}
            style={({ pressed }) => [StyleSheet.absoluteFill, { opacity: pressed ? 0.7 : 1 }]}
          >
            {bannerImage}
          </Pressable>
        ) : (
          bannerImage
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
        {editName ? (
          <Pressable
            testID="profile-name-edit"
            accessibilityRole="button"
            accessibilityLabel={editName.label}
            onPress={editName.onPress}
            style={({ pressed }) => [
              nameChip,
              {
                minWidth: theme.touch,
                minHeight: theme.touch,
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {title}
          </Pressable>
        ) : (
          <View pointerEvents="box-none" style={nameChip}>
            {title}
          </View>
        )}
      </View>
      {children === undefined ? null : (
        <View pointerEvents="box-none" style={{ alignItems: 'center', gap: space.x2 }}>
          {children}
        </View>
      )}
    </View>
  );
}
