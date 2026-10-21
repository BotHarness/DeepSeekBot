import type { ComponentType, ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import type { LayerName } from '../design/layers';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { SheetGrabber } from '../primitives/sheet-grabber';
import { DrawerHeader } from '../primitives/drawer-header';
import { t } from '../strings';
import { LoadingIndicator } from '../primitives/loading-indicator';

export const SHEET_GROUP: LayerName = 'raised';

function Grabber() {
  return (
    <View style={{ alignSelf: 'center', marginBottom: space.x3 }}>
      <SheetGrabber />
    </View>
  );
}

export interface SheetPageProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}

export function Sheet({
  page: Page,
  visible,
  label,
  title,
  subtitle,
  onClose,
  children,
  avoidKeyboard = false,
}: {
  page?: ComponentType<SheetPageProps> | undefined;
  visible: boolean;
  label: string;
  title?: string;
  subtitle?: string;
  onClose(): void;
  children: ReactNode;
  avoidKeyboard?: boolean;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  if (Page !== undefined)
    return visible ? (
      <Page
        {...(title === undefined ? {} : { title })}
        {...(subtitle === undefined ? {} : { subtitle })}
      >
        {children}
      </Page>
    ) : null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible ? (
        <KeyboardAvoidingView
          behavior="padding"
          enabled={avoidKeyboard}
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
              backgroundColor: theme.overlay.fill,
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
                  paddingHorizontal: space.x5,
                  paddingBottom: space.x4,
                }}
              >
                <DrawerHeader
                  title={title}
                  {...(subtitle === undefined ? {} : { subtitle })}
                  onClose={onClose}
                />
              </View>
            )}
            {children}
          </View>
        </KeyboardAvoidingView>
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
      <LoadingIndicator />
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
  const theme = useDesignTheme();
  return (
    <View
      style={{
        flexDirection: theme.largeText ? 'column' : 'row',
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
