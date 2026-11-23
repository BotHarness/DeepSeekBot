import type { ReactNode } from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { materialSearchHeight } from '../design/material-search';
import { useDesignTheme } from '../design/theme';
import { space, tabHeader } from '../design/tokens';

export function TabPageHeader({
  leading,
  actions,
  testID,
  onLayout,
}: {
  leading: ReactNode;
  actions?: ReactNode;
  testID: string;
  onLayout?: ((event: LayoutChangeEvent) => void) | undefined;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const stacked = theme.largeText && actions != null;
  const contentHeight =
    Platform.OS === 'android' ? materialSearchHeight(theme.fontScale) : theme.touch;
  return (
    <View
      testID={testID}
      onLayout={onLayout}
      style={{
        backgroundColor: theme.color.base,
        paddingTop: insets.top + space.x2,
        paddingBottom: space.x2,
        paddingLeft: insets.left + tabHeader.gutter,
        paddingRight: insets.right + tabHeader.gutter,
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'stretch' : 'center',
        gap: space.x2,
        minHeight: insets.top + contentHeight + space.x2 * 2,
      }}
    >
      <View style={{ flex: stacked ? undefined : 1, minWidth: 0 }}>{leading}</View>
      {actions == null ? null : (
        <View
          style={{
            flexDirection: 'row',
            alignSelf: stacked ? 'flex-end' : undefined,
            gap: space.x2,
          }}
        >
          {actions}
        </View>
      )}
    </View>
  );
}
