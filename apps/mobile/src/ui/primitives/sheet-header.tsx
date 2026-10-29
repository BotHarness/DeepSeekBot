import type { NativeStackHeaderProps } from 'expo-router/native-stack';
import { Platform, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { DrawerHeader, type DrawerHeaderProps } from './drawer-header';

export function SheetHeader(props: DrawerHeaderProps) {
  const theme = useDesignTheme();
  return (
    <View
      testID="sheet-header"
      collapsable={false}
      style={{
        paddingHorizontal: space.x5,
        paddingTop: Platform.OS === 'ios' ? space.x4 : space.x3,
        paddingBottom: space.x3,
        backgroundColor: theme.overlay.fill,
      }}
    >
      <DrawerHeader titleLines={1} {...props} />
    </View>
  );
}

export function sheetStackHeader(close: () => void) {
  return function SheetStackHeader({ navigation, options, route }: NativeStackHeaderProps) {
    const root = navigation.getState().routes[0]?.key === route.key;
    return (
      <SheetHeader
        title={typeof options.title === 'string' ? options.title : route.name}
        {...(!root
          ? { onBack: () => navigation.goBack() }
          : Platform.OS === 'ios'
            ? { onClose: close }
            : {})}
      />
    );
  };
}
