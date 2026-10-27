import type { ComponentType, ReactNode } from 'react';
import { View } from 'react-native';

import type { LayerName } from '../design/layers';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { DrawerHeader } from '../primitives/drawer-header';
import { useStrings } from '../strings';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SheetFrame } from './sheet-frame';

export const SHEET_GROUP: LayerName = 'raised';

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
  animationType = 'fade',
}: {
  page?: ComponentType<SheetPageProps> | undefined;
  visible: boolean;
  label: string;
  title?: string;
  subtitle?: string;
  onClose(): void;
  children: ReactNode;
  avoidKeyboard?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
}) {
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
    <SheetFrame
      visible={visible}
      label={label}
      onClose={onClose}
      avoidKeyboard={avoidKeyboard}
      animationType={animationType}
    >
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
    </SheetFrame>
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
  const t = useStrings();
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
