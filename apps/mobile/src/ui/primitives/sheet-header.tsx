import { Platform, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { DrawerHeader, type DrawerHeaderProps } from './drawer-header';

export function SheetHeader(props: DrawerHeaderProps) {
  const theme = useDesignTheme();
  return (
    <View
      testID="sheet-header"
      style={{
        zIndex: 1,
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
