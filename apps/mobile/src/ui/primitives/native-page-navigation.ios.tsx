import { HeaderHeightContext, getDefaultHeaderHeight } from 'expo-router/react-navigation';
import { useId, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import {
  Screen,
  ScreenStack,
  ScreenStackHeaderConfig,
  ScreenStackHeaderLeftView,
  ScreenStackHeaderRightView,
  type HeaderBarButtonItem,
} from 'react-native-screens';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTheme } from '../design/theme';
import { glassPress } from '../design/tokens';
import { ChatHeaderActions } from '../chat/chat-header-actions';
import { HeaderBackButton } from '../chat/header-chrome';
import { glassHeader, headerIslands } from '../chat/header-kind';
import { useStrings } from '../strings';
import type { NativePageHeaderProps } from './native-page-navigation';

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

export function NativePageHeader({ title, onBack, backID, action, call }: NativePageHeaderProps) {
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
  const grouped = call !== undefined && action !== undefined;
  const glassGroup = glassHeader && grouped;
  const right: HeaderBarButtonItem[] = [];
  if (action !== undefined && !glassGroup)
    right.push({
      type: 'button',
      index: right.length,
      title: '',
      icon: { type: 'sfSymbol', name: 'ellipsis' },
      identifier: action.testID,
      accessibilityLabel: action.label,
      onPress: action.onPress,
      sharesBackground: grouped,
    });
  if (call !== undefined && !glassGroup)
    right.push({
      type: 'button',
      index: right.length,
      title: '',
      icon: { type: 'sfSymbol', name: 'phone' },
      identifier: call.testID,
      accessibilityLabel: call.label,
      onPress: call.onPress,
      sharesBackground: grouped,
    });
  return (
    <ScreenStackHeaderConfig
      title=""
      translucent
      backgroundColor="transparent"
      hideShadow
      hideBackButton
      color={theme.color.fg}
      headerLeftBarButtonItems={items}
      headerRightBarButtonItems={right}
    >
      {headerIslands ? (
        <ScreenStackHeaderLeftView>
          <HeaderBackButton plain={false} onPress={onBack} />
        </ScreenStackHeaderLeftView>
      ) : null}
      {title === undefined ? null : <ScreenStackHeaderLeftView>{title}</ScreenStackHeaderLeftView>}
      {glassGroup && call !== undefined && action !== undefined ? (
        <ScreenStackHeaderRightView hidesSharedBackground>
          <ChatHeaderActions
            actions={[
              { icon: 'call', label: call.label, testID: call.testID, onPress: call.onPress },
              { icon: 'more', label: action.label, testID: action.testID, onPress: action.onPress },
            ]}
          />
        </ScreenStackHeaderRightView>
      ) : null}
    </ScreenStackHeaderConfig>
  );
}
