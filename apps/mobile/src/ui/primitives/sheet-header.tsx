import type { NativeStackHeaderProps } from 'expo-router/native-stack';
import { createContext, useContext } from 'react';
import { Platform, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { DrawerHeader, type DrawerHeaderProps } from './drawer-header';
import { SystemSheet } from './system-sheet';

export const SheetFramed = createContext(false);

export function SheetHeader(props: DrawerHeaderProps) {
  const theme = useDesignTheme();
  const framed = useContext(SheetFramed);
  const system = useContext(SystemSheet);
  return (
    <View
      testID="sheet-header"
      collapsable={false}
      style={{
        paddingHorizontal: space.x5,
        paddingTop: framed ? 0 : Platform.OS === 'ios' ? space.x4 : space.x3,
        paddingBottom: space.x3,
        backgroundColor: system ? undefined : theme.overlay.fill,
      }}
    >
      <DrawerHeader
        {...(Platform.OS === 'android' && theme.largeText ? {} : { titleLines: 1 })}
        {...props}
      />
    </View>
  );
}

export function sheetStackHeader(close: () => void) {
  return function SheetStackHeader({ navigation, options, route }: NativeStackHeaderProps) {
    const root = navigation.getState().routes[0]?.key === route.key;
    const trailing = options.headerRight?.({ canGoBack: !root });
    return (
      <SheetHeader
        title={typeof options.title === 'string' ? options.title : route.name}
        {...(trailing === undefined || trailing === null ? {} : { trailing })}
        {...(!root
          ? { onBack: () => navigation.goBack() }
          : Platform.OS === 'ios'
            ? { onClose: close }
            : {})}
      />
    );
  };
}
