import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import type { ColorRole } from '../design/theme';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { ChevronDownIcon } from '../shell/icons';
import { t } from '../strings';
import { bubbleRow, bubbleShape, type BubbleGroup } from './bubble-shape';

export type CardLineTone = 'success' | 'danger' | 'subtle';

function Frame({ children }: { children: ReactNode }) {
  return <View style={{ paddingHorizontal: space.x4, paddingTop: space.x3 }}>{children}</View>;
}

function StatusPill({ label }: { label: string }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        borderRadius: radius.round,
        backgroundColor: theme.color.warningSoft,
        paddingHorizontal: space.x4,
        paddingVertical: space.x1,
      }}
    >
      <Text variant="meta" strong tone="warning">
        {label}
      </Text>
    </View>
  );
}

function Details({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: space.x3 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.details}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        hitSlop={space.x3}
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x2,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text variant="meta" tone="muted" strong>
          {t.details}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDownIcon color={theme.color.muted} size={theme.type.meta.size} />
        </View>
      </Pressable>
      {open ? (
        <View
          style={{
            backgroundColor: theme.layer.well.fill,
            borderRadius: radius.md,
            padding: space.x4,
            gap: space.x4,
          }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useDesignTheme();
  return (
    <View style={{ gap: space.x1 }}>
      {label === '' ? null : (
        <Text variant="meta" tone="muted">
          {label}
        </Text>
      )}
      <Text selectable variant="meta" style={{ fontFamily: theme.mono }}>
        {value}
      </Text>
    </View>
  );
}

export function ActionCard({
  category,
  status,
  title,
  preview,
  details,
  focused = false,
  error,
  busy = false,
  wide = false,
  children,
}: {
  category: string;
  status?: string;
  title: string;
  preview?: ReactNode;
  details?: ReactNode;
  focused?: boolean;
  error?: string;
  busy?: boolean;
  wide?: boolean;
  children?: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <Frame>
      <View
        testID="action-card"
        style={{
          width: wide ? '100%' : '92%',
          backgroundColor: theme.layer.raised.fill,
          borderRadius: radius.lg,
          borderWidth: focused ? edge.focus : 0,
          borderColor: theme.color.accent,
          padding: space.x5,
          gap: space.x4,
        }}
      >
        <View style={{ gap: space.x2 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: space.x4,
            }}
          >
            <Text strong style={{ flexShrink: 1 }}>
              {category}
            </Text>
            {status === undefined ? null : <StatusPill label={status} />}
          </View>
          <Text selectable>{title}</Text>
        </View>
        {preview}
        {details === undefined ? null : <Details>{details}</Details>}
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
  group = { first: true, last: true },
}: {
  text: string;
  tone: CardLineTone;
  focused?: boolean;
  group?: BubbleGroup;
}) {
  const theme = useDesignTheme();
  const dot: ColorRole = tone;
  return (
    <View style={bubbleRow(group.first)}>
      <View
        testID="card-line"
        accessibilityLabel={text}
        style={{
          ...bubbleShape(false, group),
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          backgroundColor: theme.color.surface,
          borderWidth: focused ? edge.focus : 0,
          borderColor: theme.color.accent,
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
        <Text tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

export function CardButtons({ children, stack = false }: { children: ReactNode; stack?: boolean }) {
  return (
    <View
      style={stack ? { gap: space.x3 } : { flexDirection: 'row', flexWrap: 'wrap', gap: space.x3 }}
    >
      {children}
    </View>
  );
}
