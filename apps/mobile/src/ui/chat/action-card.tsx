import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import type { ColorRole } from '../design/theme';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { ChevronRightIcon } from '../shell/icons';

export type CardLineTone = 'success' | 'danger' | 'subtle';

function Frame({ children }: { children: ReactNode }) {
  return <View style={{ paddingHorizontal: space.x4, paddingTop: space.x3 }}>{children}</View>;
}

export function ActionCard({
  eyebrow,
  title,
  explanation,
  preview,
  focused = false,
  error,
  busy = false,
  children,
}: {
  eyebrow: string;
  title: string;
  explanation?: string;
  preview?: ReactNode;
  focused?: boolean;
  error?: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <Frame>
      <View
        testID="action-card"
        style={{
          maxWidth: '92%',
          alignSelf: 'flex-start',
          backgroundColor: theme.color.surface,
          borderRadius: radius.lg,
          borderWidth: focused ? edge.focus : edge.hairline,
          borderColor: focused ? theme.color.accent : theme.color.border,
          padding: space.x5,
          gap: space.x4,
        }}
      >
        <View style={{ gap: space.x2 }}>
          <Text variant="meta" tone="muted" strong>
            {eyebrow}
          </Text>
          <Text selectable variant="title">
            {title}
          </Text>
          {explanation === undefined ? null : (
            <Text selectable variant="meta" tone="muted">
              {explanation}
            </Text>
          )}
        </View>
        {preview}
        {busy ? <ActivityIndicator /> : children}
        {error === undefined ? null : (
          <Text accessibilityRole="alert" variant="meta" tone="danger">
            {error}
          </Text>
        )}
      </View>
    </Frame>
  );
}

export function CardLine({
  text,
  tone,
  focused = false,
}: {
  text: string;
  tone: CardLineTone;
  focused?: boolean;
}) {
  const theme = useDesignTheme();
  const dot: ColorRole = tone;
  return (
    <Frame>
      <View
        testID="card-line"
        accessibilityLabel={text}
        style={{
          maxWidth: '92%',
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          backgroundColor: theme.color.surface,
          borderRadius: radius.md,
          borderWidth: focused ? edge.focus : 0,
          borderColor: theme.color.accent,
          paddingHorizontal: space.x4,
          paddingVertical: space.x3,
        }}
      >
        <View
          style={{
            width: space.x3,
            height: space.x3,
            borderRadius: radius.round,
            backgroundColor: theme.color[dot],
          }}
        />
        <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {text}
        </Text>
      </View>
    </Frame>
  );
}

export function CardButtons({ children }: { children: ReactNode }) {
  return <View style={{ gap: space.x3 }}>{children}</View>;
}

export function CardLink({ label, onPress }: { label: string; onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={space.x3}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text variant="meta" strong>
        {label}
      </Text>
      <ChevronRightIcon color={theme.color.muted} size={theme.type.meta.size} />
    </Pressable>
  );
}
