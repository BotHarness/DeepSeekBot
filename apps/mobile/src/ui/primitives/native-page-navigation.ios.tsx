import { HeaderHeightContext, getDefaultHeaderHeight } from 'expo-router/react-navigation';
import { useId, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import {
  Screen,
  ScreenStack,
  ScreenStackHeaderConfig,
  ScreenStackHeaderLeftView,
  type HeaderBarButtonItem,
} from 'react-native-screens';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTheme } from '../design/theme';
import { glassPress } from '../design/tokens';
import { HeaderBackButton } from '../chat/header-chrome';
import { glassHeader, headerIslands } from '../chat/header-kind';
import { useStrings } from '../strings';

export function NativePageNavigation({ children }: { children: ReactNode }) {
  const id = useId();
  const theme = useDesignTheme();
  const frame = useSafeAreaFrame();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(() => getDefaultHeaderHeight(frame, false, insets.top));
  return (
    <HeaderHeightContext value={height}>
      <ScreenStack style={{ flex: 1 }}>
        <Screen
          screenId={id}
          enabled
          isNativeStack
          activityState={2}
          gestureEnabled={false}
          style={StyleSheet.absoluteFill}
          onHeaderHeightChange={({ nativeEvent }) => {
            if (nativeEvent.headerHeight > 0) setHeight(nativeEvent.headerHeight);
          }}
          statusBarStyle={theme.scheme === 'dark' ? 'light' : 'dark'}
          scrollEdgeEffects={
            glassHeader
              ? { top: 'automatic', bottom: 'hidden', left: 'automatic', right: 'automatic' }
              : undefined
          }
        >
          {children}
        </Screen>
      </ScreenStack>
    </HeaderHeightContext>
  );
}

export function NativePageHeader({
  title,
  onBack,
  backID,
}: {
  title?: ReactNode;
  onBack(): void;
  backID: string;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  const items: HeaderBarButtonItem[] = headerIslands
    ? []
    : [
        {
          type: 'button',
          index: 0,
          title: '',
          icon: { type: 'sfSymbol', name: 'chevron.left' },
          onPress: onBack,
          identifier: backID,
          accessibilityLabel: t.back,
          sharesBackground: false,
        },
      ];
  if (title !== undefined) items.push({ type: 'spacing', spacing: glassPress.gap });
  return (
    <ScreenStackHeaderConfig
      title=""
      translucent
      backgroundColor="transparent"
      hideShadow
      hideBackButton
      color={theme.color.fg}
      headerLeftBarButtonItems={items}
    >
      {headerIslands ? (
        <ScreenStackHeaderLeftView>
          <HeaderBackButton plain={false} onPress={onBack} />
        </ScreenStackHeaderLeftView>
      ) : null}
      {title === undefined ? null : <ScreenStackHeaderLeftView>{title}</ScreenStackHeaderLeftView>}
    </ScreenStackHeaderConfig>
  );
}
