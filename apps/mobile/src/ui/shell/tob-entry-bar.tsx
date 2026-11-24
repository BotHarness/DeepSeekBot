import { Link, router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { composerBar, ComposerFieldMaterial } from '../chat/composer-chrome';
import { pressTint, useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { MicIcon, PlusIcon } from './icons';
import { useChromeHidden, useTabChrome } from './tab-chrome';
import { tobEntryOrigin } from './tob-entry-origin';
import type { TobModeHref } from './tob-mode-model';

export function tobEntryBarHeight(theme: ReturnType<typeof useDesignTheme>): number {
  return composerBar(theme);
}

export function TobEntryBar({ href, name }: { href: TobModeHref; name: string }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const chrome = useTabChrome();
  const hidden = useChromeHidden(chrome?.hidden);
  const bar = useRef<ComponentRef<typeof Pressable>>(null);
  const [height, setHeight] = useState(tobEntryBarHeight(theme));
  const bottom = (chrome?.islandTop ?? 0) + space.x3;
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: (chrome?.hidden.value ?? 0) * (bottom + height) }],
  }));
  const ios = Platform.OS === 'ios';
  const icon = theme.type.title.line;
  const open = () => {
    bar.current?.measureInWindow((x, y, width, measured) => {
      tobEntryOrigin.set(width > 0 ? { x, y, width, height: measured } : undefined);
      router.push(href);
    });
  };
  const body = (
    <Pressable
      ref={bar}
      testID="tob-entry-bar"
      accessibilityRole="button"
      accessibilityLabel={t.tobEntry(name)}
      accessibilityHint={t.tobEntryHint}
      onPress={ios ? undefined : open}
      onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
      android_ripple={{ color: pressTint(theme.color.fg), foreground: true }}
      style={{
        minHeight: Math.max(theme.touch, tobEntryBarHeight(theme)),
        paddingVertical: space.x2,
        borderRadius: height / 2,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingHorizontal: space.x4,
      }}
    >
      <ComposerFieldMaterial cornerRadius={height / 2} />
      <PlusIcon color={theme.color.subtle} size={icon} />
      <Text tone="subtle" numberOfLines={1} style={{ flex: 1 }}>
        {t.tobEntry(name)}
      </Text>
      <MicIcon color={theme.color.subtle} size={icon} />
    </Pressable>
  );
  return (
    <Animated.View
      {...(ios
        ? {
            accessible: true,
            accessibilityRole: 'button' as const,
            accessibilityLabel: t.tobEntry(name),
            accessibilityHint: t.tobEntryHint,
            testID: 'tob-entry',
          }
        : {})}
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[
        {
          position: 'absolute',
          left: insets.left + space.x5,
          right: insets.right + space.x5,
          bottom,
        },
        slide,
      ]}
    >
      {ios ? (
        <Link href={href} asChild>
          <Link.AppleZoom>{body}</Link.AppleZoom>
        </Link>
      ) : (
        body
      )}
    </Animated.View>
  );
}
