import type { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LayerName } from '../design/layers';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { CloseIcon } from '../shell/icons';
import { t } from '../strings';

export const SHEET_GROUP: LayerName = 'raised';

function Grabber() {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        alignSelf: 'center',
        width: space.x6 + space.x3,
        height: space.x2,
        borderRadius: radius.round,
        backgroundColor: theme.layer.canvas.selected,
        marginBottom: space.x3,
      }}
    />
  );
}

function CloseButton({ onPress }: { onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.close}
      onPress={onPress}
      hitSlop={space.x3}
      style={({ pressed }) => ({
        width: theme.type.title.line + space.x4,
        height: theme.type.title.line + space.x4,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.round,
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      <CloseIcon color={theme.color.muted} size={theme.type.meta.line} />
    </Pressable>
  );
}

export function Sheet({
  visible,
  label,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  label: string;
  title?: string;
  subtitle?: string;
  onClose(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible ? (
        <View
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: theme.scrim,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.cancel}
            onPress={onClose}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
          />
          <View
            accessibilityViewIsModal
            accessibilityLabel={label}
            onAccessibilityEscape={onClose}
            style={{
              maxHeight: height - insets.top - theme.touch,
              backgroundColor: theme.layer.canvas.fill,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              paddingTop: space.x3,
              paddingBottom: Math.max(insets.bottom, space.x5),
              overflow: 'hidden',
            }}
          >
            <Grabber />
            {title === undefined ? null : (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.x4,
                  paddingHorizontal: space.x5,
                  paddingBottom: space.x4,
                }}
              >
                <View style={{ flex: 1, gap: space.x1 }}>
                  <Text variant="title" strong accessibilityRole="header" numberOfLines={1}>
                    {title}
                  </Text>
                  {subtitle === undefined ? null : (
                    <Text variant="meta" tone="muted" numberOfLines={2}>
                      {subtitle}
                    </Text>
                  )}
                </View>
                <CloseButton onPress={onClose} />
              </View>
            )}
            {children}
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

export function SheetNote({
  children,
  tone = 'muted',
}: {
  children: string;
  tone?: 'muted' | 'warning' | 'danger';
}) {
  return (
    <Text
      variant="meta"
      tone={tone}
      accessibilityLiveRegion={tone === 'muted' ? undefined : 'polite'}
      style={{ paddingHorizontal: space.x5, paddingVertical: space.x2 }}
    >
      {children}
    </Text>
  );
}

export function SheetCallout({ children, tone }: { children: string; tone: 'warning' | 'danger' }) {
  const theme = useDesignTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginHorizontal: space.x5,
        marginBottom: space.x4,
        paddingHorizontal: space.x4,
        paddingVertical: space.x3,
        borderRadius: radius.md,
        backgroundColor: tone === 'warning' ? theme.color.warningSoft : theme.layer.canvas.danger,
      }}
    >
      <Text variant="meta" tone={tone === 'warning' ? 'fg' : 'danger'}>
        {children}
      </Text>
    </View>
  );
}

export function SheetHeading({ children }: { children: string }) {
  return (
    <Text
      variant="meta"
      tone="muted"
      accessibilityRole="header"
      style={{
        paddingHorizontal: space.x5 + space.x5,
        paddingTop: space.x5,
        paddingBottom: space.x3,
      }}
    >
      {children}
    </Text>
  );
}

export function SheetFooter({ children }: { children: string }) {
  return (
    <Text
      variant="meta"
      tone="muted"
      style={{ paddingHorizontal: space.x5 + space.x5, paddingTop: space.x3 }}
    >
      {children}
    </Text>
  );
}

export function SheetLoading() {
  return (
    <View style={{ padding: space.x6, alignItems: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}

export function SheetFailed({
  message,
  onRetry,
  on = 'canvas',
}: {
  message: string;
  onRetry(): void;
  on?: LayerName;
}) {
  return (
    <View style={{ gap: space.x3, padding: space.x5, alignItems: 'flex-start' }}>
      <Text tone="danger">{message}</Text>
      <Button label={t.tryAgain} on={on} onPress={onRetry} />
    </View>
  );
}

export function SheetActions({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: space.x3,
        paddingHorizontal: space.x5,
        paddingTop: space.x4,
      }}
    >
      {children}
    </View>
  );
}
